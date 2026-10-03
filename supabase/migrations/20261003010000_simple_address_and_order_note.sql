-- Three fields instead of six, and an optional note on the order.
--
-- The address form asked for a label, a street, a city, a district and a postal code to
-- describe one delivery. Two of those (district, postal) existed only to price the fee,
-- and the customer has asked for the simple version: who it is for, where it goes, and a
-- mobile number. This migration is what makes the database agree with that form, plus the
-- note a customer can leave when placing an order.
--
--   1. `addresses.phone` — the mobile saved with the address. Plainly nullable: every
--      address that already exists predates it and must keep working untouched.
--   2. `orders.customer_note` — written only through `create_order`, so a note can only
--      arrive attached to an order actually being placed, never retro-fitted by a client
--      that decides an old order should have had one.
--   3. `create_order` gains an optional `p_note`, and reads an address the way the new
--      form writes it: the whole location in `street`, with `city`/`county`/`postal_code`
--      present only on addresses that still carry them (every pre-existing row). The
--      conditional join below is what keeps those older rows rendering exactly as before
--      while a new one-liner address does not come out as "Road 5, " with a dangling
--      comma.
--
-- The district is no longer collected, so new addresses have none — and a null district
-- has always meant the standard rate inside `delivery_fee_for_district()`, on both the
-- server and the checkout that quotes it. The rule itself does not change here, and the
-- addresses that do carry a district (none of which this migration touches) keep their
-- reduced rate.
--
-- The old two-parameter `create_order(uuid, uuid)` is dropped rather than left standing
-- as an overload: two live definitions of the charging rule would let a caller reach the
-- old one simply by omitting `p_note`, and then the figure checkout quoted and the
-- figure charged would come from different bodies with nothing to say so.

alter table public.addresses add column phone text;
alter table public.orders add column customer_note text;

create or replace function public.create_order(p_customer_id uuid, p_address_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
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
  v_order_item_id uuid;
  v_total_stock integer;
begin
  -- This took p_customer_id on trust, so a caller could name a different customer and
  -- have the ownership check further down validate that wrong pair. The app only ever
  -- passes the signed-in user's own id, so requiring that costs nothing and closes
  -- the impersonation.
  if auth.uid() is distinct from p_customer_id then
    raise exception 'Customer ID must match authenticated user';
  end if;
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
  --
  -- Each piece is joined only when it is actually present. The new form writes the whole
  -- location into `street` and leaves `city` empty; older rows split it across both. A
  -- naive `street || ', ' || city` would stamp a trailing ", " onto every new order's
  -- address, which is then what the rider and the admin read.
  select btrim(street) ||
         case when btrim(city) <> '' then ', ' || btrim(city) else '' end ||
         case when county is not null and btrim(county) <> '' then ', ' || btrim(county) else '' end ||
         case when postal_code is not null and btrim(postal_code) <> '' then ', ' || btrim(postal_code) else '' end,
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
        -- The merge means there is no RETURNING clause to read an id from, so it is looked
        -- up. This is the id the allocation is recorded against, which is what makes the
        -- eventual cancel an exact undo rather than a guess.
        select id into v_order_item_id
        from public.order_items
        where order_id = v_order_id and product_id = v_cart_item.product_id;
      else
        insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
        values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity)
        returning id into v_order_item_id;
      end if;
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity, v_order_item_id);
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
        -- A note typed on this submission replaces the stored one; a blank submission
        -- leaves the existing note alone, so adding an item without retyping the note
        -- does not silently drop it.
        customer_note = coalesce(nullif(btrim(left(p_note, 1000)), ''), customer_note),
        timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('label', 'ITEMS_ADDED', 'time', now()::text, 'note', v_cart_subtotal::text || ' added'))
    where id = v_order_id;
  else
    -- No pending invoice: create new as before
    v_subtotal := v_cart_subtotal;
    v_total := v_subtotal - v_discount + v_delivery_fee;
    insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address, customer_note)
    values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY', v_address_text,
            nullif(btrim(left(p_note, 1000)), ''))
    returning id into v_order_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
      values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity)
      returning id into v_order_item_id;
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity, v_order_item_id);
    end loop;
  end if;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;

$fn$;

-- Only one definition of the charging rule survives: the two-parameter body this replaces
-- is dropped so an omitted `p_note` resolves to the function above instead of reaching a
-- superseded copy by overload.
drop function if exists public.create_order(uuid, uuid);

-- The same grants the two-parameter version held: the signed-in customer and nobody else,
-- with the impersonation refusal living in the body rather than in the grant.
revoke all on function public.create_order(uuid, uuid, text) from public, anon;
grant execute on function public.create_order(uuid, uuid, text) to authenticated;
