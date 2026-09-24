-- INV-01: single-invoice rule — append to existing PENDING order instead of creating new ORD-
-- Rule: user = x orders multiple products from one account → all add into one single invoice (PENDING)
-- After client accepts (status != PENDING, e.g. CONFIRMED via transition_order_status), next checkout creates separated invoice
create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
returns uuid
security definer
set search_path = public
as $$
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
begin
  select name into v_customer_name from public.profiles where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  if not exists (select 1 from public.cart_items where user_id = p_customer_id) then
    raise exception 'Cart is empty';
  end if;

  select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, '')
    into v_address_text from public.addresses where id = p_address_id;
  if v_address_text is null then
    v_address_text := '';
  end if;

  -- Check for existing PENDING invoice for this customer (row-level lock to prevent race)
  select id, subtotal, discount, delivery_fee into v_existing_id, v_existing_subtotal, v_existing_discount, v_existing_delivery_fee
  from public.orders
  where customer_id = p_customer_id and status = 'PENDING'
  order by created_at desc
  limit 1
  for update;

  -- Validate cart items and compute cart subtotal
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    if v_product.stock < v_cart_item.quantity then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;
    v_cart_subtotal := v_cart_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;

  if v_existing_id is not null then
    -- Append to existing PENDING invoice
    v_order_id := v_existing_id;
    -- Insert new order_items into existing order
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
      update public.products set stock = stock - v_cart_item.quantity where id = v_cart_item.product_id;
    end loop;
    -- Recalc totals: subtotal + cart, keep single delivery fee
    v_subtotal := coalesce(v_existing_subtotal, 0) + v_cart_subtotal;
    v_total := v_subtotal - coalesce(v_existing_discount, 0) + coalesce(v_existing_delivery_fee, v_delivery_fee);
    update public.orders
    set subtotal = v_subtotal,
        total = v_total,
        updated_at = now(),
        -- Optionally update address to latest if provided
        address = case when v_address_text <> '' then v_address_text else address end,
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
      update public.products set stock = stock - v_cart_item.quantity where id = v_cart_item.product_id;
    end loop;
  end if;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;
$$ language plpgsql;
