-- A delivery address is not optional, and it must be the customer's own.
--
-- Three defects, all in create_order, all reachable from the app:
--
--   1. p_address_id = NULL            -> the address text was coerced to '' and the order
--                                         was created anyway. The customer saw no warning
--                                         and the shop had an order with nowhere to send it.
--   2. p_address_id = a non-existent  -> same thing: '' and an order.
--      uuid
--   3. p_address_id = another         -> the address was READ and copied onto the
--      customer's address id            caller's order. This function is SECURITY DEFINER,
--                                        so it reads any addresses row regardless of RLS.
--                                        Anyone who learned an address id could read that
--                                        stranger's street address back out of their own
--                                        order. That is an RLS bypass, not a UX bug.
--
-- The root cause is the `if v_address_text is null then v_address_text := ''` coercion: it
-- turned "no address" into "empty address" instead of refusing. Every failure then looked
-- like success.

create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
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
  v_existing_delivery_fee numeric;
  v_subtotal numeric := 0;
  v_cart_subtotal numeric := 0;
  v_discount numeric := 0;
  v_delivery_fee numeric := 150;
  v_total numeric := 0;
  v_customer_name text;
  v_address_text text;
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
  select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, '')
    into v_address_text
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

  -- Check for existing PENDING invoice for this customer (row-level lock to prevent race)
  select id, subtotal, discount, delivery_fee into v_existing_id, v_existing_subtotal, v_existing_discount, v_existing_delivery_fee
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
    -- Recalc totals: subtotal + cart, keep single delivery fee
    v_subtotal := coalesce(v_existing_subtotal, 0) + v_cart_subtotal;
    v_total := v_subtotal - coalesce(v_existing_discount, 0) + coalesce(v_existing_delivery_fee, v_delivery_fee);
    update public.orders
    set subtotal = v_subtotal,
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

-- ── Cancel orders that were created with no address ────────────────────────────────
-- Any PENDING order with an empty address predates the guard above and can never be
-- delivered. Rather than delete a real order, mark it CANCELLED with the reason in its
-- timeline and tell the customer, so it is not a mystery. Stock was already deducted and
-- the cart already emptied when these were created, so nothing is returned here --
-- reversing that is a bigger judgement call than this migration should make by itself.
--
-- The ids are collected FIRST and the notification is driven off that list. Matching on
-- "address is still empty" after the UPDATE would work on this database and still be
-- wrong: it cannot tell an order this block just cancelled from an old non-PENDING one
-- that happened to have an empty address, and would notify about both.
do $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_ids
  from public.orders
  where btrim(coalesce(address, '')) in ('', ',')
    and status = 'PENDING';

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return;
  end if;

  update public.orders
  set status = 'CANCELLED',
      updated_at = now(),
      timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'label', 'CANCELLED',
        'time', now()::text,
        'note', 'No delivery address was recorded for this order, so it could not be delivered. Please place a new order.'))
  where id = any(v_ids);

  insert into public.notifications (user_id, title, body, type)
  select o.customer_id,
    'Order ' || coalesce(o.order_number, left(o.id::text, 8)) || ' cancelled',
    'We could not deliver this order because no delivery address was recorded. Please add an address and place a new order.',
    'info'
  from public.orders o
  where o.id = any(v_ids)
    and o.customer_id is not null;
end;
$$;
