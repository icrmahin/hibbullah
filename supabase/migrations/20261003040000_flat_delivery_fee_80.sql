-- Flat ৳80 delivery for every district.
--
-- The district split (80 inside Dhaka, 150 outside) is retired: one rate for the
-- whole country. delivery_fee_for_district() stays the single owner of the rule
-- and create_order keeps calling it, so the only change is what the "outside"
-- constant returns. verify:sql-sync reads the rate out of this file by function
-- name, so the function names do not change either.
create or replace function public.outside_dhaka_delivery_fee()
returns numeric language sql immutable as $fn$ select 80::numeric $fn$;

comment on function public.delivery_fee_for_district(text) is
  'The single owner of the delivery pricing rule. Flat 80 for every district while delivery is Dhaka-only. Must stay identical to deliveryFeeForDistrict() in src/utils/deliveryFee.ts; verify:sql-sync fails if the two drift.';

-- New orders always get the fee written explicitly by create_order, but the
-- column default is the backstop for any other writer: keep it on the rate.
alter table public.orders alter column delivery_fee set default 80;

-- ── Re-price PENDING orders quoted under the old split rate ────────────────────
-- Every PENDING order still carrying 150 was quoted before this change. There are
-- none expected today, but the repair runs unconditionally so an order that was
-- mid-checkout at deploy time is also corrected. Only rows that change move
-- `updated_at`, so the timestamp keeps meaning "something happened here".
update public.orders
set delivery_fee = 80,
    total = coalesce(subtotal, 0) - coalesce(discount, 0) + 80,
    updated_at = now()
where status = 'PENDING'
  and delivery_fee is distinct from 80;
