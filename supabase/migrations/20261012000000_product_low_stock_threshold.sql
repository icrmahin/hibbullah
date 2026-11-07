-- Per-product low-stock thresholds.
--
-- Before this migration, "low" meant stock < 10, hardcoded in three places:
-- the inventory status trigger, the product list RPCs, and the reports
-- aggregate. The trigger classification of a *batch* and the warning on a
-- *product* both read that same number, and nothing in the catalogue could
-- say "this medicine warns sooner" without changing the whole shop.
--
-- Two different signals now share one number per product, deliberately:
--
-- - Batch `status` (inventory_items): batch-level. The trigger labels the
--   batch 'low' when batch.quantity < its product's threshold. It answers
--   "is this batch thin?" and is rendered per-batch.
-- - Product warning (products.stock vs low_stock_threshold): product-level,
--   measured against products.stock, which the sync trigger keeps equal to
--   SUM(inventory_items.quantity). It answers "does this medicine need a
--   restock soon?" and is rendered per-product.
--
-- Batch status therefore uses the threshold as a per-batch yardstick for the
-- medicine's own warning point; the two are never interchangeable, and no
-- screen adds them together.

-- ── 1. The column: default 50 for new products; existing rows keep 10 ─────
alter table public.products
  add column if not exists low_stock_threshold integer not null default 50
    check (low_stock_threshold >= 0);

-- Existing catalogue keeps the threshold it has actually operated under.
update public.products set low_stock_threshold = 10 where low_stock_threshold is null;

comment on column public.products.low_stock_threshold is
  'Per-product units at which a low-stock warning fires. New products default to 50; existing rows were backfilled to 10, the threshold they already operated under.';

-- Same per-column read grant as every other product column except cost_price
-- (20261011000002_fix_company_name.sql did the same for company_name).

-- ── 2. Batch status reads the product's own threshold ───────────────────
-- The trigger previously hardcoded 10. It now selects the batch's own
-- product's threshold, so a batch labelled 'low' means low *for that
-- medicine*, matching the product-level warning on the same row.
create or replace function public.update_inventory_status()
returns trigger as $$
declare
  v_threshold integer;
begin
  select low_stock_threshold into v_threshold from public.products where id = new.product_id;
  if v_threshold is null then v_threshold := 50; end if;
  if new.quantity <= 0 then
    new.status := 'out_of_stock';
  elsif new.quantity < v_threshold then
    new.status := 'low';
  else
    new.status := 'healthy';
  end if;
  new.last_updated := now();
  return new;
end;
$$ language plpgsql;

-- ── 3. get_reports: product-level low count, per-product threshold ──────
drop function if exists public.get_reports(integer, integer);

