-- search_products: match the medicine name, the brand, the generic, and the company.
--
-- WHY THIS REWRITE
-- The function *returned* `manufacturer_name` and never matched it. A customer typing a
-- company name got nothing:
--
--     search_products('square')  ->  0 rows     (Square Pharmaceuticals PLC is the
--                                                  company behind the "Penvik" range)
--     search_products('napa')    ->  1 row
--
-- So of the three things a pharmacy customer actually types — the medicine, the brand, and
-- the company — two had a direct path to the answer and one had none. The company name is
-- the most natural way to ask for a brand in this market: in Bangladeshi retail, "Square"
-- *is* the brand, and it lives in `manufacturers.name`, not in `products.brand`.
--
-- The second gap is smaller and easier to miss. A brand was only reachable by *prefix*
-- (`lower(brand) like 'x%'`) or by trigram similarity. Trigram is a threshold, not a match,
-- so whether a brand was findable depended on how its length compared to the length of the
-- term — "Napa" inside a long product name is fine, but the moment the product name led with
-- the strength ("500 mg Napacin"), the brand stopped being a reliable query. A real
-- substring test is deterministic, and it is also the shape the existing trigram GIN indexes
-- can serve, so adding it costs no more than the scan it was already doing.
--
-- THE FOUR FIELDS
--   medicine / product name  -> products.name           "Napa 500 mg Tablet"
--   brand                    -> products.brand          "Napa"
--   company                  -> manufacturers.name      "Square Pharmaceuticals PLC"
--   generic / salt           -> products.generic_name   "Paracetamol (Acetaminophen)"
--
-- THE LADDER
-- Every rung below is a field someone typed, ordered by how precisely that field answers
-- the term. Exact and prefix beats contains beats fuzzy, always, so a misspelling degrades
-- to "close enough" rather than displacing an exact hit:
--
--     0  exact name              1  name prefix
--     2  brand prefix            3  manufacturer prefix
--     4  generic prefix
--     5  brand contains          6  manufacturer contains
--     7  name contains           8  generic contains
--     9  name trigram   10  generic trigram   11  brand trigram   12  manufacturer trigram
--     13  description only -- the weakest match, and the only one that is not a name
--
-- Rung 13 is deliberately last and is not "everything else": it is reachable only when the
-- term appears in the description and in no name at all, so a word in a paragraph can never
-- outrank a product whose brand the customer actually typed.
--
-- The company sits at 3, above generic, because a company name is a deliberate query and a
-- generic is a description. "Square" should reach a Square-branded product before it reaches
-- a product that merely mentions squares somewhere in its generic name.
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

-- The two prefix rungs this function gained a use for: `lower(brand) like 'x%'` and
-- `lower(generic_name) like 'x%'` have no index behind them. `20260926120000` built one for
-- the name column only, and the categories/manufacturers lookups, so brand and generic
-- prefix search was a sequential scan of the product table on every keystroke.
--
-- `text_pattern_ops` is what makes a `LIKE 'x%'` a btree range scan rather than a full
-- index walk; the column has to be `lower(...)` because that is the shape the query takes.
--
-- The `ilike '%x%'` rungs need no new index: the trigram GIN indexes built in the initial
-- schema (`idx_products_brand`, `idx_products_generic`) already serve a wildcard `ILIKE`,
-- and `idx_manufacturers_name_trgm` serves it on the company name. That is the whole reason
-- contains-matching is cheap here — it is the query the existing indexes were built for,
-- which the function simply was not asking.
create index if not exists idx_products_brand_prefix
  on public.products (lower(brand) text_pattern_ops);

create index if not exists idx_products_generic_prefix
  on public.products (lower(generic_name) text_pattern_ops);
