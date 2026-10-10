-- Fix the company_name migration (20261011000000), which broke three things:
--
-- 1. PERMISSION DENIED on every product read. 20261006000000_security_hardening
--    revoked table SELECT and re-granted per-column (everything except
--    cost_price). The new company_name column was never granted, so every
--    direct read AND every SECURITY INVOKER rpc selecting it fails with 42501.
-- 2. create_product referenced created_at/updated_at on inventory_items, which
--    only has last_updated. It also dropped the is_admin() guard, broke the
--    stock=0 + trigger invariant, and was granted to anon. Restored to the
--    exact original semantics, minus brand/manufacturer_id plus company_name.
-- 3. browse/search lost their LEFT JOINs (uncategorized products vanish),
--    the is_deleted predicate (soft-deleted rows resurface in search), the
--    DESC keyset direction, and LIKE-escaping. Restored from the 20261006000005
--    bodies with only the brand/manufacturer -> company_name swap.

-- ── 1. Column grant for the new column ──
grant select (company_name) on public.products to anon, authenticated;

-- ── 2. create_product: original semantics, company_name in, brand/manufacturer out ──
do $$
declare r record;
begin
  for r in select oid::regprocedure::text as sig
           from pg_proc
           where proname = 'create_product'
             and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

create function public.create_product(
  p_id uuid,
  p_name text,
  p_company_name text,
  p_generic_name text,
  p_category_id uuid,
  p_price numeric,
  p_description text default '',
  p_original_price numeric default null,
  p_discount_percent integer default 0,
  p_cost_price numeric default null,
  p_unit text default 'pack',
  p_image_url text default null,
  p_secondary_image_url text default null,
  p_is_active boolean default true,
  p_is_featured boolean default false,
  p_initial_stock integer default 0,
  p_batch_number text default null,
  p_expiry_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_batch text;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.products (
    id,
    name,
    company_name,
    generic_name,
    description,
    category_id,
    price,
    original_price,
    discount_percent,
    cost_price,
    unit,
    image_url,
    secondary_image_url,
    is_active,
    is_featured,
    stock
  ) values (
    p_id,
    p_name,
    p_company_name,
    p_generic_name,
    coalesce(p_description, ''),
    p_category_id,
    p_price,
    p_original_price,
    coalesce(p_discount_percent, 0),
    p_cost_price,
    coalesce(p_unit, 'pack'),
    p_image_url,
    p_secondary_image_url,
    coalesce(p_is_active, true),
    coalesce(p_is_featured, false),
    0
  )
  returning id into v_id;

  if coalesce(p_initial_stock, 0) > 0 then
    -- inventory_items.batch_number is NOT NULL and unique per product, so the
    -- default is derived from the product id.
    v_batch := coalesce(
      nullif(btrim(coalesce(p_batch_number, '')), ''),
      'BATCH-' || upper(left(v_id::text, 8)) || '-001'
    );

    insert into public.inventory_items (product_id, batch_number, quantity, expiry_date)
    values (v_id, v_batch, p_initial_stock, p_expiry_date);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.create_product(
  uuid, text, text, text, uuid, numeric, text,
  numeric, integer, numeric, text, text, text, boolean, boolean, integer, text, date
) from public;

grant execute on function public.create_product(
  uuid, text, text, text, uuid, numeric, text,
  numeric, integer, numeric, text, text, text, boolean, boolean, integer, text, date
) to authenticated;

-- ── 3. browse_products: 20261006000005 body, brand/manufacturer -> company_name ──
drop function if exists public.browse_products(uuid, text, text, integer, timestamptz, uuid, int);

create function public.browse_products(
  p_category uuid default null,
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
  company_name text,
  generic_name text,
  description text,
  category_id uuid,
  price numeric,
  original_price numeric,
  discount_percent integer,
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
  category_slug text
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
    p.company_name,
    p.generic_name,
    p.description,
    p.category_id,
    p.price,
    p.original_price,
    p.discount_percent,
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
    c.slug
  from public.products p
  left join public.categories c on c.id = p.category_id
  where (coalesce(p.is_deleted, false) = false)
    and (p_category is null or p.category_id = p_category)
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

-- ── 4. search_products: 20261006000005 body, brand/manufacturer -> company_name ──
drop function if exists public.search_products(text, uuid, text, text, integer, int, int);

create function public.search_products(
  p_query text,
  p_category uuid default null,
  p_status text default null,
  p_stock text default null,
  p_low_stock_threshold integer default 10,
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  company_name text,
  generic_name text,
  description text,
  category_id uuid,
  price numeric,
  original_price numeric,
  discount_percent integer,
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
      -- case where the RPC is called directly with `p_query` set to `%`, and a search
      -- silently becomes "return the whole catalogue".
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
p.id,
      p.name,
      p.company_name,
      p.generic_name,
      p.description,
      p.category_id,
      p.price,
      p.original_price,
      p.discount_percent,
      p.stock,
      p.unit,
      p.image_url,
      p.secondary_image_url,
      p.is_active,
      p.is_deleted,
      p.is_featured,
      p.created_at,
      p.updated_at,
      c.name as category_name,
      c.slug as category_slug,
      case
        when btrim(coalesce(p_query, '')) = '' then 0
        when lower(p.name) = (select v from term) then 0
        when lower(p.name) like (select pat from term) || '%' then 1
        when lower(p.company_name) like (select pat from term) || '%' then 2
        when lower(p.generic_name) like (select pat from term) || '%' then 3
        when p.company_name ilike '%' || (select pat from term) || '%' then 4
        when p.name ilike '%' || (select pat from term) || '%' then 5
        when p.generic_name ilike '%' || (select pat from term) || '%' then 6
        when p.name % (select v from term) then 7
        when p.generic_name % (select v from term) then 8
        when p.company_name % (select v from term) then 9
        else 10
      end as rank
    from public.products p
    left join public.categories c on c.id = p.category_id
    where (coalesce(p.is_deleted, false) = false)
      and (p_category is null or p.category_id = p_category)
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
        or lower(p.company_name) like (select pat from term) || '%'
        or lower(p.generic_name) like (select pat from term) || '%'
        or p.name ilike '%' || (select pat from term) || '%'
        or p.company_name ilike '%' || (select pat from term) || '%'
        or p.generic_name ilike '%' || (select pat from term) || '%'
        or p.description ilike '%' || (select pat from term) || '%'
        or p.name % (select v from term)
        or p.generic_name % (select v from term)
        or p.company_name % (select v from term)
      )
  )
  select
    mt.id,
    mt.name,
    mt.company_name,
    mt.generic_name,
    mt.description,
    mt.category_id,
    mt.price,
    mt.original_price,
    mt.discount_percent,
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
    count(*) over ()
  from matched mt
  order by mt.rank, mt.name, mt.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset least(greatest(coalesce(p_offset, 0), 0), 5000);
$$;

grant execute on function public.browse_products(uuid, text, text, integer, timestamptz, uuid, int)
  to anon, authenticated;
grant execute on function public.search_products(text, uuid, text, text, integer, int, int)
  to anon, authenticated;

-- ── 5. Trigram index for company_name (replaces the dropped brand index) ──
create index if not exists idx_products_company_name
  on public.products using gin (company_name gin_trgm_ops);
