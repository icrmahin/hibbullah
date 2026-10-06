-- Customer block: reversible admin suspension that is enforced server-side.
--
-- Design (mirrors the is_admin() pattern, not client flags):
-- 1. profiles.is_blocked boolean, default false. No app UI except the admin detail screen.
-- 2. public.is_blocked() SECURITY DEFINER helper (same shape as is_admin()).
-- 3. public.set_user_blocked() SECURITY DEFINER RPC: is_admin() gate, flips the flag.
--    Admins call this; nobody UPDATEs the flag directly (no broad admin UPDATE policy).
-- 4. Every customer-scoped RLS policy gains AND NOT is_blocked(). Admin branches
--    (is_admin()) are untouched, so admins keep full visibility (needed to unblock).
-- 5. The app additionally signs out blocked sessions on load (AuthProvider) and refuses
--    login for blocked accounts — UX, not enforcement. A live JWT (≤1h) is denied by RLS.
--
-- What this does NOT do: delete anything (order history intact), touch anon access,
-- touch admin policies, or change any non-customer behavior.

-- ── 1. flag ──────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists is_blocked boolean not null default false;

-- ── 2. helper ────────────────────────────────────────────────────────────────
create or replace function public.is_blocked()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return coalesce((select p.is_blocked from public.profiles p where p.id = auth.uid()), false);
end $$;
revoke all on function public.is_blocked() from public, anon;
grant execute on function public.is_blocked() to authenticated;

