-- Admin allowlist for is_admin(): only the fixed production emails
-- Registering with one of these promotes the profile role to admin.

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
  event := jsonb_set(event, '{claims,app_role}', to_jsonb(v_role));
  event := jsonb_set(event, '{claims,is_admin}', to_jsonb(v_role = 'admin'));
  return event;
exception when others then
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

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
  update public.orders set status = p_new_status, updated_at = now() where id = p_order_id;
  return true;
end;
$$ language plpgsql;
