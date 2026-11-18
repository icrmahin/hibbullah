-- Serialize checkout requests per customer and order-status transitions per order.
--
-- The existing SELECT ... FOR UPDATE in create_order only locks a PENDING order
-- when one already exists. It cannot lock the absence of a row, so two first
-- checkouts can both observe no PENDING order and insert two orders.
--
-- A customer-scoped advisory transaction lock is acquired before checking the
-- cart or searching for a pending order. The second request waits for the first
-- transaction to finish, then sees the committed order/cart state.
--
-- transition_order_status previously read status without locking the order row.
-- Concurrent transitions could both validate against the same old status and
-- perform conflicting side effects (especially cancellation stock restoration).
-- FOR UPDATE serializes the read, validation, status write, and any restock work.

-- Make the legacy products.stock fallback atomic as well.
--
-- Products that have inventory batch rows are deducted from those rows above.
-- Legacy products with no inventory rows use products.stock directly. A plain
-- read-then-write decrement could oversell when different customers checked out
-- at the same time, so the stock predicate and decrement must be one UPDATE.

create or replace function public.deduct_inventory_fifo(
  p_product_id uuid,
  p_quantity integer,
  p_order_item_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $
declare
  v_remaining integer := p_quantity;
  v_inv record;
  v_taken integer;
  v_new_stock integer;
begin
  for v_inv in
    select id, quantity
    from public.inventory_items
    where product_id = p_product_id
      and quantity > 0
      and (expiry_date is null or expiry_date >= current_date)
    order by
      case when expiry_date is null then 1 else 0 end,
      expiry_date asc,
      last_updated asc,
      id asc
    for update
  loop
    exit when v_remaining <= 0;

    if v_inv.quantity >= v_remaining then
      v_taken := v_remaining;
      update public.inventory_items
      set quantity = quantity - v_remaining
      where id = v_inv.id;
      v_remaining := 0;
    else
      v_taken := v_inv.quantity;
      v_remaining := v_remaining - v_inv.quantity;
      update public.inventory_items
      set quantity = 0
      where id = v_inv.id;
    end if;

    if p_order_item_id is not null then
      insert into public.order_item_allocations (
        order_item_id, order_id, inventory_item_id, quantity
      )
      values (
        p_order_item_id,
        (select order_id from public.order_items where id = p_order_item_id),
        v_inv.id,
        v_taken
      )
      on conflict (order_item_id, inventory_item_id) do update
      set quantity = public.order_item_allocations.quantity + excluded.quantity;
    end if;
  end loop;

  if v_remaining > 0
     and exists (
       select 1 from public.inventory_items
       where product_id = p_product_id
     )
  then
    raise exception 'Insufficient stock for product';
  end if;

  if v_remaining = p_quantity then
    update public.products
    set stock = stock - p_quantity
    where id = p_product_id
      and stock >= p_quantity
    returning stock into v_new_stock;

    if not found then
      raise exception 'Insufficient stock for product';
    end if;
  end if;
end;
$;

create or replace function public.create_order(
  p_customer_id uuid,
  p_address_id uuid,
  p_note text default null
)
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

  -- This lock protects both the existing-PENDING path and the no-PENDING path.
  -- It also makes simultaneous retries from the same customer observe the cart
  -- deletion performed by the first successful checkout.
  perform pg_advisory_xact_lock(
    hashtextextended('hibbullah:create_order:' || p_customer_id::text, 0)
  );

  select name into v_customer_name
  from public.profiles
  where id = p_customer_id;

  if not found then
    raise exception 'Customer not found';
  end if;

  if not exists (
    select 1 from public.cart_items where user_id = p_customer_id
  ) then
    raise exception 'Cart is empty';
  end if;

  if p_address_id is null then
    raise exception 'Delivery address is required';
  end if;

  select
    btrim(street) ||
      case when btrim(city) <> '' then ', ' || btrim(city) else '' end ||
      case when county is not null and btrim(county) <> '' then ', ' || btrim(county) else '' end ||
      case when postal_code is not null and btrim(postal_code) <> '' then ', ' || btrim(postal_code) else '' end,
    county
  into v_address_text, v_address_district
  from public.addresses
  where id = p_address_id
    and user_id = p_customer_id;

  if v_address_text is null then
    raise exception 'Delivery address not found';
  end if;

  if btrim(v_address_text) in ('', ',') then
    raise exception 'Delivery address is incomplete';
  end if;

  v_delivery_fee := public.delivery_fee_for_district(v_address_district);

  -- Keep the row lock as a second layer of protection for the existing invoice.
  select id, subtotal, discount
  into v_existing_id, v_existing_subtotal, v_existing_discount
  from public.orders
  where customer_id = p_customer_id
    and status = 'PENDING'
  order by created_at desc
  limit 1
  for update;

  for v_cart_item in
    select * from public.cart_items where user_id = p_customer_id order by product_id
  loop
    select * into v_product
    from public.products
    where id = v_cart_item.product_id
      and is_active = true;

    if not found then
      raise exception 'Product not available';
    end if;

    select coalesce(sum(quantity), 0)
    into v_total_stock
    from public.inventory_items
    where product_id = v_cart_item.product_id
      and (expiry_date is null or expiry_date >= current_date);

    if v_total_stock = 0
       and not exists (
         select 1 from public.inventory_items
         where product_id = v_cart_item.product_id
       )
    then
      v_total_stock := v_product.stock;
    end if;

    if v_total_stock < v_cart_item.quantity then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;

    v_cart_subtotal := v_cart_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;

  if v_existing_id is not null then
    v_order_id := v_existing_id;

    for v_cart_item in
      select * from public.cart_items where user_id = p_customer_id order by product_id
    loop
      select * into v_product
      from public.products
      where id = v_cart_item.product_id;

      if exists (
        select 1 from public.order_items
        where order_id = v_order_id
          and product_id = v_cart_item.product_id
      ) then
        update public.order_items
        set quantity = quantity + v_cart_item.quantity,
            total = (quantity + v_cart_item.quantity) * v_product.price
        where order_id = v_order_id
          and product_id = v_cart_item.product_id;

        select id into v_order_item_id
        from public.order_items
        where order_id = v_order_id
          and product_id = v_cart_item.product_id;
      else
        insert into public.order_items (
          order_id, product_id, product_name, quantity,
          unit_price, discount_percent, total
        )
        values (
          v_order_id, v_cart_item.product_id, v_product.name,
          v_cart_item.quantity, v_product.price, 0,
          v_product.price * v_cart_item.quantity
        )
        returning id into v_order_item_id;
      end if;

      perform public.deduct_inventory_fifo(
        v_cart_item.product_id,
        v_cart_item.quantity,
        v_order_item_id
      );
    end loop;

    v_subtotal := coalesce(v_existing_subtotal, 0) + v_cart_subtotal;
    v_total := v_subtotal - coalesce(v_existing_discount, 0) + v_delivery_fee;

    update public.orders
    set subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        total = v_total,
        updated_at = now(),
        address = v_address_text,
        customer_note = coalesce(
          nullif(btrim(left(p_note, 1000)), ''),
          customer_note
        ),
        timeline = coalesce(timeline, '[]'::jsonb) ||
          jsonb_build_array(
            jsonb_build_object(
              'label', 'ITEMS_ADDED',
              'time', now()::text,
              'note', v_cart_subtotal::text || ' added'
            )
          )
    where id = v_order_id;
  else
    v_subtotal := v_cart_subtotal;
    v_total := v_subtotal - v_discount + v_delivery_fee;

    insert into public.orders (
      order_number, customer_id, customer_name, status,
      subtotal, discount, delivery_fee, total, payment_method,
      address, customer_note, timeline
    )
    values (
      null, p_customer_id, v_customer_name, 'PENDING',
      v_subtotal, v_discount, v_delivery_fee, v_total,
      'CASH_ON_DELIVERY', v_address_text,
      nullif(btrim(left(p_note, 1000)), ''),
      jsonb_build_array(
        jsonb_build_object(
          'label', 'PLACED',
          'time', now()::text,
          'note', 'Order placed'
        )
      )
    )
    returning id into v_order_id;

    for v_cart_item in
      select * from public.cart_items where user_id = p_customer_id order by product_id
    loop
      select * into v_product
      from public.products
      where id = v_cart_item.product_id;

      insert into public.order_items (
        order_id, product_id, product_name, quantity,
        unit_price, discount_percent, total
      )
      values (
        v_order_id, v_cart_item.product_id, v_product.name,
        v_cart_item.quantity, v_product.price, 0,
        v_product.price * v_cart_item.quantity
      )
      returning id into v_order_item_id;

      perform public.deduct_inventory_fifo(
        v_cart_item.product_id,
        v_cart_item.quantity,
        v_order_item_id
      );
    end loop;
  end if;

  delete from public.cart_items where user_id = p_customer_id;

  return v_order_id;
end;
$fn$;

revoke all on function public.create_order(uuid, uuid, text) from public, anon;
grant execute on function public.create_order(uuid, uuid, text) to authenticated;

create or replace function public.transition_order_status(
  p_order_id uuid,
  p_new_status text,
  p_admin_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_catalog'
as $$
declare
  v_current_status text;
  v_allowed boolean := false;
  v_line record;
  v_note text := '';
begin
  if not public.is_admin() then
    raise exception 'Only admins can change order status';
  end if;

  if p_admin_id is distinct from auth.uid() then
    raise exception 'Admin ID must match authenticated user';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = p_admin_id
      and public.is_admin_email(email)
  ) then
    raise exception 'Only allowlisted admins can change order status';
  end if;

  -- Lock before reading status. A concurrent transition waits, then validates
  -- against the newly committed state instead of the stale previous state.
  select status
  into v_current_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  v_allowed := (
       (v_current_status = 'PENDING' and p_new_status in ('CONFIRMED', 'CANCELLED'))
    or (v_current_status = 'CONFIRMED' and p_new_status in ('PROCESSING', 'CANCELLED'))
    or (v_current_status = 'PROCESSING' and p_new_status in ('OUT_FOR_DELIVERY', 'CANCELLED'))
    or (v_current_status = 'OUT_FOR_DELIVERY' and p_new_status = 'DELIVERED')
    or (v_current_status = 'DELIVERED' and p_new_status = 'RETURNED')
  );

  if not v_allowed then
    raise exception 'Invalid status transition from % to %',
      v_current_status, p_new_status;
  end if;

  update public.orders
  set status = p_new_status,
      updated_at = now(),
      timeline = coalesce(timeline, '[]'::jsonb) ||
        jsonb_build_array(
          jsonb_build_object(
            'label', 'STATUS_CHANGED',
            'time', now()::text,
            'note', v_current_status || ' → ' || p_new_status
          )
        )
  where id = p_order_id;

  if p_new_status = 'CANCELLED' then
    for v_line in
      select id, quantity
      from public.order_items
      where order_id = p_order_id
    loop
      v_note := v_note ||
        public.restock_order_lines(
          p_order_id,
          v_line.id,
          v_line.quantity,
          'order cancelled'
        ) || '; ';
    end loop;

    update public.orders
    set timeline = coalesce(timeline, '[]'::jsonb) ||
      jsonb_build_array(
        jsonb_build_object(
          'label', 'STOCK_RESTOCKED',
          'time', now()::text,
          'note', v_note
        )
      )
    where id = p_order_id;
  end if;

  return true;
end;
$$;
