-- Price delivery by destination district: ৳80 inside Dhaka District, ৳150 outside it.
--
-- One rule, on the server, because the server is what charges the customer. `create_order`
-- writes `delivery_fee` onto the order row and the client only ever *shows* a figure; if
-- the two implementations disagreed, the customer would be quoted one total at checkout
-- and charged another, with no error anywhere in the app to explain it. The order would
-- simply look wrong when it arrived. supabase/verify-sql-sync.mjs compares these literals
-- against src/constants/config.ts so the split cannot open.
--
-- Dhaka District only, not the 13 districts of Dhaka Division. Gazipur and Narayanganj are
-- large and close to the city, but they are genuinely further out, and pricing them at the
-- Dhaka rate would undercharge a large share of orders for the convenience of a wider
-- bracket. Naming the qualifying district as a single value keeps the rule one comparison
-- rather than a list that could later be edited inconsistently in one place and not the
-- other.
--
-- Defaulting to the higher rate is deliberate. An address with no district, a misspelled
-- one, or one saved before the picker existed charges 150. Undercharging 70 on an unknown
-- district is a rounding error; billing every unrecognised address at 80 would be a
-- systematic leak with nothing anywhere able to surface it.
--
-- The `create_order` body below is the definition from
-- 20260927010000_create_order_require_own_address.sql with four changes and nothing else:
-- the district is read out of the address row, the fee is computed from it, the removed
-- `v_existing_delivery_fee` variable is gone, and the append path reprices instead of
-- carrying the old fee forward. Rewriting the function rather than patching it is
-- deliberate -- a migration that only adjusted the fee would leave a second copy of
-- `create_order` in the repo, and two copies of the address guard are how those and this
-- rule would eventually drift apart.

-- The inputs first, as functions rather than bare literals inside the rule, so each value
-- exists in exactly one place and a verify check can read it out by name. They have to be
-- created BEFORE the rule that calls them: a `language sql` body is parsed and validated
-- when the function is created, not on first call, so a rule that references a function
-- defined further down this file fails outright with
-- "function public.inside_dhaka_district() does not exist".
create or replace function public.inside_dhaka_delivery_fee()
returns numeric language sql immutable as $fn$ select 80::numeric $fn$;

create or replace function public.outside_dhaka_delivery_fee()
returns numeric language sql immutable as $fn$ select 150::numeric $fn$;

create or replace function public.inside_dhaka_district()
returns text language sql immutable as $fn$ select 'Dhaka'::text $fn$;

create or replace function public.delivery_fee_for_district(p_district text)
returns numeric
language sql
immutable
as $fn$
  select case
    when lower(btrim(coalesce(p_district, ''))) = lower(btrim(public.inside_dhaka_district()))
      then public.inside_dhaka_delivery_fee()
    else public.outside_dhaka_delivery_fee()
  end
$fn$;

comment on function public.delivery_fee_for_district(text) is
  'The single owner of the delivery pricing rule. Returns 80 for Dhaka District and 150 for every other district, including a null or unrecognised one. Must stay identical to deliveryFeeForDistrict() in src/utils/deliveryFee.ts; verify:sql-sync fails if the two drift.';

create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_order_id uuid;
  v_existing_id uuid;
  v_existing_subtotal numeric;
  v_existing_discount numeric;
  v_subtotal numeric := 0;
  v_cart_subtotal numeric := 0;
  v_discount numeric := 0;
  v_delivery_fee numeric;
  v_total numeric := 0;
  v_customer_name text;
  v_address_text text;
  v_address_district text;
  v_cart_item record;
  v_product record;
  v_inv record;
  v_remaining integer;
  v_total_stock integer;
