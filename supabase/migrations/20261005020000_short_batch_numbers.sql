-- Short, readable, backend-generated batch identifiers: `B-000123`.
--
-- ── what this replaces ────────────────────────────────────────────────────────
-- Two generators existed for one identifier, and neither was short:
--
--   * `create_product` (20260926180000) derived the default from the product uuid:
--         'BATCH-' || upper(left(v_id::text, 8)) || '-001'   ->  BATCH-82BC67FA-001
--   * `updateProduct` repeated the same expression *in TypeScript*, for a product that
--     reached editing with no batch rows at all — a second, independent copy of the
--     format that could drift from the first the moment either one changed.
--
-- Eighteen characters of uuid for a number the owner reads off a shelf label, and a
-- client-side format string for something the database should be naming.
--
-- ── uniqueness ────────────────────────────────────────────────────────────────
-- The scope that matters is the existing constraint:
--
--     constraint unique_product_batch unique (product_id, batch_number)
--
-- so batch numbers are unique *per product*, not globally. A sequence is stronger than
-- that requires — globally unique, therefore certainly unique within one product — and,
-- unlike `count(*) + 1` or a slice of a uuid, `nextval` is atomic. Two admins creating
-- products at the same instant cannot be handed the same number, which is the race the
-- order-number generator had to take an advisory lock for.
--
-- ── what is deliberately untouched ────────────────────────────────────────────
-- No existing row is updated, renamed or migrated. `BATCH-82BC67FA-001` stays exactly
-- what it is: it still satisfies the same per-product constraint, nothing parses it (no
-- query in the schema or the test suites splits, matches or orders on the format), and it
-- cannot collide with a new value because the prefixes differ. Editing a product never
-- rewrites a batch number — `updateProduct` only ever reads existing batches or adds a
-- new one, so an identifier is assigned once, when its row is created, and then stays.

create sequence if not exists public.inventory_batch_seq;

-- Deliberately NOT `security definer`. It is called from a column default, which Postgres
-- evaluates as the role doing the insert, so it has to work for `authenticated` — and a
-- definer function in the public schema is exactly what the lockdown migration
-- (20260928010000) spent its revokes on. This one reads a counter and nothing else: it
-- touches no table, bypasses no policy, and the row the caller is trying to write is
-- still gated by `inventory_items`' own RLS.
create or replace function public.generate_batch_number()
returns text
language sql
volatile
as $$
  select 'B-' || lpad(nextval('public.inventory_batch_seq')::text, 6, '0')
$$;

-- `nextval` needs USAGE on the sequence, and the default runs as the inserting role —
-- `anon`, `authenticated` and `service_role` all hold INSERT on `inventory_items` (RLS is
-- what actually refuses anon), so each needs it or an anonymous insert would fail on the
-- sequence before the policy ever got a say. A sequence value exposes a counter.
grant usage on sequence public.inventory_batch_seq to anon, authenticated, service_role;

-- The single generation point. `create_product` calls the same function; the client no
-- longer formats a batch number anywhere, so there is no second copy left to drift.
alter table public.inventory_items
  alter column batch_number set default public.generate_batch_number();


-- ── create_product, redeclared to use it ──────────────────────────────────────
-- Only the default in the `coalesce` changes. Signature and everything else are byte for
-- byte the definition from 20260926180000, because PostgREST resolves an RPC by argument
-- names and types and a rename would turn every deployed client into a 400.
create or replace function public.create_product(
  p_id uuid,
  p_name text,
  p_brand text,
  p_generic_name text,
  p_manufacturer_id uuid,
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
  v_discount integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Backstop for the strict check_discount trigger: without an original price
  -- any discount is meaningless, so drop it instead of failing the upload.
  v_discount := case
    when p_original_price is null then 0
    else coalesce(p_discount_percent, 0)
  end;

  insert into public.products (
    id,
    name,
    brand,
    generic_name,
    description,
    manufacturer_id,
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
    p_brand,
    p_generic_name,
    coalesce(p_description, ''),
    p_manufacturer_id,
    p_category_id,
    p_price,
    p_original_price,
    v_discount,
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
    -- inventory_items.batch_number is NOT NULL and unique per product. An admin-supplied
    -- number wins; otherwise the short sequence value is generated here, in the database,
    -- next to the row it names.
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
