-- ═══════════════════════════════════════════════════════════════════════════
-- BUG-HUNT FIX PASS 2 — schema/DB fixes discovered during the project bug-hunt.
-- FIX refs:
--  BUG-B1 create_order no longer decrements inventory_items (replaced the FIFO
--         version) — orders only dropped products.stock, so the batch ledger
--         stayed full. Any later inventory change ran sync_product_stock and
--         snapped products.stock back up (stock "reappared"). Restored FIFO
--         deduction (non-expired, expiry-first) with products.stock fallback
--         only for legacy products that have no inventory rows.
--  BUG-B2 apply_stock_adjustment silently did nothing when batch_number was not
--         found — the adjustment row persisted with zero effect. Now raises.
--  BUG-B3 sync_delivery_cycle_total fired as SECURITY INVOKER, and delivery_cycles
--         had NO customer UPDATE policy — so the trigger's UPDATE was silently
--         filtered by RLS and estimated_total stayed 0 on the customer screen.
--         Added customer update + admin manage policies and made the trigger
--         SECURITY DEFINER.
--  BUG-B4 transition_order_status stopped appending timeline entries — the admin
--         order Timeline only ever showed ITEMS_ADDED. Restored STATUS_CHANGED.
--  BUG-B5 generate_order_number used count(*)+1 with a UNIQUE column — a race
--         between two inserts could collide on ORD-XXXX and fail the order.
--         Serialized with an advisory xact lock.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- BUG-B5: serialize order_number generation
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.generate_order_number()
returns text as $$
declare
  v_count integer;
  v_number text;
begin
  -- Serialize generators so two concurrent create_order calls cannot produce
  -- the same ORD-XXXX (order_number is UNIQUE).
  perform pg_advisory_xact_lock(hashtext('hibbullah_generate_order_number'));
  select count(*) + 1 into v_count from public.orders;
  v_number := 'ORD-' || lpad(v_count::text, 4, '0');
  return v_number;
end;
$$ language plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
-- BUG-B1: create_order — append-to-PENDING + FIFO inventory deduction
-- ───────────────────────────────────────────────────────────────────────────
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
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity);
    end loop;
  end if;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;
$$ language plpgsql;

-- Helper shared by both create_order branches: deduct qty from non-expired
-- inventory FIFO (NULL expiry = never expires, sorted last but still usable).
-- products.stock is kept in sync automatically by trg_inventory_sync_stock
-- (defined in the stock_auto_deactivate migration) which also handles the
-- auto-deactivate/notification side effects. Legacy products with NO inventory
-- rows fall back to a direct products.stock decrement.
create or replace function public.deduct_inventory_fifo(p_product_id uuid, p_quantity integer)
returns void
security definer
set search_path = public
as $$
declare
  v_remaining integer := p_quantity;
  v_inv record;
begin
  -- Lock the batch rows so validation + deduction see a consistent snapshot
  for v_inv in
    select id, quantity from public.inventory_items
    where product_id = p_product_id
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

  -- Concurrent safety: if still remaining, stock was consumed between validation and deduction
  if v_remaining > 0 and exists (select 1 from public.inventory_items where product_id = p_product_id) then
    raise exception 'Insufficient stock for product';
  end if;

  -- Legacy fallback if the product has no inventory rows at all
  if v_remaining = p_quantity then
    update public.products set stock = stock - p_quantity where id = p_product_id;
  end if;
end;
$$ language plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
-- BUG-B2: stock adjustments must not silently no-op
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.apply_stock_adjustment()
returns trigger as $$
declare
  v_inventory public.inventory_items%rowtype;
begin
  select * into v_inventory
    from public.inventory_items
    where product_id = new.product_id and batch_number = new.batch_number
    for update;

  if not found then
    raise exception 'No inventory batch "%" found for this product — adjustment would have no effect', new.batch_number;
  end if;

  if new.type = 'increase' then
    v_inventory.quantity := v_inventory.quantity + new.quantity;
  else
    v_inventory.quantity := greatest(v_inventory.quantity - new.quantity, 0);
  end if;
  update public.inventory_items
    set quantity = v_inventory.quantity,
        last_updated = now()
    where id = v_inventory.id;

  return new;
end;
$$ language plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
-- BUG-B3: delivery cycle totals blocked by RLS
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.sync_delivery_cycle_total()
returns trigger
security definer
set search_path = public
as $$
begin
  update public.delivery_cycles dc
  set estimated_total = (
    select coalesce(sum(p.price * dci.quantity),0)
    from public.delivery_cycle_items dci
    join public.products p on p.id = dci.product_id
    where dci.delivery_cycle_id = dc.id
  )
  where dc.id = coalesce(NEW.delivery_cycle_id, OLD.delivery_cycle_id);
  return null;
end;
$$ language plpgsql;

-- Customers must be able to update their own cycle (the trigger above runs as
-- the invoker — a customer inserting delivery_cycle_items — and needs an UPDATE
-- policy for its estimated_total write; without one RLS silently filtered it).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='delivery_cycles' and policyname='Customers can update own delivery cycles') then
    create policy "Customers can update own delivery cycles"
      on public.delivery_cycles for update
      using (auth.uid() = customer_id)
      with check (auth.uid() = customer_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='delivery_cycles' and policyname='Admins can manage delivery cycles') then
    create policy "Admins can manage delivery cycles"
      on public.delivery_cycles for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- BUG-B4: restore timeline entries for order status transitions
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.transition_order_status(p_order_id uuid, p_new_status text, p_admin_id uuid)
returns boolean
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_current_status text;
  v_allowed boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change order status';
  end if;
  if p_admin_id is distinct from auth.uid() then
    raise exception 'Admin ID must match authenticated user';
  end if;
  if not exists (select 1 from auth.users where id = p_admin_id and lower(email) in ('icrmahin@gmail.com','hibbullah82026@gmail.com')) then
    raise exception 'Only allowlisted admins can change order status';
  end if;
  select status into v_current_status from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;
  v_allowed := (
    (v_current_status = 'PENDING' and p_new_status in ('CONFIRMED', 'CANCELLED')) or
    (v_current_status = 'CONFIRMED' and p_new_status in ('PROCESSING', 'CANCELLED')) or
    (v_current_status = 'PROCESSING' and p_new_status in ('OUT_FOR_DELIVERY', 'CANCELLED')) or
    (v_current_status = 'OUT_FOR_DELIVERY' and p_new_status in ('DELIVERED')) or
    (v_current_status = 'DELIVERED' and p_new_status in ('RETURNED'))
  );
  if not v_allowed then
    raise exception 'Invalid status transition from % to %', v_current_status, p_new_status;
  end if;
  update public.orders
  set status = p_new_status,
      updated_at = now(),
      timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('label', 'STATUS_CHANGED', 'time', now()::text, 'note', v_current_status || ' → ' || p_new_status)
      )
  where id = p_order_id;
  return true;
end;
$$ language plpgsql;