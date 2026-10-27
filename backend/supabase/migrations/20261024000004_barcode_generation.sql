-- Barcode generation: internal EAN-13 numbers that start with 2 (the range reserved for
-- in-store use, so they cannot clash with a manufacturer's barcode).
-- Format: '2' + 11-digit running number (from a sequence) + check digit = 13 digits.

create sequence public.item_barcode_seq as bigint minvalue 1 maxvalue 99999999999 start 1;
revoke all on sequence public.item_barcode_seq from public, anon, authenticated;

alter table public.item_barcodes add column is_generated boolean not null default false;

-- EAN-13 check digit for the first 12 digits.
create or replace function public.ean13_check_digit(p_first12 text)
returns int language plpgsql immutable set search_path = '' as $$
declare
  total int := 0;
  i int;
begin
  if p_first12 is null or p_first12 !~ '^[0-9]{12}$' then
    raise exception 'ean13_check_digit needs exactly 12 digits';
  end if;
  for i in 1..12 loop
    total := total + substr(p_first12, i, 1)::int * case when i % 2 = 0 then 3 else 1 end;
  end loop;
  return (10 - (total % 10)) % 10;
end $$;

-- Gives the item its generated barcode. Safe to call twice: returns the existing one.
-- Security definer because end users have no right on the sequence; the permission is
-- checked here instead (items.edit).
create or replace function public.generate_item_barcode(p_item uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_existing text;
  v_body text;
  v_code text;
begin
  if not public.has_permission('items.edit') then
    raise exception 'missing permission: items.edit' using errcode = '42501';
  end if;
  if not exists (select 1 from public.items where id = p_item) then
    raise exception 'item not found';
  end if;

  -- One at a time per item, so a double click can never create two generated barcodes.
  perform pg_advisory_xact_lock(hashtextextended(p_item::text, 0));

  select barcode into v_existing
    from public.item_barcodes where item_id = p_item and is_generated limit 1;
  if found then
    return v_existing;
  end if;

  v_body := '2' || lpad(nextval('public.item_barcode_seq')::text, 11, '0');
  v_code := v_body || public.ean13_check_digit(v_body)::text;

  insert into public.item_barcodes (item_id, barcode, is_generated, created_by)
  values (p_item, v_code, true, (select auth.uid()));

  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'GENERATE_BARCODE', 'items', p_item::text, jsonb_build_object('barcode', v_code));

  return v_code;
end $$;

revoke all on function public.ean13_check_digit(text) from public, anon;
revoke all on function public.generate_item_barcode(uuid) from public, anon;
grant execute on function public.generate_item_barcode(uuid) to authenticated;
