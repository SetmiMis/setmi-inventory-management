-- Add Product page: extra OPTIONAL fields on items, 6 images, and three real switches.
--  * show_in_sales = false     -> save_sales_order refuses the item
--  * show_in_purchase = false  -> save_purchase_order refuses the item
--  * low_stock_alert = false   -> the item is never "low" in stock_overview (dashboard, bell, low stock report)
--                                 and is left out of reorder_suggestions.
-- HSN is only stored (no tax calculation).

alter table public.items
  add column sub_category text check (sub_category is null or char_length(sub_category) <= 100),
  add column brand text check (brand is null or char_length(brand) <= 100),
  add column hsn_code text check (hsn_code is null or char_length(hsn_code) <= 20),
  add column short_description text check (short_description is null or char_length(short_description) <= 500),
  add column detailed_description text check (detailed_description is null or char_length(detailed_description) <= 2000),
  add column product_type text check (product_type is null or char_length(product_type) <= 100),
  add column material text check (material is null or char_length(material) <= 100),
  add column color text check (color is null or char_length(color) <= 100),
  add column net_weight numeric check (net_weight is null or (net_weight >= 0 and net_weight <= 99999999)),
  add column weight_unit text check (weight_unit is null or weight_unit in ('g', 'kg')),
  add column dim_l numeric check (dim_l is null or (dim_l >= 0 and dim_l <= 99999999)),
  add column dim_w numeric check (dim_w is null or (dim_w >= 0 and dim_w <= 99999999)),
  add column dim_h numeric check (dim_h is null or (dim_h >= 0 and dim_h <= 99999999)),
  add column dim_unit text check (dim_unit is null or dim_unit in ('mm', 'cm', 'm', 'in')),
  add column country_of_origin text check (country_of_origin is null or char_length(country_of_origin) <= 100),
  add column model_no text check (model_no is null or char_length(model_no) <= 100),
  add column tags text[] not null default '{}' check (cardinality(tags) <= 20),
  add column search_keywords text check (search_keywords is null or char_length(search_keywords) <= 500),
  add column shelf_life text check (shelf_life is null or char_length(shelf_life) <= 100),
  add column show_in_sales boolean not null default true,
  add column show_in_purchase boolean not null default true,
  add column low_stock_alert boolean not null default true;

alter table public.items drop constraint items_image_paths_check;
alter table public.items add constraint items_image_paths_check check (cardinality(image_paths) <= 6);

-- low stock: a switched-off item is never low
create or replace view public.stock_overview as
 select i.id as item_id, i.internal_item_code, i.item_name, i.selling_item_name, i.unit,
        l.id as location_id,
        coalesce(b.quantity, 0::numeric) as quantity,
        rl.min_qty, rl.max_qty,
        i.low_stock_alert and rl.min_qty is not null and rl.min_qty > 0::numeric and coalesce(b.quantity, 0::numeric) < rl.min_qty as is_low
   from public.items i
     cross join public.locations l
     left join public.stock_balances b on b.item_id = i.id and b.location_id = l.id
     left join public.reorder_levels rl on rl.item_id = i.id and rl.location_id = l.id
  where i.is_active and l.is_active and l.type <> 'TRANSIT'::public.location_type
    and (select public.has_permission('stock.view'::text));

-- reorder list: leave out items with the low stock alert switched off
do $$
declare d text; d2 text;
begin
  select pg_get_functiondef('public.reorder_suggestions(uuid,integer)'::regprocedure) into d;
  d2 := replace(d, 'where (p_location is null or so.location_id = p_location)
  ), calc as', 'where (p_location is null or so.location_id = p_location)
       and i.low_stock_alert
  ), calc as');
  if d2 = d then raise exception 'reorder_suggestions patch did not apply'; end if;
  execute d2;
end $$;

-- sales orders: refuse items switched off for sales
do $$
declare d text; d2 text;
begin
  select pg_get_functiondef('public.save_sales_order(uuid,jsonb,jsonb)'::regprocedure) into d;
  d2 := replace(d, 'for x in select (e->>''item_id'')::uuid as item_id from jsonb_array_elements(p_lines) e group by 1 having count(*) > 1 loop',
'for x in select i.id as item_id, i.internal_item_code as code from public.items i join jsonb_to_recordset(p_lines) as t(item_id uuid) on t.item_id = i.id where not i.show_in_sales loop
    v_errors := v_errors || jsonb_build_object(''item_id'', x.item_id, ''code'', x.code, ''message'', ''This item is switched off for sales orders'');
  end loop;
  for x in select (e->>''item_id'')::uuid as item_id from jsonb_array_elements(p_lines) e group by 1 having count(*) > 1 loop');
  if d2 = d then raise exception 'save_sales_order patch did not apply'; end if;
  execute d2;
end $$;

-- purchase orders: refuse items switched off for purchase
do $$
declare d text; d2 text;
begin
  select pg_get_functiondef('public.save_purchase_order(uuid,jsonb,jsonb)'::regprocedure) into d;
  d2 := replace(d, 'for x in select (e->>''item_id'')::uuid as item_id, count(*) as n',
'for x in select i.id as item_id, i.internal_item_code as code from public.items i join jsonb_to_recordset(p_lines) as t(item_id uuid) on t.item_id = i.id where not i.show_in_purchase loop
    v_errors := v_errors || jsonb_build_object(''item_id'', x.item_id, ''code'', x.code, ''message'', ''This item is switched off for purchase orders'');
  end loop;
  for x in select (e->>''item_id'')::uuid as item_id, count(*) as n');
  if d2 = d then raise exception 'save_purchase_order patch did not apply'; end if;
  execute d2;
end $$;
