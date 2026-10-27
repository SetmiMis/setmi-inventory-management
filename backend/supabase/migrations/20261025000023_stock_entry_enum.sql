-- G1: two new movement types for the quick Stock In / Stock Out entry (own migration: a new enum value
-- cannot be used in the same transaction that adds it).
alter type public.stock_movement_type add value if not exists 'STOCK_IN';
alter type public.stock_movement_type add value if not exists 'STOCK_OUT';
