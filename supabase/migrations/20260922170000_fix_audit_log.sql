-- Fix audit_log: NEW::jsonb is invalid for record, use to_jsonb(NEW)
create or replace function public.audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_action text;
  v_record_type text := TG_TABLE_NAME;
  v_record_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  v_actor := auth.uid();
  if v_actor is null then
    if TG_OP = 'DELETE' then
      v_actor := coalesce((to_jsonb(OLD) ->> 'customer_id')::uuid, (to_jsonb(OLD) ->> 'user_id')::uuid, (to_jsonb(OLD) ->> 'actor_id')::uuid);
    else
      v_actor := coalesce((to_jsonb(NEW) ->> 'customer_id')::uuid, (to_jsonb(NEW) ->> 'user_id')::uuid, (to_jsonb(NEW) ->> 'actor_id')::uuid);
    end if;
  end if;

  if TG_OP = 'INSERT' then
    v_action := 'INSERT';
    v_record_id := coalesce((to_jsonb(NEW) ->> 'id')::uuid, gen_random_uuid());
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then
    v_action := 'UPDATE';
    v_record_id := coalesce((to_jsonb(NEW) ->> 'id')::uuid, (to_jsonb(OLD) ->> 'id')::uuid);
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'DELETE' then
    v_action := 'DELETE';
    v_record_id := (to_jsonb(OLD) ->> 'id')::uuid;
    v_old := to_jsonb(OLD);
  end if;

  insert into public.audit_entries (actor_id, action, record_type, record_id, old_value, new_value)
  values (v_actor, v_action, v_record_type, v_record_id, v_old, v_new);

  return coalesce(NEW, OLD);
exception when others then
  return coalesce(NEW, OLD);
end;
$$;
