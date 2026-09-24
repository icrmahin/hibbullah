-- cost_price for profit calc: earning = sum((unit_price - cost_price) * qty) last 30d
alter table public.products add column if not exists cost_price numeric(12,2) check (cost_price >= 0);

-- backfill: assume 20% margin if null (cost = price * 0.8)
update public.products set cost_price = round(price * 0.8, 2) where cost_price is null;

-- keep cost_price in sync trigger? leave manual for admin

-- view helper for dashboard (optional, compute in app)
