-- Task 1 & 4: Enforce expiry during checkout and harden concurrency
-- Do NOT edit old migrations

-- Update create_order to:
-- 1. Only consider non-expired inventory (expiry_date IS NULL OR expiry_date >= current_date) for validation and FIFO
-- 2. Lock inventory rows with FOR UPDATE before validation to prevent concurrent oversell
-- 3. Verify v_remaining == 0 after FIFO loop, otherwise raise insufficient stock (concurrent safety)

create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
returns uuid
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_delivery_fee numeric := 150;
  v_total numeric := 0;
  v_customer_name text;
  v_address_text text;
  v_cart_item record;
  v_product record;
  v_remaining integer;
  v_inv record;
begin
  select name into v_customer_name from public.profiles where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;

  select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, '')
    into v_address_text from public.addresses where id = p_address_id and user_id = p_customer_id;
  if v_address_text is null then
    raise exception 'Invalid address';
  end if;

  if not exists (select 1 from public.cart_items where user_id = p_customer_id) then
    raise exception 'Cart is empty';
  end if;

  -- Lock inventory rows for all products in cart upfront to serialize concurrent checkouts
  -- This ensures validation and deduction see a consistent snapshot
  perform 1 from public.inventory_items
    where product_id in (select product_id from public.cart_items where user_id = p_customer_id)
    for update;

  -- Validate stock and calculate subtotal using ONLY non-expired inventory
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    declare
      v_total_stock integer;
    begin
      select coalesce(sum(quantity), 0) into v_total_stock
        from public.inventory_items
        where product_id = v_cart_item.product_id
          and (expiry_date is null or expiry_date >= current_date);
      -- If no non-expired inventory rows exist but product has no inventory table at all (legacy), fallback to products.stock
      if v_total_stock = 0 and not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
        v_total_stock := v_product.stock;
      end if;
      if v_total_stock < v_cart_item.quantity then
        raise exception 'Insufficient stock for product %', v_product.name;
      end if;
    end;
    v_subtotal := v_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;

  v_total := v_subtotal - v_discount + v_delivery_fee;

  insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address)
  values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY', v_address_text)
  returning id into v_order_id;

  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id;
    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
    values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, coalesce(v_product.discount_percent,0), v_product.price * v_cart_item.quantity);

    -- Deduct from NON-EXPIRED inventory FIFO (NULL expiry = never expires, sorted last but still usable)
    v_remaining := v_cart_item.quantity;
    for v_inv in
      select id, quantity from public.inventory_items
      where product_id = v_cart_item.product_id
        and quantity > 0
        and (expiry_date is null or expiry_date >= current_date)
      order by
        case when expiry_date is null then 1 else 0 end,
        expiry_date asc,
        last_updated asc
      for update
    loop
      exit when v_remaining <= 0;
      if v_inv.quantity >= v_remaining then
        update public.inventory_items set quantity = quantity - v_remaining where id = v_inv.id;
        v_remaining := 0;
      else
        v_remaining := v_remaining - v_inv.quantity;
        update public.inventory_items set quantity = 0 where id = v_inv.id;
      end if;
    end loop;

    -- Concurrent safety: if still remaining, inventory was exhausted between validation and deduction
    if v_remaining > 0 then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;

    -- Legacy fallback if no inventory rows at all
    if not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
      update public.products set stock = stock - v_cart_item.quantity where id = v_cart_item.product_id;
    end if;
  end loop;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;
$$ language plpgsql;
