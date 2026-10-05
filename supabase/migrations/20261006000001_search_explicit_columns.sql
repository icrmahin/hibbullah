-- Fixup for 20261006000000: search_products inner query used p.*, which expands
-- to cost_price and fails for anon/authenticated after the column revoke.
-- Explicit column list (same 19 granted columns, same order downstream expects).
-- Return signature unchanged, so CREATE OR REPLACE suffices (no DROP).

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
      p.stock,
      p.unit,
      p.image_url,
      p.secondary_image_url,
      p.is_active,
      p.is_featured,
      p.created_at,
      p.updated_at,
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
