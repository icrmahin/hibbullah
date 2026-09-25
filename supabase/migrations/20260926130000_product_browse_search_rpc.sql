-- Server-side product browse + search.
--
-- Before this, search was a leading-'%' ILIKE OR'd across three columns,
-- duplicated in four places (products.ts:46, products.ts:135, admin.ts:260, plus
-- two client-side .includes filters), fired on every keystroke with no debounce,
-- and paired with count:'exact' — a full table count per keystroke on top of a
-- per-row is_admin() RLS evaluation. PostgREST's .or() + .eq() + .order() +
-- .range() combination also frequently could not reach the existing trigram
-- indexes.
--
-- Two functions rather than one, deliberately: a single merged function would be
-- forced to compute a count(*) over () total, which is exactly the full-count
-- cost this migration exists to remove. Browse mode returns no total at all.

-- ---------------------------------------------------------------------------
-- browse_products: keyset (cursor) paging, no count.
-- ---------------------------------------------------------------------------
create or replace function public.browse_products(
  p_category uuid default null,
  p_manufacturer uuid default null,
  p_status text default null,
  p_stock text default null,
  p_low_stock_threshold integer default 10,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 24
)
returns table (
  id uuid,
  name text,
  brand text,
  generic_name text,
  description text,
  manufacturer_id uuid,
  category_id uuid,
  price numeric,
  original_price numeric,
  discount_percent integer,
  cost_price numeric,
  stock integer,
  unit text,
  image_url text,
  secondary_image_url text,
  is_active boolean,
  is_featured boolean,
  created_at timestamptz,
  updated_at timestamptz,
  category_name text,
  category_slug text,
  manufacturer_name text
)
language sql
stable
-- SECURITY INVOKER is deliberate. It keeps the existing RLS on products
-- (20260918020000_fix_admin_rls.sql:55-68 — active-only for everyone, all rows
-- for admins) in force. A SECURITY DEFINER version would bypass RLS and leak
-- inactive products to customers. Do not "optimize" this into definer.
security invoker
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.brand,
    p.generic_name,
    p.description,
    p.manufacturer_id,
    p.category_id,
    p.price,
    p.original_price,
    p.discount_percent,
    p.cost_price,
    p.stock,
    p.unit,
    p.image_url,
    p.secondary_image_url,
    p.is_active,
    p.is_featured,
    p.created_at,
    p.updated_at,
    c.name,
    c.slug,
    m.name
  from public.products p
  join public.categories c on c.id = p.category_id
  join public.manufacturers m on m.id = p.manufacturer_id
  where (p_category is null or p.category_id = p_category)
    and (p_manufacturer is null or p.manufacturer_id = p_manufacturer)
    and (
      p_status is null
      or (p_status = 'active' and p.is_active)
      or (p_status = 'inactive' and not p.is_active)
    )
    and (
      p_stock is null
      or (p_stock = 'in_stock' and p.stock > 0)
      or (p_stock = 'out' and p.stock <= 0)
      or (
        p_stock = 'low'
        and p.stock > 0
        and p.stock < coalesce(p_low_stock_threshold, 10)
      )
    )
    and (
      p_cursor_created_at is null
      or p_cursor_id is null
      or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 100);
$$;

-- ---------------------------------------------------------------------------
-- search_products: ranked, total included in the same round trip.
--
-- Ranking ladder, cheapest and most predictable first:
--   0 exact name  1 name prefix  2 brand prefix  3 generic prefix
--   4-6 trigram similarity (typo tolerance)  7 everything else
-- Exact/prefix hits always outrank a fuzzy match, so a short or misspelled term
-- degrades to "close enough" instead of noise.
-- ---------------------------------------------------------------------------
create or replace function public.search_products(
  p_query text,
  p_category uuid default null,
  p_manufacturer uuid default null,
  p_status text default null,
  p_stock text default null,
  p_low_stock_threshold integer default 10,
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  brand text,
  generic_name text,
  description text,
  manufacturer_id uuid,
  category_id uuid,
  price numeric,
  original_price numeric,
  discount_percent integer,
  cost_price numeric,
  stock integer,
  unit text,
  image_url text,
  secondary_image_url text,
  is_active boolean,
  is_featured boolean,
  created_at timestamptz,
  updated_at timestamptz,
  category_name text,
  category_slug text,
  manufacturer_name text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with term as (
    select lower(btrim(coalesce(p_query, ''))) as v
  ),
  matched as (
    select
      p.*,
      c.name as category_name,
      c.slug as category_slug,
      m.name as manufacturer_name,
      case
        when btrim(coalesce(p_query, '')) = '' then 0
        when lower(p.name) = (select v from term) then 0
        when lower(p.name) like (select v from term) || '%' then 1
        when lower(p.brand) like (select v from term) || '%' then 2
        when lower(p.generic_name) like (select v from term) || '%' then 3
        when p.name % (select v from term) then 4
        when p.generic_name % (select v from term) then 5
        when p.brand % (select v from term) then 6
        else 7
      end as rank
    from public.products p
    join public.categories c on c.id = p.category_id
    join public.manufacturers m on m.id = p.manufacturer_id
    where (p_category is null or p.category_id = p_category)
      and (p_manufacturer is null or p.manufacturer_id = p_manufacturer)
      and (
        p_status is null
        or (p_status = 'active' and p.is_active)
        or (p_status = 'inactive' and not p.is_active)
      )
      and (
        p_stock is null
        or (p_stock = 'in_stock' and p.stock > 0)
        or (p_stock = 'out' and p.stock <= 0)
        or (
          p_stock = 'low'
          and p.stock > 0
          and p.stock < coalesce(p_low_stock_threshold, 10)
        )
      )
      and (
        btrim(coalesce(p_query, '')) = ''
        or lower(p.name) like (select v from term) || '%'
        or p.name % (select v from term)
        or p.generic_name % (select v from term)
        or p.brand % (select v from term)
        or p.description % (select v from term)
      )
  )
  select
    mt.id,
    mt.name,
    mt.brand,
    mt.generic_name,
    mt.description,
    mt.manufacturer_id,
    mt.category_id,
    mt.price,
    mt.original_price,
    mt.discount_percent,
    mt.cost_price,
    mt.stock,
    mt.unit,
    mt.image_url,
    mt.secondary_image_url,
    mt.is_active,
    mt.is_featured,
    mt.created_at,
    mt.updated_at,
    mt.category_name,
    mt.category_slug,
    mt.manufacturer_name,
    count(*) over ()
  from matched mt
  order by mt.rank, mt.name, mt.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset least(greatest(coalesce(p_offset, 0), 0), 5000);
$$;

grant execute on function public.browse_products(uuid, uuid, text, text, integer, timestamptz, uuid, int)
  to anon, authenticated;
grant execute on function public.search_products(text, uuid, uuid, text, text, integer, int, int)
  to anon, authenticated;
