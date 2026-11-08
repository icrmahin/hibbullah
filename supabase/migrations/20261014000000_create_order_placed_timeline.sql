-- Seed an initial `PLACED` timeline entry when a new order is created.
--
-- `create_order` previously left `orders.timeline` at its default (`'[]'::jsonb`) for a
-- brand-new order, so the first timeline event only appeared on the first status change.
-- This adds one `PLACED` entry at order creation, exactly once per order, inside the same
-- transaction as the rest of order creation (a failure rolls the whole thing back).
--
-- The append-to-existing-PENDING branch is untouched: it records `ITEMS_ADDED` and never
-- rewrites `PLACED`, so a retried or repeated placement cannot duplicate the entry.
--
-- Signature-agnostic drop so the old overload never survives beside the new one.

do $$
declare r record;
begin
  for r in select oid::regprocedure::text as sig
             from pg_proc
            where proname = 'create_order'
              and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

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

  if p_address_id is null then
    raise exception 'Delivery address is required';
  end if;

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

  if btrim(v_address_text) in ('', ',') then
    raise exception 'Delivery address is incomplete';
  end if;

  v_delivery_fee := public.delivery_fee_for_district(v_address_district);

  select id, subtotal, discount into v_existing_id, v_existing_subtotal, v_existing_discount
  from public.orders
  where customer_id = p_customer_id and status = 'PENDING'
  order by created_at desc
  limit 1
  for update;

  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
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
      if exists (select 1 from public.order_items where order_id = v_order_id and product_id = v_cart_item.product_id) then
        update public.order_items
        set quantity = quantity + v_cart_item.quantity,
            total = (quantity + v_cart_item.quantity) * v_product.price
        where order_id = v_order_id and product_id = v_cart_item.product_id;
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
    v_subtotal := coalesce(v_existing_subtotal, 0) + v_cart_subtotal;
    v_total := v_subtotal - coalesce(v_existing_discount, 0) + v_delivery_fee;
    update public.orders
    set subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        total = v_total,
        updated_at = now(),
        address = v_address_text,
        customer_note = coalesce(nullif(btrim(left(p_note, 1000)), ''), customer_note),
        timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('label', 'ITEMS_ADDED', 'time', now()::text, 'note', v_cart_subtotal::text || ' added'))
    where id = v_order_id;
  else
    -- No pending invoice: create new, with an initial PLACED timeline entry.
    v_subtotal := v_cart_subtotal;
    v_total := v_subtotal - v_discount + v_delivery_fee;
    insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address, customer_note, timeline)
    values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY', v_address_text,
            nullif(btrim(left(p_note, 1000)), ''),
            jsonb_build_array(jsonb_build_object('label', 'PLACED', 'time', now()::text, 'note', 'Order placed')))
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

revoke all on function public.create_order(uuid, uuid, text) from public, anon;
grant execute on function public.create_order(uuid, uuid, text) to authenticated;
