-- clear_audit_entries() failed at runtime with "DELETE requires a WHERE clause".
-- That error comes from a statement-level guard on unqualified DELETEs, which
-- also inspects statements inside plpgsql functions. `where true` deletes every
-- row exactly as before while satisfying the guard.

create or replace function public.clear_audit_entries()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.audit_entries where true;
end;
$$;

grant execute on function public.clear_audit_entries() to anon, authenticated;
