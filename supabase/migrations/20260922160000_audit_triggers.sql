-- Audit triggers: populate audit_entries on key mutations (was empty — audit screen showed nothing)

-- Make actor_id nullable to allow system-triggered audits without FK violation fallback
alter table public.audit_entries alter column actor_id drop not null;

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
  -- Resolve actor: authenticated user or fallback to row owner
  v_actor := auth.uid();
  if v_actor is null then
    -- try to derive from row
    if TG_OP = 'DELETE' then
      v_actor := coalesce((OLD::jsonb ->> 'customer_id')::uuid, (OLD::jsonb ->> 'user_id')::uuid, (OLD::jsonb ->> 'actor_id')::uuid);
    else
      v_actor := coalesce((NEW::jsonb ->> 'customer_id')::uuid, (NEW::jsonb ->> 'user_id')::uuid, (NEW::jsonb ->> 'actor_id')::uuid);
    end if;
  end if;

  if TG_OP = 'INSERT' then
    v_action := 'INSERT';
    v_record_id := coalesce((NEW::jsonb ->> 'id')::uuid, gen_random_uuid());
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then
    v_action := 'UPDATE';
    v_record_id := coalesce((NEW::jsonb ->> 'id')::uuid, (OLD::jsonb ->> 'id')::uuid);
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'DELETE' then
    v_action := 'DELETE';
    v_record_id := (OLD::jsonb ->> 'id')::uuid;
    v_old := to_jsonb(OLD);
  end if;

  -- Only log if we can identify an actor or still log with null (admin will see it)
  insert into public.audit_entries (actor_id, action, record_type, record_id, old_value, new_value)
  values (v_actor, v_action, v_record_type, v_record_id, v_old, v_new);

  return coalesce(NEW, OLD);
exception when others then
  -- Never break main transaction due to audit failure
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_audit_orders on public.orders;
create trigger trg_audit_orders after insert or update or delete on public.orders for each row execute function public.audit_log();

drop trigger if exists trg_audit_products on public.products;
create trigger trg_audit_products after insert or update or delete on public.products for each row execute function public.audit_log();

drop trigger if exists trg_audit_inventory on public.inventory_items;
create trigger trg_audit_inventory after insert or update or delete on public.inventory_items for each row execute function public.audit_log();

drop trigger if exists trg_audit_returns on public.return_requests;
create trigger trg_audit_returns after insert or update or delete on public.return_requests for each row execute function public.audit_log();

drop trigger if exists trg_audit_delivery_cycles on public.delivery_cycles;
create trigger trg_audit_delivery_cycles after insert or update or delete on public.delivery_cycles for each row execute function public.audit_log();

drop trigger if exists trg_audit_order_items on public.order_items;
create trigger trg_audit_order_items after insert or update or delete on public.order_items for each row execute function public.audit_log();