begin
  select name into v_customer_name from public.profiles where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  if not exists (select 1 from public.cart_items where user_id = p_customer_id) then
    raise exception 'Cart is empty';
  end if;

  -- Refuse a missing address outright rather than defaulting it to an empty string.
  if p_address_id is null then
    raise exception 'Delivery address is required';
  end if;

  -- Ownership is part of the lookup, not a separate check afterwards. SECURITY DEFINER
  -- bypasses RLS on `addresses`, so the `user_id = p_customer_id` predicate here is the
  -- ONLY thing standing between a caller and another customer's address.
  --
  -- An address that does not exist and one that belongs to somebody else are deliberately
  -- reported the same way, so this cannot be used to confirm whether an id is real.
  select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, ''),
         county
    into v_address_text, v_address_district
  from public.addresses
  where id = p_address_id and user_id = p_customer_id;

  if v_address_text is null then
    raise exception 'Delivery address not found';
  end if;

  -- NOT NULL on street/city does not stop an empty string, and the client-side check is
  -- bypassable, so an unusable address is refused here rather than at delivery time.
  if btrim(v_address_text) in ('', ',') then
    raise exception 'Delivery address is incomplete';
  end if;

  -- Priced from the district, not hard-coded. A null or unrecognised district falls to the
  -- standard rate inside delivery_fee_for_district() rather than needing a guard here.
  v_delivery_fee := public.delivery_fee_for_district(v_address_district);

  -- Check for existing PENDING invoice for this customer (row-level lock to prevent race)
  --
  -- `delivery_fee` is deliberately no longer selected out. It used to be read into
  -- `v_existing_delivery_fee` and carried into the recalculated total, which kept the old
  -- charge on an order whose address had changed. The fee is now recomputed from the
  -- address passed to this call, so there is nothing here for the existing row to
  -- contribute.
  select id, subtotal, discount into v_existing_id, v_existing_subtotal, v_existing_discount
  from public.orders
  where customer_id = p_customer_id and status = 'PENDING'
  order by created_at desc
  limit 1
  for update;

  -- Validate cart items and compute cart subtotal (products must exist and be active)
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    -- Authoritative available stock = non-expired inventory sum, falling back to
    -- products.stock only for legacy products with no inventory rows at all.
    select coalesce(sum(quantity), 0) into v_total_stock
    from public.inventory_items
    where product_id = v_cart_item.product_id
      and (expiry_date is null or expiry_date >= current_date);
    if v_total_stock = 0 and not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
      v_total_stock := v_product.stock;
    end if;
    if v_total_stock < v_cart_item.quantity then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;
    v_cart_subtotal := v_cart_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;

  if v_existing_id is not null then
    -- Append to existing PENDING invoice
    v_order_id := v_existing_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      -- Handle duplicate product in same order: merge quantity if already exists
      if exists (select 1 from public.order_items where order_id = v_order_id and product_id = v_cart_item.product_id) then
        update public.order_items
        set quantity = quantity + v_cart_item.quantity,
            total = (quantity + v_cart_item.quantity) * v_product.price
        where order_id = v_order_id and product_id = v_cart_item.product_id;
      else
        insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
        values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity);
      end if;
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity);
    end loop;
    -- Recalc totals: subtotal + cart, one delivery fee.
    --
    -- The fee is REPRICED from the address passed in here, rather than carried over from
    -- the existing order. This line used to read
    -- `coalesce(v_existing_delivery_fee, v_delivery_fee)`, which was harmless while the fee
    -- was a constant and is wrong now: a customer who first ordered to Chattogram and then
    -- added an item while switching to a Dhaka address would keep paying the 150 they were
    -- quoted, against an 80 rate. `delivery_fee` is written explicitly below too, so the
    -- stored row and the new total cannot disagree with each other either.
    v_subtotal := coalesce(v_existing_subtotal, 0) + v_cart_subtotal;
    v_total := v_subtotal - coalesce(v_existing_discount, 0) + v_delivery_fee;
    update public.orders
    set subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        total = v_total,
        updated_at = now(),
        -- Always the address just validated. This used to be
        -- `case when v_address_text <> '' then v_address_text else address end`, which kept
        -- whatever was there before; with the guard above v_address_text is never empty,
        -- so the fallback is dead code that would only ever preserve a stale address.
        address = v_address_text,
        timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('label', 'ITEMS_ADDED', 'time', now()::text, 'note', v_cart_subtotal::text || ' added'))
    where id = v_order_id;
  else
    -- No pending invoice: create new as before
    v_subtotal := v_cart_subtotal;
    v_total := v_subtotal - v_discount + v_delivery_fee;
    insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address)
    values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY', v_address_text)
    returning id into v_order_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
      values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity);
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity);
    end loop;
  end if;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;
$fn$;

comment on function public.create_order(uuid, uuid) is
  'Places an order for the signed-in customer. Requires one of the customer''s own addresses and prices delivery from that address''s district. Reuses and re-prices an existing PENDING order rather than creating a second one.';

-- ── Re-price PENDING orders quoted under the old flat rate ─────────────────────────
-- Every order still sitting at PENDING was quoted the flat 150 before this change and
-- would keep that 150 written on it, so the customer's checkout total would show 80 for a
-- Dhaka address while the order row said 150. There are none today, but the repair runs
-- unconditionally so a database that was mid-checkout at deploy time is also corrected.
--
-- `orders` keeps the rendered address text and not the address id, so the district has to
-- be recovered from that text. create_order builds it as
--
--     street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, '')
--
-- which means the district is always the *third* comma-separated component -- the county
-- slot. Reading it as component 3 rather than searching the whole string for "Dhaka" is
-- what keeps a street called "Dhaka" from being mistaken for the district.
--
-- Where the text has only two components there was no district, and the repair charges the
-- standard rate, which is the safe direction. This is a best-effort repair of pre-existing
-- rows and not the pricing rule: the rule is delivery_fee_for_district() above, and it is
-- what every new and appended order uses.
do $$
declare
  v_row record;
  v_district text;
  v_fee numeric;
begin
  for v_row in
    select id, address
    from public.orders
    where status = 'PENDING' and coalesce(address, '') <> ''
  loop
    v_district := nullif(btrim(split_part(v_row.address, ',', 3)), '');

    v_fee := public.delivery_fee_for_district(v_district);

    update public.orders
    set delivery_fee = v_fee,
        total = coalesce(subtotal, 0) - coalesce(discount, 0) + v_fee,
        updated_at = now()
    where id = v_row.id
      -- Only rewrite a row that actually changes, so `updated_at` keeps meaning
      -- "something happened here" rather than moving on every deploy.
      and delivery_fee is distinct from v_fee;
  end loop;
end;
$$;
