-- Product soft delete: hide deleted products from every catalog path, keep history.
--
-- deleteProduct() deactivates (rather than deletes) a product that has order
-- history, because order_items.product_id is ON DELETE RESTRICT. But is_active
-- is also the admin list's status filter, and that list defaults to "all" — so
-- a deleted product stayed visible in the admin UI and read as "delete only
-- deactivated it".
--
-- is_deleted separates the two meanings: deactivated (still listed under the
-- Inactive filter) vs deleted (hidden from admin and customer lists alike).
-- The row — and its order_items history — stays in the database.

alter table public.products
  add column if not exists is_deleted boolean not null default false;

create index if not exists idx_products_is_deleted
  on public.products (is_deleted);

-- browse_products: same contract, plus the is_deleted column and predicate.
-- Deleted rows are hidden from everyone, admins included.
--
-- DROP first: Postgres forbids changing a function's return type with
-- CREATE OR REPLACE (42P13).
drop function if exists public.browse_products(uuid, uuid, text, text, integer, timestamptz, uuid, int);
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
  is_deleted boolean,
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
    p.is_deleted,
    p.is_featured,
    p.created_at,
    p.updated_at,
    c.name,
    c.slug,
    m.name
  from public.products p
  join public.categories c on c.id = p.category_id
  join public.manufacturers m on m.id = p.manufacturer_id
  where (coalesce(p.is_deleted, false) = false)
    and (p_category is null or p.category_id = p_category)
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

-- search_products: same ladder and contract, plus the is_deleted column and
-- predicate. Deleted rows are hidden from everyone, admins included.
--
-- DROP first: see browse_products above (42P13).
drop function if exists public.search_products(text, uuid, uuid, text, text, integer, int, int);
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
  is_deleted boolean,
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
    select
      lower(btrim(coalesce(p_query, ''))) as v,
      -- A second copy of the term, escaped for `like`.
      --
      -- LIKE's default escape character is a backslash, so a term carrying `%`, `_` or `\`
      -- has to be neutralised before it is interpolated into a pattern. The app already
      -- strips these (`sanitizeSearchTerm`, src/services/searchQuery.ts) because they are
      -- PostgREST syntax, so this changes nothing for app traffic. What it removes is the
      -- case where the RPC is called directly — by a verifier, or by anyone holding the
      -- publishable key, which is in the bundle and is therefore public — with `p_query`
      -- set to `%`, and a search silently becomes "return the whole catalogue".
      --
      -- Backslash first, or it would escape the backslashes added by the next two.
      replace(
        replace(
          replace(lower(btrim(coalesce(p_query, ''))), '\', '\\'),
          '%', '\%'
        ),
        '_', '\_'
      ) as pat
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
        when lower(p.name) like (select pat from term) || '%' then 1
        when lower(p.brand) like (select pat from term) || '%' then 2
        when lower(m.name) like (select pat from term) || '%' then 3
        when lower(p.generic_name) like (select pat from term) || '%' then 4
        when p.brand ilike '%' || (select pat from term) || '%' then 5
        when m.name ilike '%' || (select pat from term) || '%' then 6
        when p.name ilike '%' || (select pat from term) || '%' then 7
        when p.generic_name ilike '%' || (select pat from term) || '%' then 8
        when p.name % (select v from term) then 9
        when p.generic_name % (select v from term) then 10
        when p.brand % (select v from term) then 11
        when m.name % (select v from term) then 12
        else 13
      end as rank
    from public.products p
    join public.categories c on c.id = p.category_id
    join public.manufacturers m on m.id = p.manufacturer_id
    where (coalesce(p.is_deleted, false) = false)
      and (p_category is null or p.category_id = p_category)
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
        or lower(p.name) like (select pat from term) || '%'
        or lower(p.brand) like (select pat from term) || '%'
        or lower(m.name) like (select pat from term) || '%'
        or lower(p.generic_name) like (select pat from term) || '%'
        or p.name ilike '%' || (select pat from term) || '%'
        or p.brand ilike '%' || (select pat from term) || '%'
        or m.name ilike '%' || (select pat from term) || '%'
        or p.generic_name ilike '%' || (select pat from term) || '%'
        or p.description ilike '%' || (select pat from term) || '%'
        or p.name % (select v from term)
        or p.generic_name % (select v from term)
        or p.brand % (select v from term)
        or m.name % (select v from term)
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
    mt.is_deleted,
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
