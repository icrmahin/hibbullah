-- Grant the missing read privilege on the new products column.
--
-- 20261012000000 added `products.low_stock_threshold` but never granted
-- SELECT on it. The products table deliberately has no table-wide SELECT
-- (cost_price must stay private), so every readable column carries its own
-- column grant. Without this one, any client `select` that includes
-- low_stock_threshold -- which is every product read, because
-- PRODUCT_PUBLIC_COLUMNS lists it -- fails with
--   permission denied for table products
-- for both anon and authenticated. The column-level grant is the fix.

grant select (low_stock_threshold) on public.products to anon, authenticated;

-- A rebuilt project runs the same statement; this comment exists so a future
-- migration that adds a public products column remembers the grant, not just
-- the column. verify-thresholds.mjs fails if this grant is missing.
