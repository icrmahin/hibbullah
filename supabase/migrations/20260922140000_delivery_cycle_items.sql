-- delivery_cycle_items — products in a delivery cycle (was described in docs but not migrated)
create table if not exists public.delivery_cycle_items (
  id uuid primary key default gen_random_uuid(),
  delivery_cycle_id uuid not null references public.delivery_cycles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity >= 1),
  created_at timestamptz not null default now(),
  constraint unique_cycle_product unique (delivery_cycle_id, product_id)
);

create index if not exists idx_delivery_cycle_items_cycle on public.delivery_cycle_items (delivery_cycle_id);
create index if not exists idx_delivery_cycle_items_product on public.delivery_cycle_items (product_id);

alter table public.delivery_cycle_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='delivery_cycle_items' and policyname='Customers can view own delivery cycle items') then
    create policy "Customers can view own delivery cycle items"
      on public.delivery_cycle_items for select
      using (exists (select 1 from public.delivery_cycles dc where dc.id = delivery_cycle_id and dc.customer_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='delivery_cycle_items' and policyname='Customers can manage own delivery cycle items') then
    create policy "Customers can manage own delivery cycle items"
      on public.delivery_cycle_items for all
      using (exists (select 1 from public.delivery_cycles dc where dc.id = delivery_cycle_id and dc.customer_id = auth.uid()))
      with check (exists (select 1 from public.delivery_cycles dc where dc.id = delivery_cycle_id and dc.customer_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='delivery_cycle_items' and policyname='Admins can view all delivery cycle items') then
    create policy "Admins can view all delivery cycle items"
      on public.delivery_cycle_items for select
      using (auth.jwt() ->> 'role' = 'admin');
  end if;
end $$;

-- Trigger to keep delivery_cycles.estimated_total in sync
create or replace function public.sync_delivery_cycle_total()
returns trigger
language plpgsql
as $$
begin
  update public.delivery_cycles dc
  set estimated_total = (
    select coalesce(sum(p.price * dci.quantity),0)
    from public.delivery_cycle_items dci
    join public.products p on p.id = dci.product_id
    where dci.delivery_cycle_id = coalesce(new.delivery_cycle_id, old.delivery_cycle_id)
  )
  where dc.id = coalesce(new.delivery_cycle_id, old.delivery_cycle_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_delivery_cycle_sync_total on public.delivery_cycle_items;
create trigger trg_delivery_cycle_sync_total
  after insert or update or delete on public.delivery_cycle_items
  for each row execute function public.sync_delivery_cycle_total();
