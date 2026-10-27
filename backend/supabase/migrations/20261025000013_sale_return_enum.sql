-- A new enum value must be committed before it can be used, so it gets its own migration.
-- SALE_RETURN: stock that comes back into a place when a bill is voided.
alter type public.stock_movement_type add value if not exists 'SALE_RETURN';
