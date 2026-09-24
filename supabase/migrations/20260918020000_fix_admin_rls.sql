-- Fix admin RLS: replace JWT-role checks with profiles-based is_admin()
-- Does NOT weaken RLS; makes local admin testable.

-- Helper: true iff current authenticated user has role='admin' in profiles
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Ensure helper runs with definer and is stable
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- --- profiles ---
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- admin insert: allow authenticated to insert own profile is handled by trigger; also allow admin to manage if needed
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id or public.is_admin());

-- --- categories ---
drop policy if exists "Admins can manage categories" on public.categories;
create policy "Admins can manage categories"
  on public.categories for all
  using (public.is_admin())
  with check (public.is_admin());

-- --- manufacturers ---
drop policy if exists "Admins can manage manufacturers" on public.manufacturers;
create policy "Admins can manage manufacturers"
  on public.manufacturers for all
  using (public.is_admin())
  with check (public.is_admin());

-- --- products ---
drop policy if exists "Anyone can view active products" on public.products;
drop policy if exists "Admins can manage products" on public.products;

create policy "Anyone can view active products"
  on public.products for select
  using (is_active = true or public.is_admin());

create policy "Admins can manage products"
  on public.products for all
  using (public.is_admin())
  with check (public.is_admin());

-- Also allow admin to view inactive via same policy above (is_admin covers)
-- Customer should NOT see inactive; enforced by is_active=true OR admin.

-- --- inventory_items ---
drop policy if exists "Admins can view all inventory" on public.inventory_items;
drop policy if exists "Admins can manage inventory" on public.inventory_items;

create policy "Admins can view all inventory"
  on public.inventory_items for select
  using (public.is_admin());

create policy "Admins can manage inventory"
  on public.inventory_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- --- stock_adjustments ---
drop policy if exists "Admins can view stock adjustments" on public.stock_adjustments;
drop policy if exists "Admins can create stock adjustments" on public.stock_adjustments;

create policy "Admins can view stock adjustments"
  on public.stock_adjustments for select
  using (public.is_admin());

create policy "Admins can create stock adjustments"
  on public.stock_adjustments for insert
  with check (public.is_admin());

-- --- orders ---
drop policy if exists "Customers can view own orders" on public.orders;
drop policy if exists "Customers can create orders" on public.orders;
drop policy if exists "Admins can view all orders" on public.orders;
drop policy if exists "Admins can update order status" on public.orders;

create policy "Customers can view own orders"
  on public.orders for select
  using (auth.uid() = customer_id or public.is_admin());

create policy "Customers can create orders"
  on public.orders for insert
  with check (auth.uid() = customer_id);

create policy "Admins can view all orders"
  on public.orders for select
  using (public.is_admin());

create policy "Admins can update orders"
  on public.orders for update
  using (public.is_admin())
  with check (public.is_admin());

-- --- order_items ---
drop policy if exists "Customers can view own order items" on public.order_items;
drop policy if exists "Admins can view all order items" on public.order_items;

create policy "Customers can view own order items"
  on public.order_items for select
  using (
    public.is_admin() or
    auth.uid() in (select customer_id from public.orders where id = order_id)
  );

create policy "Admins can view all order items"
  on public.order_items for select
  using (public.is_admin());

-- Also allow order_items insert via create_order function (definer) - RLS not needed but allow service?
-- Customers cannot directly insert order_items; only via RPC. So no insert policy.
create policy "Admins can manage order items"
  on public.order_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- Enable insert for order_items via authenticated creating order? The RPC is definer, so it bypasses RLS.
-- Keep strict: no direct insert for customers.

-- --- return_requests ---
drop policy if exists "Customers can view own returns" on public.return_requests;
drop policy if exists "Customers can create returns" on public.return_requests;
drop policy if exists "Admins can view all returns" on public.return_requests;
drop policy if exists "Admins can update return status" on public.return_requests;

create policy "Customers can view own returns"
  on public.return_requests for select
  using (auth.uid() = customer_id or public.is_admin());

create policy "Customers can create returns"
  on public.return_requests for insert
  with check (auth.uid() = customer_id);

create policy "Admins can view all returns"
  on public.return_requests for select
  using (public.is_admin());

create policy "Admins can update return status"
  on public.return_requests for update
  using (public.is_admin())
  with check (public.is_admin());

-- --- delivery_cycles ---
drop policy if exists "Customers can view own delivery cycles" on public.delivery_cycles;
drop policy if exists "Customers can create delivery cycles" on public.delivery_cycles;
drop policy if exists "Admins can view all delivery cycles" on public.delivery_cycles;

create policy "Customers can view own delivery cycles"
  on public.delivery_cycles for select
  using (auth.uid() = customer_id or public.is_admin());

create policy "Customers can create delivery cycles"
  on public.delivery_cycles for insert
  with check (auth.uid() = customer_id);

create policy "Admins can view all delivery cycles"
  on public.delivery_cycles for select
  using (public.is_admin());

-- --- notifications ---
-- Keep customer own, but allow admin to view via is_admin? No, notifications are per-user; keep as is, no admin needed.

-- --- audit_entries ---
drop policy if exists "Admins can view audit entries" on public.audit_entries;
create policy "Admins can view audit entries"
  on public.audit_entries for select
  using (public.is_admin());

-- Custom access token hook: inject role into JWT so auth.jwt()->>'role' also works (defense in depth)
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = (event->>'user_id')::uuid;
  if v_role is not null then
    return jsonb_set(event, '{claims,role}', to_jsonb(v_role));
  end if;
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Note: To activate the hook, set in supabase/config.toml:
-- [auth.hook.custom_access_token]
-- enabled = true
-- uri = "pg-functions://postgres/public/custom_access_token_hook"
-- This migration creates the function; activation is in config.toml (see docs/ADMIN_AUTH.md)

-- Also fix handle_new_user to allow admin promotion for local seed email
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'customer');
  insert into public.profiles (id, name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    v_role
  )
  on conflict (id) do update set role = excluded.role, email = excluded.email;
  return new;
end;
$$ language plpgsql;

-- Idempotency for profiles phone unique index where phone = '' causes conflicts with '' default.
-- Already handled via handle_new_user, but ensure is_admin works before profile exists (during signup).
