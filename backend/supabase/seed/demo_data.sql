-- DEMO DATA, DEVELOPMENT ONLY. Run in the Supabase SQL editor as the project owner.
-- Creates: 3 locations (DEMO-WH, DEMO-SHOP1, DEMO-SHOP2), 12 items (codes start with DEMO-) in 2 categories,
-- opening stock, a few minimum levels (some deliberately low), one transfer, one correction, and a
-- SETMI barcode for every demo item. Safe to run twice: it does nothing if DEMO- items already exist.
-- To remove it again run supabase/seed/remove_demo_data.sql.
do $$
declare
  wh uuid; s1 uuid; s2 uuid; c_cab uuid; c_acc uuid; it uuid; r record;
begin
  if exists (select 1 from public.items where internal_item_code like 'DEMO-%') then
    raise notice 'Demo data already loaded, nothing done.';
    return;
  end if;

  insert into public.categories (name) values ('DEMO CABLES'), ('DEMO ACCESSORIES') on conflict do nothing;
  select id into c_cab from public.categories where name = 'DEMO CABLES';
  select id into c_acc from public.categories where name = 'DEMO ACCESSORIES';

  insert into public.locations (code, name, type, address) values ('DEMO-WH', 'Demo main warehouse', 'WAREHOUSE', 'Demo address') returning id into wh;
  insert into public.locations (code, name, type, address) values ('DEMO-SHOP1', 'Demo shop 1', 'SHOP', 'Demo address') returning id into s1;
  insert into public.locations (code, name, type, address) values ('DEMO-SHOP2', 'Demo shop 2', 'SHOP', 'Demo address') returning id into s2;

  for r in
    select * from (values
      -- code, name, unit, category(1 cable, 2 accessory), source, warehouse qty, shop1 qty, shop2 qty, shop minimum
      ('DEMO-HDMI-5M',      'DEMO HDMI CABLE 5 METER',            'PCS', 1, 'LOCAL',  120::numeric,   15::numeric,  8::numeric, 10::numeric),
      ('DEMO-HDMI-10M',     'DEMO HDMI CABLE 10 METER',           'PCS', 1, 'LOCAL',   60,             6,          12,          5),
      ('DEMO-3RCA-1.5M',    'DEMO 3RCA-3RCA CABLE 1.5 METER',     'PCS', 1, 'IMPORT', 200,            25,          30,         10),
      ('DEMO-UHF-PLUG',     'DEMO UHF MALE CONNECTOR PLUG',       'PCS', 2, 'LOCAL',  500,            40,           0,         20),
      ('DEMO-HORN-20W',     'DEMO HORN 20 WATT',                  'PCS', 2, 'LOCAL',   80,            10,           5,          4),
      ('DEMO-EXT-BOARD-4S', 'DEMO EXTENSION BOARD 4 SOCKET',      'PCS', 2, 'LOCAL',   45,             9,           7,          5),
      ('DEMO-SWITCH-JUMBO', 'DEMO JUMBO PUSH PULL SWITCH',        'PCS', 2, 'LOCAL',  150,            20,          18,         10),
      ('DEMO-TWEETER-105B', 'DEMO TWEETER WITHOUT MAGNET 105B',   'PCS', 2, 'IMPORT',  90,            12,           0,          6),
      ('DEMO-COPPER-WIRE',  'DEMO COPPER WIRE (SOLD PER METRE)',  'MTR', 1, 'LOCAL', 1250.5,         85.25,       40,         50),
      ('DEMO-SPEAKER-WIRE', 'DEMO SPEAKER WIRE (SOLD PER METRE)', 'MTR', 1, 'LOCAL',  800,            60,         120.5,       30),
      ('DEMO-CABLE-TIES',   'DEMO CABLE TIES BOX OF 100',         'BOX', 2, 'LOCAL',   40,             6,           4,          3),
      ('DEMO-SOLDER-SET',   'DEMO SOLDERING SET',                 'SET', 2, 'LOCAL',   25,             3,           2,          2)
    ) as t(code, name, unit, cat, src, q_wh, q_s1, q_s2, min_shop)
  loop
    insert into public.items (internal_item_code, item_name, selling_item_name, category_id, purchase_source, unit)
    values (r.code, r.name, r.name, case r.cat when 1 then c_cab else c_acc end, r.src::public.purchase_source, r.unit)
    returning id into it;

    if r.q_wh > 0 then insert into public.stock_movements (item_id, to_location_id, quantity, movement_type, reason) values (it, wh, r.q_wh, 'OPENING', 'Demo opening stock'); end if;
    if r.q_s1 > 0 then insert into public.stock_movements (item_id, to_location_id, quantity, movement_type, reason) values (it, s1, r.q_s1, 'OPENING', 'Demo opening stock'); end if;
    if r.q_s2 > 0 then insert into public.stock_movements (item_id, to_location_id, quantity, movement_type, reason) values (it, s2, r.q_s2, 'OPENING', 'Demo opening stock'); end if;

    insert into public.reorder_levels (item_id, location_id, min_qty) values (it, s1, r.min_shop), (it, s2, r.min_shop);
    perform public._generate_item_barcode(it);
  end loop;

  -- a transfer and a correction, so the history page has something to show
  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason)
    select id, wh, s1, 10, 'TRANSFER', 'Demo: refill shop 1' from public.items where internal_item_code = 'DEMO-HDMI-5M';
  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason)
    select id, s1, null, 2, 'ADJUSTMENT', 'Demo: damaged' from public.items where internal_item_code = 'DEMO-UHF-PLUG';

  raise notice 'Demo data loaded: 3 locations, 12 items.';
end $$;
