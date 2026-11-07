-- Restore short batch identifiers for products created through `create_product`.
--
-- 20261005020000 introduced `generate_batch_number()` (`B-000123`) and made
-- `inventory_items.batch_number` default to it. 20261012000000 later redefined
-- `create_product` from an older copy of the body, which explicitly inserted
-- the legacy `BATCH-<uuid8>-001` value whenever the form left the batch number
-- blank. Because the value was supplied, the column default never ran, so every
-- product created from the admin form went back to the legacy identifier.
--
-- The fix is the same one 20261005020000 already applied everywhere else: an
-- admin-supplied number wins, otherwise the short sequence value is generated
-- in the database. Nothing here rewrites existing rows; legacy identifiers that
-- are already stored stay valid and untouched.

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
    -- generated in the database, never the legacy uuid form.
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
