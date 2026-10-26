-- Stock Transfer screen (owner's mock): one call that returns a page of transfers with from / to place, number of items,
-- total quantity sent, status and who made it, plus the top numbers and the lists for the filters.
-- Status words on the screen: Draft, In transit (SENT), Completed (RECEIVED, with a shortage tag when less arrived), Cancelled.
-- Runs as the caller (SECURITY INVOKER): row-level security decides which transfers are visible (those that start or end at the
-- person's places). "Requested by" uses the small helper person_name (First L.), which needs stock.view.
create or replace function public.transfers_page(
  p_q text default null,
  p_from_location uuid default null,
  p_to_location uuid default null,
  p_status text default null,    -- all | DRAFT | SENT | RECEIVED | CANCELLED
  p_from date default null,
  p_to date default null,
  p_limit int default 10,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_like text;
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_result jsonb;
begin
  if not (public.has_permission('transfers.view') or public.has_permission('transfers.create')
          or public.has_permission('transfers.send') or public.has_permission('transfers.receive')) then
    raise exception 'You do not have permission to see transfers' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('', 'all', 'DRAFT', 'SENT', 'RECEIVED', 'CANCELLED') then
    raise exception 'Unknown status filter' using errcode = 'P0001';
  end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select t.id, t.transfer_no, t.status::text as status, t.has_shortage, t.created_at, t.created_by,
           t.from_location_id, t.from_code, t.from_name, t.to_location_id, t.to_code, t.to_name,
           coalesce(s.items, 0) as items, coalesce(s.qty, 0) as qty
      from public.stock_transfers t
      left join (select tl.transfer_id, count(*) as items, sum(tl.quantity_sent) as qty from public.stock_transfer_lines tl group by tl.transfer_id) s on s.transfer_id = t.id
  ),
  filtered as (
    select b.* from base b
     where (p_from_location is null or b.from_location_id = p_from_location)
       and (p_to_location is null or b.to_location_id = p_to_location)
       and (coalesce(p_status, '') in ('', 'all') or b.status = p_status)
       and (p_from is null or (b.created_at at time zone 'Asia/Kolkata')::date >= p_from)
       and (p_to is null or (b.created_at at time zone 'Asia/Kolkata')::date <= p_to)
       and (coalesce(p_q, '') = '' or b.transfer_no ilike v_like or b.from_name ilike v_like or b.to_name ilike v_like
            or exists (select 1 from public.stock_transfer_lines tl join public.items i on i.id = tl.item_id
                        where tl.transfer_id = b.id and (i.internal_item_code ilike v_like or i.item_name ilike v_like)))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc, t.transfer_no desc), '[]'::jsonb)
               from (select f.*, public.person_name(f.created_by) as requested_by
                       from (select * from filtered order by created_at desc, transfer_no desc limit v_limit offset v_offset) f) t),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb)
                 from (select from_location_id as id, from_name as name from base union select to_location_id, to_name from base) p),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'completed', (select count(*) from base where status = 'RECEIVED'),
      'in_transit', (select count(*) from base where status = 'SENT'),
      'cancelled', (select count(*) from base where status = 'CANCELLED'),
      'draft', (select count(*) from base where status = 'DRAFT'),
      'new_month', (select count(*) from base where (created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date)))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.transfers_page(text, uuid, uuid, text, date, date, int, int) from public, anon;
grant execute on function public.transfers_page(text, uuid, uuid, text, date, date, int, int) to authenticated;
