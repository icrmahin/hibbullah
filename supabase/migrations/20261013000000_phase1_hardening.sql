-- Phase 1 hardening: close the three gaps left by
-- 20261012000000_product_low_stock_threshold.sql.
--
-- That migration moved product-level calcs, the inventory status trigger,
-- and the dashboard/reports RPCs to per-product thresholds, but three
-- places still behaved as if the global 10 existed:
--
-- 1. sync_product_stock() and handle_product_stock_change() both sent
--    "Low stock" notifications with a hardcoded < 10 / >= 10 test. A
--    medicine with a warning point of 50 now notified at 10, and one with
--    0 still notified at 10. Both now read the product's own threshold
--    (fallback 50), so 0 disables the low-stock notification while the
--    separate stock == 0 out-of-stock notification is untouched.
--
-- 2. Changing products.low_stock_threshold left existing
--    inventory_items.status stale until each batch was next touched,
--    because update_inventory_status() only fires on batch INSERT/UPDATE.
--    The new AFTER UPDATE OF low_stock_threshold trigger reclassifies
--    exactly that product's batches in place. It is column-scoped, so the
--    stock sync writing products.stock never recurses into it, and the
--    batch BEFORE trigger recomputes the same value, so the two agree.
--
-- 3. get_admin_low_stock() used INNER JOIN + i.quantity > 0, so a low
--    product with no positive batch row (new product, or only zero-qty
--    batches) was invisible on the dashboard while get_reports counted
--    it. It now LEFT JOINs with the quantity filter in the ON clause,
--    so the product still appears with null batch fields; the client
--    falls back to product-level values for that row. The is_active
--    filter is also dropped: stock 0 auto-deactivates a product, so
--    keeping it would hide every out-of-stock product from the admin
--    restock list and the "Out of stock" metric could never fire.
--    Only soft-deleted products are excluded, matching get_reports.

create or replace function public.sync_product_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_product_id uuid;
  v_new_stock integer;
  v_product_name text;
  v_old_stock integer;
  v_threshold integer;
begin
  v_product_id := coalesce(NEW.product_id, OLD.product_id);
  -- Recalc stock
  select coalesce(sum(quantity), 0) into v_new_stock
  from public.inventory_items
  where product_id = v_product_id;

  -- Get product name for notifications
  select name into v_product_name from public.products where id = v_product_id;
  select low_stock_threshold into v_threshold from public.products where id = v_product_id;
  if v_threshold is null then v_threshold := 50; end if;

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
  -- Case 2: low stock threshold crossed (per-product low_stock_threshold)
  elsif v_new_stock > 0 and v_new_stock < v_threshold and coalesce(v_old_stock, 0) >= v_threshold then
    insert into public.notifications (user_id, title, body, type)
    select distinct id as user_id, 'Low stock: ' || v_product_name, v_product_name || ' only ' || v_new_stock || ' left — consider restocking.', 'warning'
    from public.profiles where role = 'admin';
  end if;

  return coalesce(NEW, OLD);
end;
$function$;

create or replace function public.handle_product_stock_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_product_name text := NEW.name;
  v_threshold integer := coalesce(NEW.low_stock_threshold, 50);
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
  elsif NEW.stock > 0 and NEW.stock < v_threshold and OLD.stock >= v_threshold then
    insert into public.notifications (user_id, title, body, type)
    select distinct id as user_id, 'Low stock: ' || v_product_name, v_product_name || ' only ' || NEW.stock || ' left — consider restocking.', 'warning'
    from public.profiles where role = 'admin';
  elsif NEW.stock > 0 and OLD.stock <= 0 and NEW.is_active = false then
    -- Auto-reactivate if stock restored and was deactivated due to stock
    NEW.is_active := true;
  end if;
  return NEW;
end;
$function$;

drop function if exists public.get_admin_low_stock();

create or replace function public.get_admin_low_stock()
returns table (
  product_id     uuid,
  product_name   text,
  stock          integer,
  low_stock_threshold integer,
  batch_id       uuid,
  batch_number   text,
  batch_quantity integer,
  batch_status   text,
  expiry_date    date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can query low stock';
  end if;

  return query
  select p.id, p.name, p.stock, p.low_stock_threshold,
         i.id, i.batch_number, i.quantity, i.status, i.expiry_date
    from public.products p
    left join public.inventory_items i on i.product_id = p.id and i.quantity > 0
   where coalesce(p.is_deleted, false) = false
     and p.stock < p.low_stock_threshold
   order by p.stock asc, p.name asc, i.last_updated asc nulls last;
end;
$$;

revoke all on function public.get_admin_low_stock() from public, anon, authenticated;
grant execute on function public.get_admin_low_stock() to authenticated;

create or replace function public.reclassify_batches_on_threshold_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_threshold integer;
begin
  v_threshold := coalesce(NEW.low_stock_threshold, 50);
  update public.inventory_items
     set status = case
                    when quantity <= 0 then 'out_of_stock'
                    when quantity < v_threshold then 'low'
                    else 'healthy'
                  end
   where product_id = NEW.id;
  return NEW;
end;
$function$;

drop trigger if exists trg_products_reclassify_batches on public.products;

create trigger trg_products_reclassify_batches
  after update of low_stock_threshold on public.products
  for each row
  when (old.low_stock_threshold is distinct from new.low_stock_threshold)
  execute function public.reclassify_batches_on_threshold_change();
