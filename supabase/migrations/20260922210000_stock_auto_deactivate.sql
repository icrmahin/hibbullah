-- STK-02 + STK-03: auto-deactivate product when stock 0, low-stock warnings, and notifications
-- Extends sync_product_stock to also manage is_active and notifications

create or replace function public.sync_product_stock()
returns trigger
security definer
set search_path = public
as $$
declare
  v_product_id uuid;
  v_new_stock integer;
  v_product_name text;
  v_old_stock integer;
begin
  v_product_id := coalesce(NEW.product_id, OLD.product_id);
  -- Recalc stock
  select coalesce(sum(quantity), 0) into v_new_stock
  from public.inventory_items
  where product_id = v_product_id;

  -- Get product name for notifications
  select name into v_product_name from public.products where id = v_product_id;

  -- Get old stock for threshold comparisons
  if TG_OP = 'DELETE' then
    v_old_stock := coalesce((select stock from public.products where id = v_product_id), v_new_stock + coalesce(OLD.quantity,0));
  elsif TG_OP = 'UPDATE' then
    -- before trigger sync, products.stock still holds old value
    select stock into v_old_stock from public.products where id = v_product_id;
  else
    select stock into v_old_stock from public.products where id = v_product_id;
  end if;

  -- Update products stock and is_active
  update public.products
  set stock = v_new_stock,
      is_active = case
        when v_new_stock <= 0 then false
        when v_old_stock <= 0 and v_new_stock > 0 then true -- auto-reactivate on restock
        else is_active
      end
  where id = v_product_id;

  -- Notifications
  -- Case 1: stock just hit 0 (out of stock) -> deactivate
  if v_new_stock <= 0 and coalesce(v_old_stock, 0) > 0 then
    -- Notify customers with product in cart, favorites, or past orders + all admins
    insert into public.notifications (user_id, title, body, type)
    select distinct user_id, 'Out of stock: ' || v_product_name, v_product_name || ' is now hidden — restock to reactivate. Stock 0.', 'alert'
    from (
      select user_id from public.cart_items where product_id = v_product_id
      union
      select user_id from public.favorites where product_id = v_product_id
      union
      select customer_id as user_id from public.orders o join public.order_items oi on oi.order_id = o.id where oi.product_id = v_product_id
      union
      select id as user_id from public.profiles where role = 'admin'
    ) u;
  -- Case 2: low stock threshold crossed (config.lowStockThreshold = 10)
  elsif v_new_stock > 0 and v_new_stock < 10 and coalesce(v_old_stock, 0) >= 10 then
    insert into public.notifications (user_id, title, body, type)
    select distinct id as user_id, 'Low stock: ' || v_product_name, v_product_name || ' only ' || v_new_stock || ' left — consider restocking.', 'warning'
    from public.profiles where role = 'admin';
  end if;

  return coalesce(NEW, OLD);
end;
$$ language plpgsql;

-- Ensure trigger still exists (it was created in initial_schema); recreate to ensure security definer
drop trigger if exists trg_inventory_sync_stock on public.inventory_items;
create trigger trg_inventory_sync_stock
  after insert or update or delete on public.inventory_items
  for each row execute function public.sync_product_stock();

-- Also handle direct products.stock updates (if admin edits stock directly)
create or replace function public.handle_product_stock_change()
returns trigger
security definer
set search_path = public
as $$
declare
  v_product_name text := NEW.name;
begin
  if NEW.stock <= 0 and OLD.stock > 0 and NEW.is_active = true then
    NEW.is_active := false;
    insert into public.notifications (user_id, title, body, type)
    select distinct user_id, 'Out of stock: ' || v_product_name, v_product_name || ' is now hidden — restock to reactivate. Stock 0.', 'alert'
    from (
      select user_id from public.cart_items where product_id = NEW.id
      union
      select user_id from public.favorites where product_id = NEW.id
      union
      select customer_id as user_id from public.orders o join public.order_items oi on oi.order_id = o.id where oi.product_id = NEW.id
      union
      select id as user_id from public.profiles where role = 'admin'
    ) u;
  elsif NEW.stock > 0 and NEW.stock < 10 and OLD.stock >= 10 then
    insert into public.notifications (user_id, title, body, type)
    select distinct id as user_id, 'Low stock: ' || v_product_name, v_product_name || ' only ' || NEW.stock || ' left — consider restocking.', 'warning'
    from public.profiles where role = 'admin';
  elsif NEW.stock > 0 and OLD.stock <= 0 and NEW.is_active = false then
    -- Auto-reactivate if stock restored and was deactivated due to stock
    NEW.is_active := true;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_product_stock_check on public.products;
create trigger trg_product_stock_check
  before update of stock on public.products
  for each row execute function public.handle_product_stock_change();
