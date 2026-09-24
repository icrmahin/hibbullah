-- PRODUCTION E-COM: Admin no-phone, User info required at checkout
-- Admin (icrmahin@gmail.com, Hibbullah82026@gmail.com) must be able to sign in without phone
-- User must provide phone/address at checkout; DB must not block admin creation

-- 1. Allow phone to be nullable/empty for admins: relax profiles.phone column
alter table public.profiles alter column phone drop not null;
alter table public.profiles drop constraint if exists profiles_phone_format;
alter table public.profiles add constraint profiles_phone_format
  check (phone is null or phone = '' or phone ~* '^\+?254[17][0-9]{8}$');

-- Partial unique index already allows multiple '' but not multiple nulls with no where; recreate to allow both
drop index if exists idx_profiles_phone;
create unique index idx_profiles_phone on public.profiles (phone) where phone is not null and phone <> '' and phone <> 'null';

-- 2. Update handle_new_user to allow admin without phone, keep customer phone optional at signup (enforced at checkout)
create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_role text := 'customer';
  v_email_lower text;
  v_phone text;
begin
  v_email_lower := lower(new.email);
  if v_email_lower in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com') then
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
$$ language plpgsql;

-- 3. Update enforce_profile_role to allow admin phone null/'' without forcing format
create or replace function public.enforce_profile_role()
returns trigger
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_email text;
  v_allowed_role text;
begin
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

  -- For admin, allow phone null/'' regardless of format
  if v_allowed_role = 'admin' and (new.phone is null or new.phone = '') then
    new.phone := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_enforce_role on public.profiles;
create trigger trg_profiles_enforce_role
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_role();

-- 4. Ensure sync on email change preserves phone if admin
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

-- 5. Backfill: admins with '' phone -> null; ensure roles still correct
update public.profiles set phone = null, updated_at = now() where role = 'admin' and phone = '';