create or replace function public.get_reports(
  p_expiry_warning_days  integer default 60
)
returns table (
  revenue         numeric,
  delivered_orders bigint,
  discounts       numeric,
  low_stock       bigint,
  out_of_stock    bigint,
  expiring        bigint,
  inventory_value numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can query reports';
  end if;

  v_days := least(greatest(coalesce(p_expiry_warning_days, 60), 0), 3650);

  return query
  with delivered as (
    select coalesce(sum(total), 0)::numeric   as revenue,
           count(*)::bigint                    as delivered_orders,
           coalesce(sum(discount), 0)::numeric as discounts
      from public.orders
     where status = 'DELIVERED'
  ),
  stock as (
    select count(*) filter (where stock > 0 and stock < low_stock_threshold)::bigint as low_stock,
           count(*) filter (where stock <= 0)::bigint                   as out_of_stock
      from public.products
  ),
  batches as (
    select b.product_id, b.quantity, b.expiry_date
      from public.inventory_items b
     where b.quantity > 0
  ),
  soon as (
    select count(*)::bigint as expiring
      from batches
     where expiry_date is not null
       and expiry_date >= current_date
       and expiry_date <= current_date + v_days
  ),
  value as (
    select coalesce(sum(b.quantity * coalesce(p.price, 0)), 0)::numeric as inventory_value
      from batches b
      left join public.products p on p.id = b.product_id
  )
  select d.revenue, d.delivered_orders, d.discounts,
         s.low_stock, s.out_of_stock, n.expiring, v.inventory_value
    from delivered d
    cross join stock   s
    cross join soon    n
    cross join value   v;
end;
$$;

drop function if exists public.get_admin_low_stock();

-- 4. One RPC for the admin dashboard / reports that answers both questions
-- it asks: which products are low (product-level), and which of their
-- batches are thin (batch-level). A directly-called, admin-guarded definer
-- function, so it pays the same guards as get_reports. A product whose
-- largest batch is small but whose total is healthy is *not* listed; the
-- batch status column still marks that batch 'low' for the inventory lists.
create or replace function public.get_admin_low_stock()
returns table (
  product_id     uuid,
  product_name   text,
  stock          integer,
  low_stock_threshold integer,
  batch_id       uuid,
  batch_number   text,
  batch_quantity integer,
  batch_status   text,
  expiry_date    date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can query low stock';
  end if;

  return query
  select p.id, p.name, p.stock, p.low_stock_threshold,
         i.id, i.batch_number, i.quantity, i.status, i.expiry_date
    from public.products p
    join public.inventory_items i on i.product_id = p.id
   where p.is_active
     and coalesce(p.is_deleted, false) = false
     and p.stock < p.low_stock_threshold
     and i.quantity > 0
   order by p.stock asc, p.name asc, i.last_updated asc;
end;
$$;

revoke all on function public.get_admin_low_stock() from public, anon, authenticated;
grant execute on function public.get_admin_low_stock() to authenticated;
-- ── 5. Product list RPCs: low predicate reads the product's own column ──
-- Signatures drop p_low_stock_threshold; the limit/cursor flow is unchanged.
-- Both keep SECURITY INVOKER so the products RLS stays in force (see the
-- 20261011000002_fix_company_name.sql note on browse_products).
-- ── 3. browse_products: 20261006000005 body, brand/manufacturer -> company_name ──
drop function if exists public.browse_products(uuid, text, text, integer, timestamptz, uuid, int);

create or replace function public.browse_products(
  p_category uuid default null,
  p_status text default null,
  p_stock text default null,
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
        and p.stock < p.low_stock_threshold
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

create or replace function public.search_products(
  p_query text,
  p_category uuid default null,
  p_status text default null,
  p_stock text default null,
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
          and p.stock < p.low_stock_threshold
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

-- Same signature-agnostic drop as 20261011000002_fix_company_name.sql, so
-- the old overload never survives beside the new one. The new parameter is
-- validated in-line; a negative value is a refusal, not a silent zero.
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
  p_expiry_date date default null,
  p_low_stock_threshold integer default 50
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
  if p_low_stock_threshold is null or p_low_stock_threshold < 0 then
    raise exception 'low_stock_threshold must be a whole number of 0 or more';
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
    stock,
    low_stock_threshold
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
    0,
    p_low_stock_threshold
  )
  returning id into v_id;

  if coalesce(p_initial_stock, 0) > 0 then
    -- inventory_items.batch_number is NOT NULL and unique per product. An
    -- admin-supplied number wins; otherwise the short sequence value is
    -- generated in the database (20261005020000), never the legacy uuid form.
    v_batch := coalesce(
      nullif(btrim(coalesce(p_batch_number, '')), ''),
      public.generate_batch_number()
    );

    insert into public.inventory_items (product_id, batch_number, quantity, expiry_date)
    values (v_id, v_batch, p_initial_stock, p_expiry_date);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.create_product(
  uuid, text, text, text, uuid, numeric, text,
  numeric, integer, numeric, text, text, text, boolean, boolean, integer, text, date, integer
) from public;

grant execute on function public.create_product(
  uuid, text, text, text, uuid, numeric, text,
  numeric, integer, numeric, text, text, text, boolean, boolean, integer, text, date, integer
) to authenticated;

-- ── 7. Grants for the re-signed list RPCs ────────────────────────────────
grant execute on function public.browse_products(uuid, text, text, timestamptz, uuid, int)
  to anon, authenticated;
grant execute on function public.search_products(text, uuid, text, text, int, int)
  to anon, authenticated;