-- ── 3. admin RPC ─────────────────────────────────────────────────────────────
create or replace function public.set_user_blocked(p_user_id uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.profiles set is_blocked = p_blocked, updated_at = now() where id = p_user_id;
end $$;
revoke all on function public.set_user_blocked(uuid, boolean) from public, anon;
grant execute on function public.set_user_blocked(uuid, boolean) to authenticated;

-- ── 4a. profiles ─────────────────────────────────────────────────────────────
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (((auth.uid() = id) and (not public.is_blocked())) or is_admin());
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using ((auth.uid() = id) and (not public.is_blocked()))
  with check ((auth.uid() = id) and (not public.is_blocked()));

-- ── 4b. cart_items ───────────────────────────────────────────────────────────
drop policy if exists "Customers can view own cart" on public.cart_items;
create policy "Customers can view own cart"
  on public.cart_items for select
  using ((auth.uid() = user_id) and (not public.is_blocked()));
drop policy if exists "Customers can insert own cart items" on public.cart_items;
create policy "Customers can insert own cart items"
  on public.cart_items for insert
  with check ((auth.uid() = user_id) and (not public.is_blocked()));
drop policy if exists "Customers can update own cart items" on public.cart_items;
create policy "Customers can update own cart items"
  on public.cart_items for update
  using ((auth.uid() = user_id) and (not public.is_blocked()))
  with check ((auth.uid() = user_id) and (not public.is_blocked()));
drop policy if exists "Customers can delete own cart items" on public.cart_items;
create policy "Customers can delete own cart items"
  on public.cart_items for delete
  using ((auth.uid() = user_id) and (not public.is_blocked()));

-- ── 4c. favorites ────────────────────────────────────────────────────────────
drop policy if exists "Customers can view own favorites" on public.favorites;
create policy "Customers can view own favorites"
  on public.favorites for select
  using ((auth.uid() = user_id) and (not public.is_blocked()));
drop policy if exists "Customers can manage own favorites" on public.favorites;
create policy "Customers can manage own favorites"
  on public.favorites for all
  using ((auth.uid() = user_id) and (not public.is_blocked()))
  with check ((auth.uid() = user_id) and (not public.is_blocked()));

-- ── 4d. addresses ────────────────────────────────────────────────────────────
drop policy if exists "Customers can view own addresses" on public.addresses;
create policy "Customers can view own addresses"
  on public.addresses for select
  using ((auth.uid() = user_id) and (not public.is_blocked()));
drop policy if exists "Customers can manage own addresses" on public.addresses;
create policy "Customers can manage own addresses"
  on public.addresses for all
  using ((auth.uid() = user_id) and (not public.is_blocked()))
  with check ((auth.uid() = user_id) and (not public.is_blocked()));

-- ── 4e. orders + order_items (admin branches untouched) ──────────────────────
drop policy if exists "Customers can view own orders" on public.orders;
create policy "Customers can view own orders"
  on public.orders for select
  using (((auth.uid() = customer_id) and (not public.is_blocked())) or is_admin());
drop policy if exists "Customers can view own order items" on public.order_items;
create policy "Customers can view own order items"
  on public.order_items for select
  using (((auth.uid() in (select orders.customer_id from orders where orders.id = order_items.order_id)) and (not public.is_blocked())) or is_admin());

-- ── 4f. notifications + push_tokens ──────────────────────────────────────────
drop policy if exists "Customers can view own notifications" on public.notifications;
create policy "Customers can view own notifications"
  on public.notifications for select
  using ((auth.uid() = user_id) and (not public.is_blocked()));
drop policy if exists "Customers can mark own notifications read" on public.notifications;
create policy "Customers can mark own notifications read"
  on public.notifications for update
  using ((auth.uid() = user_id) and (not public.is_blocked()))
  with check ((auth.uid() = user_id) and (not public.is_blocked()));
drop policy if exists "Customers can clear own notifications" on public.notifications;
create policy "Customers can clear own notifications"
  on public.notifications for delete
  using ((auth.uid() = user_id) and (not public.is_blocked()));
drop policy if exists "Users can view own push tokens" on public.push_tokens;
create policy "Users can view own push tokens"
  on public.push_tokens for select
  using ((auth.uid() = user_id) and (not public.is_blocked()));
drop policy if exists "Users can manage own push tokens" on public.push_tokens;
create policy "Users can manage own push tokens"
  on public.push_tokens for all
  using ((auth.uid() = user_id) and (not public.is_blocked()))
  with check ((auth.uid() = user_id) and (not public.is_blocked()));

-- ── 4g. return_requests (admin branches untouched) ───────────────────────────
drop policy if exists "Customers can view own returns" on public.return_requests;
create policy "Customers can view own returns"
  on public.return_requests for select
  using (((auth.uid() = customer_id) and (not public.is_blocked())) or is_admin());
drop policy if exists "Customers can create returns" on public.return_requests;
create policy "Customers can create returns"
  on public.return_requests for insert
  with check ((auth.uid() = customer_id) and (not public.is_blocked()) and (exists (select 1 from orders o where ((o.id = return_requests.order_id) and (o.customer_id = return_requests.customer_id) and (o.status = 'DELIVERED'::text)))));

-- ── 4h. delivery cycles + items ──────────────────────────────────────────────
drop policy if exists "Customers can create delivery cycles" on public.delivery_cycles;
create policy "Customers can create delivery cycles"
  on public.delivery_cycles for insert
  with check ((auth.uid() = customer_id) and (not public.is_blocked()));
drop policy if exists "Customers can update own delivery cycles" on public.delivery_cycles;
create policy "Customers can update own delivery cycles"
  on public.delivery_cycles for update
  using ((auth.uid() = customer_id) and (not public.is_blocked()))
  with check ((auth.uid() = customer_id) and (not public.is_blocked()));
drop policy if exists "Customers can view own delivery cycles" on public.delivery_cycles;
create policy "Customers can view own delivery cycles"
  on public.delivery_cycles for select
  using (((auth.uid() = customer_id) and (not public.is_blocked())) or is_admin());
drop policy if exists "Customers can view own delivery cycle items" on public.delivery_cycle_items;
create policy "Customers can view own delivery cycle items"
  on public.delivery_cycle_items for select
  using ((exists (select 1 from delivery_cycles dc where ((dc.id = delivery_cycle_items.delivery_cycle_id) and (dc.customer_id = auth.uid())))) and (not public.is_blocked()));
drop policy if exists "Customers can manage own delivery cycle items" on public.delivery_cycle_items;
create policy "Customers can manage own delivery cycle items"
  on public.delivery_cycle_items for all
  using ((exists (select 1 from delivery_cycles dc where ((dc.id = delivery_cycle_items.delivery_cycle_id) and (dc.customer_id = auth.uid())))) and (not public.is_blocked()))
  with check ((exists (select 1 from delivery_cycles dc where ((dc.id = delivery_cycle_items.delivery_cycle_id) and (dc.customer_id = auth.uid())))) and (not public.is_blocked()));
