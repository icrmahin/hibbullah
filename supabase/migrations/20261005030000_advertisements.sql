-- Advertisements — a merchant-managed banner, distinct from a discount.
--
-- ── why this is a new table ────────────────────────────────────────────────────
-- The homepage banner was generated, not managed: it took the first four products,
-- preferred whichever had a discount, and then printed copy nobody wrote — "Special
-- offer", "Selected medicines", "Limited-time offer" — over the top of them. A discount
-- is a fact about a price; this is a thing an owner decides to promote. Conflating them
-- is what put every newly uploaded product on the front page.
--
-- The three concepts are deliberately separate columns with separate lifecycles:
--
--   advertisements.is_active    is this banner showing at all
--   products.is_active          can this product still be bought
--   products.discount_percent   what it costs relative to its old price
--
-- Reusing `products.is_featured` would not work either: featured is a per-product
-- property, and an advertisement carries its own image, its own words and a destination
-- that does not have to be a product at all. Hence a table.
--
-- ── visibility is decided in the policy, not the client ────────────────────────
-- The public policy carries the active flag AND the date window, so a screen cannot
-- forget to filter and show a campaign that ended. An admin's policy is unconditional,
-- so an expired advertisement can still be found, edited and restarted.
--
-- No date, no sort order and no destination is invented by the app: every one is what
-- the admin typed.

create table if not exists public.advertisements (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  subtitle         text,
  image_url        text not null,
  -- `text` with a check rather than an enum: a new destination is an `alter ... add
  -- constraint`, not a type migration, and the constraint is visible in one place.
  destination_type text not null default 'none'
                   check (destination_type in ('none', 'product', 'category', 'manufacturer', 'url')),
  -- Text, not a uuid: the destination may be a url, and a dead foreign key would refuse
  -- the row the moment the referenced product is deleted. The app resolves it on tap.
  destination_id   text,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  starts_at        timestamptz,
  ends_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- A banner pointed at a product without an id, or at a url with an id, is a banner
  -- that does nothing when tapped. Caught here rather than in a form that forgot a rule.
  constraint advertisement_destination_matches_type check (
    (destination_type = 'url'      and destination_id is not null)
    or (destination_type = 'none'   and destination_id is null)
    or (destination_type in ('product', 'category', 'manufacturer') and destination_id is not null)
  ),
  constraint advertisement_window_ordered check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

-- The homepage asks for exactly this: live banners, in display order.
create index if not exists idx_advertisements_live
  on public.advertisements (is_active, sort_order);

-- Reuses `public.update_updated_at()`, the same trigger function every other table with
-- an `updated_at` uses (initial schema) — a second copy would be a second thing to keep
-- in sync for no benefit.
drop trigger if exists trg_advertisements_updated_at on public.advertisements;
create trigger trg_advertisements_updated_at
  before update on public.advertisements
  for each row execute function public.update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Policies are permissive, so they OR together: an admin matches theirs and sees
-- everything, everybody else matches only the live-window one.
alter table public.advertisements enable row level security;

drop policy if exists "Admins can manage advertisements" on public.advertisements;
create policy "Admins can manage advertisements"
  on public.advertisements for all
  using (is_admin())
  with check (is_admin());

drop policy if exists "Anyone can view live advertisements" on public.advertisements;
create policy "Anyone can view live advertisements"
  on public.advertisements for select
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at   is null or ends_at   >= now())
  );
