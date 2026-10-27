-- Quality Check (owner's mock). A quality check is a RECORD about one POSTED goods receipt (GRN): for every receipt line the
-- inspector writes how many pieces passed, were rejected or need rework (together = the received quantity), with a reason for
-- rejected / rework pieces. One receipt has at most one quality check; it can be edited again later (the audit log keeps history).
-- IT DOES NOT TOUCH STOCK: stock is added when the GRN is posted, as before. Rejected goods are removed by a stock adjustment.
-- Status is not typed by hand, it follows the numbers: Pending (not inspected yet), Rejected (any piece rejected), Rework (none
-- rejected, some rework), Passed (all passed).
-- All writes go through the functions below (no direct table writes). To see checks a person needs qc.view or qc.manage AND
-- permission to see the receipt (receipts.view ...), so place rules of the receipt apply.

insert into public.permissions (key, module, description) values
  ('qc.view',   'purchasing', 'See quality checks of your locations'),
  ('qc.manage', 'purchasing', 'Start a quality check on a posted receipt and record its results')
on conflict (key) do nothing;

create sequence public.quality_check_seq;
revoke all on sequence public.quality_check_seq from public, anon, authenticated;

create table public.quality_checks (
  id             uuid primary key default gen_random_uuid(),
  qc_no          text not null unique default ('QC-' || to_char((now() at time zone 'Asia/Kolkata'), 'YYYY') || '-' || lpad(nextval('public.quality_check_seq')::text, 3, '0')),
  receipt_id     uuid not null unique references public.goods_receipts (id) on delete restrict,
  qc_date        date,
  remarks        text check (remarks is null or char_length(remarks) <= 1000),
  inspected_at   timestamptz,
  inspected_by   uuid references public.profiles (id),
  inspector_name text check (inspector_name is null or char_length(inspector_name) <= 120),
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) default auth.uid(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id)
);
create index quality_checks_created_idx on public.quality_checks (created_at desc);
alter table public.quality_checks enable row level security;
create trigger quality_checks_updated_at before update on public.quality_checks for each row execute function public.set_updated_at();
create trigger quality_checks_audit after insert or update or delete on public.quality_checks for each row execute function public.log_audit();

create table public.quality_check_lines (
  id              bigint generated always as identity primary key,
  qc_id           uuid not null references public.quality_checks (id) on delete cascade,
  receipt_line_id bigint not null references public.goods_receipt_lines (id) on delete restrict,
  passed          numeric(14,3) not null default 0 check (passed >= 0),
  rejected        numeric(14,3) not null default 0 check (rejected >= 0),
  rework          numeric(14,3) not null default 0 check (rework >= 0),
  reason          text check (reason is null or char_length(reason) <= 200),
  constraint quality_check_lines_one_per_line unique (qc_id, receipt_line_id)
);
alter table public.quality_check_lines enable row level security;
create trigger quality_check_lines_audit after insert or update or delete on public.quality_check_lines for each row execute function public.log_audit();

create policy quality_checks_select on public.quality_checks for select to authenticated
  using (((select public.has_permission('qc.view')) or (select public.has_permission('qc.manage')))
         and exists (select 1 from public.goods_receipts r where r.id = quality_checks.receipt_id));
create policy quality_check_lines_select on public.quality_check_lines for select to authenticated
  using (exists (select 1 from public.quality_checks q where q.id = quality_check_lines.qc_id));
revoke all on public.quality_checks, public.quality_check_lines from anon, authenticated;
grant select on public.quality_checks, public.quality_check_lines to authenticated;

