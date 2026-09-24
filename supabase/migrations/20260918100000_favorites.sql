-- Favorites — customer wishlisted products, recent first
create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint unique_user_product_fav unique (user_id, product_id)
);

create index idx_favorites_user_created on public.favorites (user_id, created_at desc);
create index idx_favorites_product on public.favorites (product_id);

alter table public.favorites enable row level security;

create policy "Customers can view own favorites"
  on public.favorites for select using (auth.uid() = user_id);
create policy "Customers can manage own favorites"
  on public.favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
