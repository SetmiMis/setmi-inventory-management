-- Excel import support: one database function that checks every row and, when asked,
-- creates all valid items in a single transaction (all or nothing, or "skip invalid rows").
-- The app parses the Excel file; this function is the final judge of every row.

-- Barcode generation without a permission check, for use inside other trusted functions only.
create or replace function public._generate_item_barcode(p_item uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_existing text;
  v_body text;
  v_code text;
begin
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
  return v_code;
end $$;
revoke all on function public._generate_item_barcode(uuid) from public, anon, authenticated;

-- Same behaviour as before for users: needs items.edit, idempotent, logged when new.
create or replace function public.generate_item_barcode(p_item uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_had boolean;
  v_code text;
begin
  if not public.has_permission('items.edit') then
    raise exception 'missing permission: items.edit' using errcode = '42501';
  end if;
  if not exists (select 1 from public.items where id = p_item) then
    raise exception 'item not found';
  end if;
  select exists (select 1 from public.item_barcodes where item_id = p_item and is_generated) into v_had;
  v_code := public._generate_item_barcode(p_item);
  if not v_had then
    insert into public.audit_log (actor, action, entity, entity_id, details)
    values ((select auth.uid()), 'GENERATE_BARCODE', 'items', p_item::text, jsonb_build_object('barcode', v_code));
  end if;
  return v_code;
end $$;

-- p_rows: array of {row, internal_item_code, import_item_code, item_name, selling_item_name,
--                   category, purchase_source, remarks, barcodes: [text]}
create or replace function public.import_items(
  p_rows jsonb,
  p_dry_run boolean default true,
  p_skip_invalid boolean default false,
  p_generate_barcodes boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_total int;
  v_errors jsonb;
  v_valid int;
  v_new_cats jsonb;
  v_can_cat boolean;
  v_cats_created int := 0;
  v_items_created int := 0;
begin
  if not public.has_permission('items.import') then
    raise exception 'missing permission: items.import' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total = 0 then raise exception 'no rows to import'; end if;
  if v_total > 2000 then raise exception 'at most 2000 rows per import'; end if;
  v_can_cat := public.has_permission('categories.manage');

  drop table if exists pg_temp._imp;
  drop table if exists pg_temp._imp_bc;
  drop table if exists pg_temp._imp_err;

  -- idx is unique per payload; rown is the row number shown to the user.
  create temp table _imp on commit drop as
  select r.ordinality::int as idx,
         coalesce(case when (r.value->>'row') ~ '^[0-9]{1,9}$' then (r.value->>'row')::int end, r.ordinality::int) as rown,
         btrim(coalesce(r.value->>'internal_item_code', '')) as code,
         nullif(btrim(coalesce(r.value->>'import_item_code', '')), '') as imp,
         btrim(coalesce(r.value->>'item_name', '')) as name,
         nullif(btrim(coalesce(r.value->>'selling_item_name', '')), '') as sell,
         nullif(btrim(coalesce(r.value->>'category', '')), '') as cat,
         upper(btrim(coalesce(r.value->>'purchase_source', ''))) as src,
         nullif(btrim(coalesce(r.value->>'remarks', '')), '') as remarks,
         case when jsonb_typeof(r.value->'barcodes') = 'array' then r.value->'barcodes' else '[]'::jsonb end as bcs
  from jsonb_array_elements(p_rows) with ordinality as r(value, ordinality);

  create temp table _imp_bc on commit drop as
  select distinct i.idx, btrim(b.v) as barcode
  from pg_temp._imp i, jsonb_array_elements_text(i.bcs) as b(v)
  where btrim(b.v) <> '';

  create temp table _imp_err (idx int, field text, message text) on commit drop;

  -- 1. each row on its own
  insert into pg_temp._imp_err select idx, 'Internal_Item_Code', 'Missing' from pg_temp._imp where code = '';
  insert into pg_temp._imp_err select idx, 'Internal_Item_Code', 'Longer than 120 characters' from pg_temp._imp where length(code) > 120;
  insert into pg_temp._imp_err select idx, 'Item_Name', 'Missing' from pg_temp._imp where name = '';
  insert into pg_temp._imp_err select idx, 'Item_Name', 'Longer than 200 characters' from pg_temp._imp where length(name) > 200;
  insert into pg_temp._imp_err select idx, 'Selling_Item_Name', 'Longer than 200 characters' from pg_temp._imp where length(sell) > 200;
  insert into pg_temp._imp_err select idx, 'Import_item_code', 'Longer than 64 characters' from pg_temp._imp where length(imp) > 64;
  insert into pg_temp._imp_err select idx, 'Item_Category', 'Longer than 100 characters' from pg_temp._imp where length(cat) > 100;
  insert into pg_temp._imp_err select idx, 'Remarks', 'Longer than 2000 characters' from pg_temp._imp where length(remarks) > 2000;
  insert into pg_temp._imp_err select idx, 'Item_Purchase_Source', 'Must be LOCAL or IMPORT' from pg_temp._imp where src not in ('LOCAL', 'IMPORT');
  insert into pg_temp._imp_err select idx, 'BARCODE', 'Barcode "' || barcode || '" is longer than 64 characters' from pg_temp._imp_bc where length(barcode) > 64;

  -- 2. against what is already in the system
  insert into pg_temp._imp_err
    select i.idx, 'Internal_Item_Code', 'Already exists in the system'
    from pg_temp._imp i join public.items it on lower(btrim(it.internal_item_code)) = lower(i.code)
    where i.code <> '';
  insert into pg_temp._imp_err
    select i.idx, 'Import_item_code', 'Already exists in the system'
    from pg_temp._imp i join public.items it on lower(btrim(it.import_item_code)) = lower(i.imp)
    where i.imp is not null;
  insert into pg_temp._imp_err
    select b.idx, 'BARCODE', 'Barcode "' || b.barcode || '" already belongs to an item'
    from pg_temp._imp_bc b join public.item_barcodes ib on ib.barcode = b.barcode;

  -- 3. against other rows of the same file (the later row is the one flagged)
  insert into pg_temp._imp_err
    select idx, 'Internal_Item_Code', 'Same code as an earlier row in this file'
    from (select idx, row_number() over (partition by lower(code) order by idx) as rn
          from pg_temp._imp where code <> '') x where rn > 1;
  insert into pg_temp._imp_err
    select idx, 'Import_item_code', 'Same import code as an earlier row in this file'
    from (select idx, row_number() over (partition by lower(imp) order by idx) as rn
          from pg_temp._imp where imp is not null) x where rn > 1;
  insert into pg_temp._imp_err
    select idx, 'BARCODE', 'Barcode "' || barcode || '" is used by an earlier row in this file'
    from (select idx, barcode, row_number() over (partition by barcode order by idx) as rn
          from pg_temp._imp_bc) x where rn > 1;

  -- 4. categories: a new name needs the right to create categories
  if not v_can_cat then
    insert into pg_temp._imp_err
      select i.idx, 'Item_Category', 'New category "' || i.cat || '" needs the categories.manage permission'
      from pg_temp._imp i
      where i.cat is not null
        and not exists (select 1 from public.categories c where lower(btrim(c.name)) = lower(i.cat));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('row', i.rown, 'field', e.field, 'message', e.message)
                            order by i.rown, e.field), '[]'::jsonb)
    into v_errors
    from pg_temp._imp_err e join pg_temp._imp i on i.idx = e.idx;

  select count(*) into v_valid from pg_temp._imp where idx not in (select idx from pg_temp._imp_err);

  select coalesce(jsonb_agg(q.c order by q.c), '[]'::jsonb) into v_new_cats
    from (select distinct on (lower(i.cat)) i.cat as c
          from pg_temp._imp i
          where i.cat is not null
            and i.idx not in (select idx from pg_temp._imp_err)
            and not exists (select 1 from public.categories c where lower(btrim(c.name)) = lower(i.cat))
          order by lower(i.cat), i.idx) q;

  -- preview only, or errors present and the user did not choose "skip invalid rows"
  if p_dry_run or (jsonb_array_length(v_errors) > 0 and not p_skip_invalid) or v_valid = 0 then
    return jsonb_build_object(
      'ok', jsonb_array_length(v_errors) = 0, 'dry_run', p_dry_run, 'total', v_total,
      'valid', v_valid, 'errors', v_errors, 'new_categories', v_new_cats, 'created', 0);
  end if;

  -- write everything
  insert into public.categories (name) select c from jsonb_array_elements_text(v_new_cats) as c;
  get diagnostics v_cats_created = row_count;

  insert into public.items (internal_item_code, import_item_code, item_name, selling_item_name,
                            category_id, purchase_source, remarks)
  select i.code, i.imp, i.name, coalesce(i.sell, i.name),
         (select c.id from public.categories c where lower(btrim(c.name)) = lower(i.cat)),
         i.src::public.purchase_source, i.remarks
  from pg_temp._imp i
  where i.idx not in (select idx from pg_temp._imp_err)
  order by i.idx;
  get diagnostics v_items_created = row_count;

  insert into public.item_barcodes (item_id, barcode, created_by)
  select it.id, b.barcode, (select auth.uid())
  from pg_temp._imp_bc b
  join pg_temp._imp i on i.idx = b.idx
  join public.items it on lower(btrim(it.internal_item_code)) = lower(i.code)
  where b.idx not in (select idx from pg_temp._imp_err);

  if p_generate_barcodes then
    perform public._generate_item_barcode(it.id)
    from pg_temp._imp i
    join public.items it on lower(btrim(it.internal_item_code)) = lower(i.code)
    where i.idx not in (select idx from pg_temp._imp_err)
    order by i.idx;
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'IMPORT_ITEMS', 'items', null,
          jsonb_build_object('rows', v_total, 'created', v_items_created, 'skipped', v_total - v_valid,
                             'categories_created', v_cats_created, 'generated_barcodes', p_generate_barcodes));

  return jsonb_build_object(
    'ok', true, 'dry_run', false, 'total', v_total, 'valid', v_valid, 'created', v_items_created,
    'categories_created', v_cats_created, 'skipped', v_total - v_valid, 'errors', v_errors,
    'new_categories', '[]'::jsonb);
end $$;

revoke all on function public.import_items(jsonb, boolean, boolean, boolean) from public, anon;
grant execute on function public.import_items(jsonb, boolean, boolean, boolean) to authenticated;
