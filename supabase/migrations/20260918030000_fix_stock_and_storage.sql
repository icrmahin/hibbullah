-- Fix Stock integrity, sync trigger, storage buckets, and handle edge cases
-- Part of Step 11 quality pass

-- 1. Fix sync_product_stock to handle INSERT/UPDATE/DELETE correctly (use COALESCE(NEW,OLD))
create or replace function public.sync_product_stock()
returns trigger
security invoker
set search_path = public
as $$
declare
  v_pid uuid;
begin
  v_pid := coalesce(new.product_id, old.product_id);
  update public.products
  set stock = (
    select coalesce(sum(quantity), 0)
    from public.inventory_items
    where product_id = v_pid
  )
  where id = v_pid;
  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_inventory_sync_stock on public.inventory_items;
create trigger trg_inventory_sync_stock
  after insert or update or delete on public.inventory_items
  for each row execute function public.sync_product_stock();

-- 2. Fix create_order to deduct from inventory_items FIFO (expiry earliest first) instead of direct products.stock
-- This keeps products.stock in sync via the trigger above and ensures batch-level correctness.
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

  -- Validate stock and calculate subtotal using inventory sum (authoritative)
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    -- Use sum of inventory_items as authoritative stock, fallback to products.stock if no batches
    declare
      v_total_stock integer;
    begin
      select coalesce(sum(quantity), 0) into v_total_stock from public.inventory_items where product_id = v_cart_item.product_id;
      -- If no inventory rows, fall back to products.stock (legacy), else use inventory sum
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

    -- Deduct from inventory FIFO (earliest expiry first, nulls last)
    v_remaining := v_cart_item.quantity;
    for v_inv in
      select id, quantity from public.inventory_items
      where product_id = v_cart_item.product_id and quantity > 0
      order by expiry_date asc nulls last, last_updated asc
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

    -- If no inventory rows exist (legacy product with stock only), keep products.stock update for backward compat
    if not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
      update public.products set stock = stock - v_cart_item.quantity where id = v_cart_item.product_id;
    end if;
  end loop;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;
$$ language plpgsql;

-- 3. Ensure storage buckets exist for product-images and avatars (idempotent)
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Storage policies: public read, authenticated write
-- Drop existing if any then recreate
do $$
begin
  -- product-images policies
  if not exists (select 1 from pg_policies where policyname = 'Public read product-images' and tablename='objects' and schemaname='storage') then
    create policy "Public read product-images"
      on storage.objects for select
      using (bucket_id = 'product-images');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Authenticated write product-images' and tablename='objects') then
    create policy "Authenticated write product-images"
      on storage.objects for insert
      with check (bucket_id = 'product-images' and auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Admin update product-images' and tablename='objects') then
    create policy "Admin update product-images"
      on storage.objects for update
      using (bucket_id = 'product-images' and public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Admin delete product-images' and tablename='objects') then
    create policy "Admin delete product-images"
      on storage.objects for delete
      using (bucket_id = 'product-images' and public.is_admin());
  end if;
  -- avatars policies
  if not exists (select 1 from pg_policies where policyname = 'Public read avatars' and tablename='objects') then
    create policy "Public read avatars"
      on storage.objects for select
      using (bucket_id = 'avatars');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Authenticated write avatars' and tablename='objects') then
    create policy "Authenticated write avatars"
      on storage.objects for insert
      with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
  end if;
end $$;

-- 4. Backfill products.stock from inventory sums to fix divergence
update public.products p
set stock = sub.total
from (select product_id, coalesce(sum(quantity),0) as total from public.inventory_items group by product_id) sub
where p.id = sub.product_id;
