-- Add a third administrator: hibbullah2027@gmail.com
--
-- One line of behaviour, but it is written as a migration rather than an edit to
-- 20260927020000_admin_allowlist_single_source_and_return_rls.sql, because a migration that
-- has already run is history. Editing its text would make this file claim a definition the
-- live database no longer has, and would leave every project that already applied it stuck
-- at two admins with no record of why.
--
-- Only is_admin_email() changes. The other five functions that decide admin rights --
-- is_admin(), handle_new_user(), sync_profile_on_email_change(), custom_access_token_hook(),
-- enforce_profile_role() and transition_order_status() -- delegate to it, which is the whole
-- point of that migration. This is the first real exercise of it: adding an admin is now a
-- one-line change instead of six edits that all have to agree.
--
-- Three consequences worth stating, because they used to need six edits each:
--
--   * a new signup gets profiles.role = 'admin'          (handle_new_user)
--   * the role is stamped into the JWT, so the app sees it (custom_access_token_hook)
--   * the RLS policies on every admin table admit them     (is_admin)
--
-- hibbullah2027@gmail.com must still sign up before any of that is observable. The
-- allowlist grants nothing to an address with no auth.users row; handle_new_user() runs on
-- signup and assigns the role then.

create or replace function public.is_admin_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $fn$
  select lower(coalesce(p_email, '')) in (
    'icrmahin@gmail.com',
    'hibbullah82026@gmail.com',
    'hibbullah2027@gmail.com'
  )
$fn$;

comment on function public.is_admin_email(text) is
  'The single owner of the admin allowlist. No other function may hard-code an admin email; they must call this, so the list cannot drift between code paths. To add or remove an administrator, change it here only -- supabase/verify-sql-sync.mjs fails if any other function grows its own copy, or if the client-side ADMIN_EMAILS sets in src/providers/AuthProvider.tsx and src/components/auth/UnifiedAuth.tsx stop matching this list.';
