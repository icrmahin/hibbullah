-- PRODUCTION AUTHORIZATION HARDENING
-- Admin allowlist: icrmahin@gmail.com, Hibbullah82026@gmail.com (case-insensitive via lower(email))
-- Source of truth: auth.users.email (verified/current), NOT profiles.role, NOT user_metadata, NOT client-supplied
-- This migration is idempotent and preserves existing valid product/order/cart functionality.

-- 1. Hardened is_admin() — single source of truth, SECURITY DEFINER, explicit search_path, fully qualified refs
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, auth, pg_catalog
as $$
  select exists (
    select 1 from auth.users
    where auth.users.id = auth.uid()
      and lower(auth.users.email) in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com')
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon, service_role;

-- 2. Custom access token hook — derive JWT role from same allowlist, not from profiles table
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_email text;
  v_role text;
begin
  select lower(email) into v_email from auth.users where id = (event->>'user_id')::uuid;
  if v_email in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com') then
    v_role := 'admin';
  else
    v_role := 'customer';
  end if;
  -- Never overwrite claims.role (must remain 'authenticated'); inject app_role/is_admin for optional client use, RLS uses is_admin()
  event := jsonb_set(event, '{claims,app_role}', to_jsonb(v_role));
  event := jsonb_set(event, '{claims,is_admin}', to_jsonb(v_role = 'admin'));
  return event;
exception when others then
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- 3. handle_new_user — synchronize profiles.role from allowlist at signup
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_role text := 'customer';
  v_email_lower text;
begin
  v_email_lower := lower(new.email);
  if v_email_lower in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com') then
    v_role := 'admin';
  else
    v_role := 'customer';
  end if;

  insert into public.profiles (id, name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    v_role
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    name = coalesce(public.profiles.name, excluded.name),
    updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 4. Enforce profile role derived from auth.users.email — prevents client escalation
create or replace function public.enforce_profile_role()
returns trigger
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_email text;
  v_allowed_role text;
begin
  -- Prefer auth.users.email as source of truth; fallback to NEW.email if not yet in auth.users (race)
  select lower(email) into v_email from auth.users where id = new.id;
  if v_email is null then
    v_email := lower(new.email);
  end if;

  if v_email in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com') then
    v_allowed_role := 'admin';
  else
    v_allowed_role := 'customer';
  end if;

  if new.role is distinct from v_allowed_role then
    new.role := v_allowed_role;
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_enforce_role on public.profiles;
create trigger trg_profiles_enforce_role
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_role();

-- 5. Sync profiles on auth email change — handles allowlist entry/exit via verified email-change flow
create or replace function public.sync_profile_on_email_change()
returns trigger
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_new_role text;
begin
  if lower(new.email) in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com') then
    v_new_role := 'admin';
  else
    v_new_role := 'customer';
  end if;

  update public.profiles
    set email = new.email,
        role = v_new_role,
        updated_at = now()
    where id = new.id;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_auth_sync_profile on auth.users;
create trigger trg_auth_sync_profile
  after update of email on auth.users
  for each row execute function public.sync_profile_on_email_change();

-- 6. Backfill existing profiles to correct derived roles (idempotent)
update public.profiles p
set role = case
  when lower(coalesce((select email from auth.users where id = p.id), p.email)) in ('icrmahin@gmail.com','hibbullah82026@gmail.com') then 'admin'
  
  else 'customer'
end,
updated_at = now()
where p.role != case
  when lower(coalesce((select email from auth.users where id = p.id), p.email)) in ('icrmahin@gmail.com','hibbullah82026@gmail.com') then 'admin'
  
  else 'customer'
end;

-- Also ensure profiles.email mirrors auth.users.email where diverged
update public.profiles p
set email = u.email, updated_at = now()
from auth.users u
where p.id = u.id and p.email is distinct from u.email;

-- 7. Harden profiles RLS — keep display role but enforce ownership and prevent cross-user writes
-- Re-apply to ensure they use hardened is_admin()
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
-- Note: enforce_profile_role trigger will silently correct any role escalation attempt.

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id or public.is_admin());

-- Add delete protection (only self or admin) if not already restricted
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can delete own profile' and tablename='profiles' and schemaname='public') then
    create policy "Users can delete own profile"
      on public.profiles for delete
      using (auth.uid() = id or public.is_admin());
  end if;
end $$;

-- 8. Harden admin RLS policies — explicitly re-create with is_admin() to ensure no legacy JWT checks remain
-- categories
drop policy if exists "Admins can manage categories" on public.categories;
create policy "Admins can manage categories"
  on public.categories for all
  using (public.is_admin())
  with check (public.is_admin());

-- manufacturers
drop policy if exists "Admins can manage manufacturers" on public.manufacturers;
create policy "Admins can manage manufacturers"
  on public.manufacturers for all
  using (public.is_admin())
  with check (public.is_admin());

-- products
drop policy if exists "Anyone can view active products" on public.products;
drop policy if exists "Admins can manage products" on public.products;
create policy "Anyone can view active products"
  on public.products for select
  using (is_active = true or public.is_admin());
create policy "Admins can manage products"
  on public.products for all
  using (public.is_admin())
  with check (public.is_admin());

-- inventory_items
drop policy if exists "Admins can view all inventory" on public.inventory_items;
drop policy if exists "Admins can manage inventory" on public.inventory_items;
create policy "Admins can view all inventory"
  on public.inventory_items for select
  using (public.is_admin());
create policy "Admins can manage inventory"
  on public.inventory_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- stock_adjustments
drop policy if exists "Admins can view stock adjustments" on public.stock_adjustments;
drop policy if exists "Admins can create stock adjustments" on public.stock_adjustments;
create policy "Admins can view stock adjustments"
  on public.stock_adjustments for select
  using (public.is_admin());
create policy "Admins can create stock adjustments"
  on public.stock_adjustments for insert
  with check (public.is_admin());

-- orders
drop policy if exists "Customers can view own orders" on public.orders;
drop policy if exists "Customers can create orders" on public.orders;
drop policy if exists "Admins can view all orders" on public.orders;
drop policy if exists "Admins can update orders" on public.orders;
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

-- order_items
drop policy if exists "Customers can view own order items" on public.order_items;
drop policy if exists "Admins can view all order items" on public.order_items;
drop policy if exists "Admins can manage order items" on public.order_items;
create policy "Customers can view own order items"
  on public.order_items for select
  using (
    public.is_admin() or
    auth.uid() in (select customer_id from public.orders where id = order_id)
  );
create policy "Admins can view all order items"
  on public.order_items for select
  using (public.is_admin());
create policy "Admins can manage order items"
  on public.order_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- return_requests
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

-- delivery_cycles
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

-- audit_entries
drop policy if exists "Admins can view audit entries" on public.audit_entries;
create policy "Admins can view audit entries"
  on public.audit_entries for select
  using (public.is_admin());

-- 9. Storage — ensure admin-only write uses hardened is_admin
do $$
begin
  -- These policies were created with IF NOT EXISTS; re-create with hardened check if they used old is_admin, they still use is_admin() so hardening is transitive.
  -- Ensure they exist and are correct
  if not exists (select 1 from pg_policies where policyname='Admin update product-images' and tablename='objects' and schemaname='storage') then
    create policy "Admin update product-images"
      on storage.objects for update
      using (bucket_id = 'product-images' and public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where policyname='Admin delete product-images' and tablename='objects') then
    create policy "Admin delete product-images"
      on storage.objects for delete
      using (bucket_id = 'product-images' and public.is_admin());
  end if;
end $$;

-- 10. Harden RPC: transition_order_status — must verify caller is_admin() via hardened function
create or replace function public.transition_order_status(p_order_id uuid, p_new_status text, p_admin_id uuid)
returns boolean
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_current_status text;
  v_allowed boolean := false;
begin
  -- Caller must be admin via hardened is_admin()
  if not public.is_admin() then
    raise exception 'Only admins can change order status';
  end if;

  -- p_admin_id must be the caller and must be admin by email allowlist
  if p_admin_id is distinct from auth.uid() then
    raise exception 'Admin ID must match authenticated user';
  end if;

  -- Extra defense: verify email allowlist for p_admin_id
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
  update public.orders set status = p_new_status, updated_at = now() where id = p_order_id;
  return true;
end;
$$ language plpgsql;

-- 11. Fix phone unique index to allow multiple empty phones (partial index) — prevents handle_new_user clash on '' for admins without phone metadata
drop index if exists idx_profiles_phone;
create unique index idx_profiles_phone on public.profiles (phone) where phone <> '';

-- 12. Documented: No new RPC grants admin. Existing create_order/validate_* remain customer-scoped.

-- 13. Ensure is_admin remains executable
grant execute on function public.is_admin() to authenticated, anon, service_role;
