-- Merge brand + manufacturer into a single company_name field.
-- Backfills from existing brand and manufacturer_name, then drops the old columns
-- and the manufacturers table. Also updates all RPCs that reference the old columns.

-- 1. Add company_name column
alter table public.products add column if not exists company_name text not null default '';

-- 2. Backfill: combine brand and manufacturer_name
update public.products p
set company_name = trim(
  coalesce(nullif(p.brand, ''), '') ||
  case when p.brand is not null and p.brand <> '' and m.name is not null and m.name <> '' then ' ' else '' end ||
  coalesce(nullif(m.name, ''), '')
)
from public.manufacturers m
where p.manufacturer_id = m.id;

-- Also update rows where manufacturer_id is null but brand exists
update public.products
set company_name = trim(coalesce(brand, ''))
where manufacturer_id is null;

-- 3. Drop old columns
alter table public.products drop column if exists brand;
alter table public.products drop column if exists manufacturer_id;

-- 4. Drop manufacturers table
drop table if exists public.manufacturers cascade;

-- 5. Update create_product RPC
-- Drop the old function signature first (Postgres cannot replace with different params)
-- Signature-agnostic drop: removes every public.create_product overload no matter
-- its parameter list, so this can never fail with "function does not exist".
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

create or replace function public.create_product(
  p_id uuid,
  p_name text,
  p_company_name text,
  p_price numeric,
  p_generic_name text default '',
  p_description text default '',
  p_category_id uuid default null,
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
  v_product_id uuid;
begin
  insert into public.products (
    id, name, company_name, generic_name, description, category_id,
    price, original_price, discount_percent, cost_price, unit,
    image_url, secondary_image_url, is_active, is_featured,
    stock, created_at, updated_at
  ) values (
    p_id, p_name, p_company_name, p_generic_name, p_description, p_category_id,
    p_price, p_original_price, p_discount_percent, p_cost_price, p_unit,
    p_image_url, p_secondary_image_url, p_is_active, p_is_featured,
    p_initial_stock, now(), now()
  );

  v_product_id := p_id;

  -- Create initial stock batch if stock > 0
  if p_initial_stock > 0 then
    insert into public.inventory_items (
      product_id, batch_number, quantity, expiry_date, status, created_at, updated_at
    ) values (
      v_product_id, p_batch_number, p_initial_stock, p_expiry_date, 'available', now(), now()
    );
  end if;

  return v_product_id;
end;
$$;

-- 6. Update search_products RPC
drop function if exists public.search_products(text, uuid, uuid, text, text, integer, int, int);

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
    select lower(btrim(coalesce(p_query, ''))) as v
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
      p.is_featured,
      p.created_at,
      p.updated_at,
      c.name as category_name,
      c.slug as category_slug,
      case
        when btrim(coalesce(p_query, '')) = '' then 0
        when lower(p.name) = (select v from term) then 0
        when lower(p.name) like (select v from term) || '%' then 1
        when lower(p.company_name) like (select v from term) || '%' then 2
        when lower(p.generic_name) like (select v from term) || '%' then 3
        when p.name % (select v from term) then 4
        when p.generic_name % (select v from term) then 5
        when p.company_name % (select v from term) then 6
        when p.description % (select v from term) then 7
        else 8
      end as rank
    from public.products p
    join public.categories c on c.id = p.category_id
    where (p_category is null or p.category_id = p_category)
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
        or p.company_name % (select v from term)
        or p.description % (select v from term)
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

-- 7. Update browse_products RPC
drop function if exists public.browse_products(uuid, uuid, text, text, integer, timestamptz, uuid, int);

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
    c.name as category_name,
    c.slug as category_slug
  from public.products p
  join public.categories c on c.id = p.category_id
  where (p_category is null or p.category_id = p_category)
    and p.is_deleted = false
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
      or p.created_at > p_cursor_created_at
      or (p.created_at = p_cursor_created_at and p.id > p_cursor_id)
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 100);
$$;

-- 8. Grants
grant execute on function public.create_product(uuid, text, text, numeric, text, text, uuid, numeric, integer, numeric, text, text, text, boolean, boolean, integer, text, date) to anon, authenticated;
grant execute on function public.search_products(text, uuid, text, text, integer, int, int) to anon, authenticated;
grant execute on function public.browse_products(uuid, text, text, integer, timestamptz, uuid, int) to anon, authenticated;
