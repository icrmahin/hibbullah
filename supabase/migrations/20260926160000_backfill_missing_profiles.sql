-- Backfill profiles for auth users that have none.
--
-- Problem: public.profiles rows are created by trg_auth_user_created, an
-- AFTER INSERT trigger on auth.users. A user whose profile row was deleted (or who
-- predates that trigger) is left permanently inconsistent: the row never comes back,
-- because nothing re-runs the trigger.
--
-- Why that breaks more than it looks: is_admin() reads auth.users.email, so such a
-- user can still sign in and still pass every admin check. But every read of
-- public.profiles for them returns no row, so updateProfile() updates 0 rows and
-- reports success, the profile editor cannot load, the admin sidebar has no identity,
-- and setAvatarUrl() writes to a row that does not exist. The failure is silent.
--
-- This is the idempotent half of handle_new_user(), run as a set-based backfill.
-- It only inserts rows that are missing, so it is safe to re-run and safe to apply to
-- a database that is already consistent.

insert into public.profiles (id, name, email, phone, role)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1)),
  u.email,
  -- Only carry a phone across when it is already canonical. The raw metadata value
  -- has not been through normalizeBdPhone, and profiles_phone_format rejects
  -- anything that is not '+8801XXXXXXXXX', so a loose value would fail the whole
  -- statement. The user retypes it in the profile editor instead.
  case
    when u.raw_user_meta_data ->> 'phone' ~ '^\+8801[0-9]{9}$'
      then u.raw_user_meta_data ->> 'phone'
    else null
  end,
  -- Mirrors the allowlist in is_admin() and enforce_profile_role(). The trigger
  -- trg_profiles_enforce_role rewrites this on insert anyway; setting it correctly
  -- up front just keeps the value stable.
  case
    when lower(u.email) in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com')
      then 'admin'
    else 'customer'
  end
from auth.users u
where u.email is not null
  and not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Keep the trigger honest for the future: make profile creation self-healing rather
-- than dependent on a one-shot INSERT trigger. sync_profile_on_email_change already
-- covers email changes, so the only remaining gap was a missing row, handled above.
-- This assertion is the migration's own regression guard: if a new auth user can
-- exist without a profile, the invariant the app relies on is broken again.
do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing
  from auth.users u
  where u.email is not null
    and not exists (select 1 from public.profiles p where p.id = u.id);

  if v_missing > 0 then
    raise warning 'backfill incomplete: % auth user(s) still have no profile row', v_missing;
  end if;
end;
$$;
