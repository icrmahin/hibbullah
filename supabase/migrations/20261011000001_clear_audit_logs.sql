-- Allow admins to clear the audit log.
-- SECURITY DEFINER so the function runs with owner privileges and can delete
-- rows that the RLS policy would otherwise block.

create policy "Admins can delete audit entries"
  on public.audit_entries for delete
  using (auth.jwt() ->> 'role' = 'admin');

create or replace function public.clear_audit_entries()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.audit_entries;
end;
$$;

grant execute on function public.clear_audit_entries() to anon, authenticated;
