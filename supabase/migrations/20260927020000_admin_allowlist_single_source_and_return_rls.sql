-- Two real defects, both found by walking the order lifecycle as a real customer.
--
-- ── 1. A return request could be filed against somebody else's order ────────────────
--
-- The INSERT policy on return_requests checked only `auth.uid() = customer_id` -- that the
-- row claims to belong to whoever is inserting it. It never checked that the ORDER named
-- in `order_id` belongs to that same customer. So any signed-in user could file a return
-- against any order in the shop:
--
--     POST /rest/v1/return_requests
--     { order_id: <someone else's order>, customer_id: <my own id>, ... }   -> 201
--
-- Confirmed against the live project: the forged row persisted, with order_owner and
-- customer_id pointing at two different people. The app does call validate_return() first,
-- which does check ownership -- but that is a client-side call, so it is advice rather than
-- enforcement. The insert itself has to hold the line.
--
-- The two things validate_return() guarantees are now enforced by the policy, so skipping
-- the RPC changes nothing:
--
--   * the order exists, and belongs to the customer filing the return
--   * the order is DELIVERED (returns are only allowed after delivery)
--
-- Only customers file returns (the admin screen reads and updates them; the one INSERT
-- caller is (customer)/order/[orderId].tsx), so no is_admin() branch is needed here.

drop policy if exists "Customers can create returns" on public.return_requests;

create policy "Customers can create returns"
on public.return_requests
for insert
to public
with check (
  auth.uid() = customer_id
  and exists (
    select 1
    from public.orders o
    where o.id = return_requests.order_id
      and o.customer_id = return_requests.customer_id
      and o.status = 'DELIVERED'
  )
);

-- ── 2. The admin allowlist was a hard-coded list in six separate function bodies ─────
--
-- The two owner addresses appeared verbatim in is_admin(), handle_new_user(),
-- sync_profile_on_email_change(), custom_access_token_hook(), enforce_profile_role() and
-- transition_order_status(). Six copies of the list that decides who is an administrator.
--
-- That is a hazard rather than a style complaint. It already caused a real failure: the
-- verification tooling knows how to add a throwaway admin to is_admin() and
-- enforce_profile_role(), so a test admin could read the admin panel but got
-- "Only allowlisted admins can change order status" from transition_order_status() -- a
-- third copy nobody was patching. Every transition failed, and because the guard fired
-- before the transition rules, the test's "skipping a step is refused" check passed for
-- entirely the wrong reason. A test suite reporting success while the feature is dead is
-- worse than no test suite.
--
-- The same drift would bite the owners: changing an admin email means finding six places,
-- and missing one produces an account that is admin in some code paths and a customer in
-- others -- which is a lockout that presents as "my role keeps reverting".
--
-- So the list moves into one function that owns it, and the other five ask it.
--
--   public.is_admin_email(text) -> boolean
--
-- It reads no tables, so it is cheaper than the is_admin() it replaces, not more
-- expensive. `lower(coalesce(...))` keeps the old case-insensitivity and keeps a null
-- email from matching anything.

create or replace function public.is_admin_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $fn$
  select lower(coalesce(p_email, '')) in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com')
$fn$;

comment on function public.is_admin_email(text) is
  'The single owner of the admin allowlist. No other function may hard-code an admin email; they must call this, so the list cannot drift between code paths.';

-- is_admin(): identical semantics -- still an EXISTS over auth.users, so it is false
-- rather than null when there is no signed-in user -- but the list now comes from one place.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = 'public', 'auth', 'pg_catalog'
as $fn$
  select exists (
    select 1
    from auth.users
    where auth.users.id = auth.uid()
      and public.is_admin_email(auth.users.email)
  )
$fn$;

-- handle_new_user(): assigns the role at signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'auth', 'pg_catalog'
as $fn$
declare
  v_role text := 'customer';
  v_email_lower text;
  v_phone text;
begin
  v_email_lower := lower(new.email);
  if public.is_admin_email(v_email_lower) then
    v_role := 'admin';
  else
    v_role := 'customer';
  end if;

  v_phone := coalesce(new.raw_user_meta_data->>'phone', '');
  -- Normalize empty to null for admin convenience (keeps partial index clean)
  if v_phone = '' and v_role = 'admin' then
    v_phone := null;
  end if;

  insert into public.profiles (id, name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_phone,
    v_role
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    name = coalesce(public.profiles.name, excluded.name),
    -- Keep phone if already present, else use new
    phone = coalesce(public.profiles.phone, excluded.phone),
    updated_at = now();
  return new;
end;
$fn$;

-- sync_profile_on_email_change(): an email change re-derives the role, so an admin who
-- renames their address keeps admin and a customer who claims one loses it.
create or replace function public.sync_profile_on_email_change()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'auth', 'pg_catalog'
as $fn$
declare
  v_new_role text;
begin
  if public.is_admin_email(lower(new.email)) then
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
$fn$;

-- custom_access_token_hook(): bakes the role into the JWT.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'auth', 'pg_catalog'
as $fn$
declare
  v_email text;
  v_role text;
begin
  select lower(email) into v_email from auth.users where id = (event->>'user_id')::uuid;
  if public.is_admin_email(v_email) then
    v_role := 'admin';
  else
    v_role := 'customer';
  end if;
  event := jsonb_set(event, '{claims,app_role}', to_jsonb(v_role));
  event := jsonb_set(event, '{claims,is_admin}', to_jsonb(v_role = 'admin'));
  return event;
exception when others then
  return event;
end;
$fn$;

-- enforce_profile_role(): the BEFORE trigger, so a direct profiles UPDATE cannot self-promote.
create or replace function public.enforce_profile_role()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'auth', 'pg_catalog'
as $fn$
declare
  v_email text;
  v_allowed_role text;
begin
  select lower(email) into v_email from auth.users where id = new.id;
  if v_email is null then
    v_email := lower(new.email);
  end if;

  if public.is_admin_email(v_email) then
    v_allowed_role := 'admin';
  else
    v_allowed_role := 'customer';
  end if;

  if new.role is distinct from v_allowed_role then
    new.role := v_allowed_role;
  end if;

  -- For admin, allow phone null/'' regardless of format
  if v_allowed_role = 'admin' and (new.phone is null or new.phone = '') then
    new.phone := null;
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;

-- transition_order_status(): the third copy of the list, now derived like the rest. The
-- guard is kept rather than deleted -- it is a genuine second condition, that the *id
-- passed in* maps to an allowlisted address, and dropping a security check because it looks
-- redundant is how the next version loses it. It is now consistent with is_admin() by
-- construction instead of by two edits having to agree.
create or replace function public.transition_order_status(p_order_id uuid, p_new_status text, p_admin_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'auth', 'pg_catalog'
as $fn$
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
  if not exists (select 1 from auth.users where id = p_admin_id and public.is_admin_email(email)) then
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
$fn$;
