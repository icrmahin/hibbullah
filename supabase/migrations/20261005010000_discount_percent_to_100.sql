-- A discount can be the whole price, not 99% of it.
--
-- The form used to ask for three numbers that had to agree by hand: a customer price, an
-- old price and a percentage between 0 and 99. The old price was a separate box nobody
-- tied to the other two, so the cap at 99 protected a relationship nothing actually
-- enforced. The form now asks for one customer price and one percentage and derives the
-- rest, which makes 100% a meaningful entry: a free sample, a give-away, the one way a
-- medicine is deliberately priced at nothing. The column refused it.
--
-- Nothing else about the price moves. `price` is already `>= 0`, `original_price` keeps
-- `>= 0`, and `valid_discount` still requires the pair — this only widens the ceiling.
--
-- Both tables that carry the percentage are widened in the same breath: `order_items`
-- copies the same number onto the receipt, so a product the form would happily save at
-- 100% could not then have been sold.

alter table public.products
  drop constraint if exists products_discount_percent_check;

alter table public.products
  add constraint products_discount_percent_check
  check (discount_percent >= 0 and discount_percent <= 100);

alter table public.order_items
  drop constraint if exists order_items_discount_percent_check;

alter table public.order_items
  add constraint order_items_discount_percent_check
  check (discount_percent >= 0 and discount_percent <= 100);
