-- Harden create_product against the two client states that surface as RPC 400s.
--
-- 1. Discount without an original price. The strict check_discount trigger
--    (20260918040000) rejects original_price IS NULL + discount != 0, which
--    PostgREST reports as `POST /rpc/create_product → 400`. The product form
--    lets an admin type a discount while leaving original price empty, so a
--    normal form state failed the whole upload. Coerce here: no original price
--    means no discount. The client also blocks this with a message; this is the
--    backstop for old builds and direct API callers.
--
-- 2. Signature unchanged on purpose: PostgREST resolves the RPC by argument
--    names/types, so any rename would turn every existing client into a 400
--    ("Could not find the function") instead of fixing one.
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
  uuid, text, text, text, uuid, uuid, numeric, text,
  numeric, integer, numeric, text, text, text, boolean, boolean, integer, text, date
) from public;

grant execute on function public.create_product(
  uuid, text, text, text, uuid, uuid, numeric, text,
  numeric, integer, numeric, text, text, text, boolean, boolean, integer, text, date
) to authenticated;