-- ---------- start a check on a posted receipt ----------
create or replace function public.create_quality_check(p_receipt_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_loc uuid; v_status public.receipt_status; v_id uuid; v_no text;
begin
  if not public.has_permission('qc.manage') then
    raise exception 'missing permission: qc.manage' using errcode = '42501';
  end if;
  select location_id, status into v_loc, v_status from public.goods_receipts where id = p_receipt_id;
  if not found then raise exception 'Goods receipt not found'; end if;
  if not public.can_access_location(v_loc) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if v_status <> 'POSTED' then raise exception 'Only a posted goods receipt can be quality checked'; end if;
  if exists (select 1 from public.quality_checks where receipt_id = p_receipt_id) then raise exception 'This goods receipt already has a quality check'; end if;
  insert into public.quality_checks (receipt_id) values (p_receipt_id) returning id, qc_no into v_id, v_no;
  insert into public.quality_check_lines (qc_id, receipt_line_id) select v_id, id from public.goods_receipt_lines where receipt_id = p_receipt_id;
  return jsonb_build_object('id', v_id, 'qc_no', v_no);
end $$;
revoke execute on function public.create_quality_check(uuid) from public, anon;
grant execute on function public.create_quality_check(uuid) to authenticated;

-- ---------- record (or change) the results ----------
-- p_lines: [{receipt_line_id, passed, rejected, rework, reason}]. Every receipt line must be there once and
-- passed + rejected + rework must equal the received quantity. A reason is needed for rejected or rework pieces.
create or replace function public.save_quality_check_results(p_id uuid, p_date date, p_remarks text, p_lines jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_receipt uuid; v_loc uuid; v_today date := (now() at time zone 'Asia/Kolkata')::date; v_name text;
  v_n int; v_total int; x record; v_dec smallint; v_qty numeric; v_err text;
begin
  if not public.has_permission('qc.manage') then
    raise exception 'missing permission: qc.manage' using errcode = '42501';
  end if;
  select q.receipt_id, r.location_id into v_receipt, v_loc
    from public.quality_checks q join public.goods_receipts r on r.id = q.receipt_id where q.id = p_id for update of q;
  if not found then raise exception 'Quality check not found'; end if;
  if not public.can_access_location(v_loc) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if p_date is null or p_date > v_today then raise exception 'Choose a QC date that is not in the future'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a JSON array'; end if;
  v_n := jsonb_array_length(p_lines);
  select count(*) into v_total from public.goods_receipt_lines where receipt_id = v_receipt;
  if v_n <> v_total or (select count(distinct t.receipt_line_id) from jsonb_to_recordset(p_lines) as t(receipt_line_id bigint)) <> v_total then
    raise exception 'Give a result for every item of the receipt, once';
  end if;

  for x in select t.receipt_line_id, t.passed, t.rejected, t.rework, nullif(btrim(coalesce(t.reason, '')), '') as reason
             from jsonb_to_recordset(p_lines) as t(receipt_line_id bigint, passed numeric, rejected numeric, rework numeric, reason text) loop
    select gl.quantity, u.decimals into v_qty, v_dec
      from public.goods_receipt_lines gl join public.items i on i.id = gl.item_id join public.units u on u.code = i.unit
     where gl.id = x.receipt_line_id and gl.receipt_id = v_receipt;
    if not found then raise exception 'An item is not on this receipt'; end if;
    if x.passed is null or x.rejected is null or x.rework is null or x.passed < 0 or x.rejected < 0 or x.rework < 0 then
      raise exception 'Quantities cannot be negative';
    end if;
    if x.passed <> round(x.passed, v_dec) or x.rejected <> round(x.rejected, v_dec) or x.rework <> round(x.rework, v_dec) then
      raise exception 'A quantity has too many decimals for its unit';
    end if;
    if x.passed + x.rejected + x.rework <> v_qty then
      raise exception 'Passed + rejected + rework must equal the received quantity (%)', trim_scale(v_qty);
    end if;
    if (x.rejected > 0 or x.rework > 0) and x.reason is null then
      raise exception 'Write a reason for the rejected or rework items';
    end if;
    if x.reason is not null and char_length(x.reason) > 200 then raise exception 'A reason is too long (max 200)'; end if;
  end loop;

  select coalesce(nullif(btrim(full_name), ''), split_part(email, '@', 1)) into v_name from public.profiles where id = auth.uid();
  update public.quality_check_lines l set passed = t.passed, rejected = t.rejected, rework = t.rework,
         reason = case when t.rejected > 0 or t.rework > 0 then nullif(btrim(t.reason), '') end
    from jsonb_to_recordset(p_lines) as t(receipt_line_id bigint, passed numeric, rejected numeric, rework numeric, reason text)
   where l.qc_id = p_id and l.receipt_line_id = t.receipt_line_id;
  update public.quality_checks set qc_date = p_date, remarks = nullif(btrim(coalesce(p_remarks, '')), ''), inspected_at = now(),
         inspected_by = auth.uid(), inspector_name = left(v_name, 120), updated_by = auth.uid() where id = p_id;
end $$;
revoke execute on function public.save_quality_check_results(uuid, date, text, jsonb) from public, anon;
grant execute on function public.save_quality_check_results(uuid, date, text, jsonb) to authenticated;

-- ---------- the screen ----------
-- p_status: all | PENDING | PASSED | REJECTED | REWORK
create or replace function public.quality_checks_page(
  p_q text default null, p_location uuid default null, p_supplier uuid default null, p_status text default null,
  p_from date default null, p_to date default null, p_limit int default 10, p_offset int default 0
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_like text;
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_result jsonb;
begin
  if not (public.has_permission('qc.view') or public.has_permission('qc.manage')) then
    raise exception 'You do not have permission to see quality checks' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('', 'all', 'PENDING', 'PASSED', 'REJECTED', 'REWORK') then
    raise exception 'Unknown status filter' using errcode = 'P0001';
  end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select q.id, q.qc_no, q.qc_date, q.created_at, q.inspector_name,
           coalesce(q.qc_date, (q.created_at at time zone 'Asia/Kolkata')::date) as shown_date,
           r.id as receipt_id, r.receipt_no, o.id as po_id, o.po_no,
           l.id as location_id, l.name as place_name, s.id as supplier_id, s.name as supplier_name,
           coalesce(t.items, 0) as items, coalesce(t.passed, 0) as passed, coalesce(t.rejected, 0) as rejected, coalesce(t.rework, 0) as rework,
           case when q.inspected_at is null then 'PENDING' when coalesce(t.rejected, 0) > 0 then 'REJECTED' when coalesce(t.rework, 0) > 0 then 'REWORK' else 'PASSED' end as status
      from public.quality_checks q
      join public.goods_receipts r on r.id = q.receipt_id
      join public.suppliers s on s.id = r.supplier_id
      join public.locations l on l.id = r.location_id
      left join public.purchase_orders o on o.id = r.purchase_order_id
      left join (select ql.qc_id, count(*) as items, sum(ql.passed) as passed, sum(ql.rejected) as rejected, sum(ql.rework) as rework
                   from public.quality_check_lines ql group by ql.qc_id) t on t.qc_id = q.id
  ),
  filtered as (
    select b.* from base b
     where (p_location is null or b.location_id = p_location)
       and (p_supplier is null or b.supplier_id = p_supplier)
       and (coalesce(p_status, '') in ('', 'all') or b.status = p_status)
       and (p_from is null or b.shown_date >= p_from)
       and (p_to is null or b.shown_date <= p_to)
       and (coalesce(p_q, '') = '' or b.qc_no ilike v_like or b.receipt_no ilike v_like or b.po_no ilike v_like or b.supplier_name ilike v_like
            or exists (select 1 from public.quality_check_lines ql join public.goods_receipt_lines gl on gl.id = ql.receipt_line_id join public.items i on i.id = gl.item_id
                        where ql.qc_id = b.id and (i.internal_item_code ilike v_like or i.item_name ilike v_like)))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
               from (select * from filtered order by created_at desc, qc_no desc limit v_limit offset v_offset) t),
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.suppliers where is_active),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.locations where is_active and type <> 'TRANSIT'),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'passed', (select count(*) from base where status = 'PASSED'),
      'rejected', (select count(*) from base where status = 'REJECTED'),
      'pending', (select count(*) from base where status = 'PENDING'),
      'rework', (select count(*) from base where status = 'REWORK'),
      'new_month', (select count(*) from base where (created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date)))
  into v_result;
  return v_result;
end $$;
revoke execute on function public.quality_checks_page(text, uuid, uuid, text, date, date, int, int) from public, anon;
grant execute on function public.quality_checks_page(text, uuid, uuid, text, date, date, int, int) to authenticated;
