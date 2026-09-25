-- Indexes for product browsing and search.
--
-- Before this, every list query sorted by products.created_at with no index on
-- it, so each page was a full sort of the filtered set. OFFSET paging over an
-- unindexed sort key also has no stable tiebreaker, which is how rows get
-- skipped or duplicated when two products share a created_at.
--
-- (is_active, created_at desc, id desc) also matches the
-- "Anyone can view active products" RLS predicate, so the visibility filter and
-- the ordering are served by one index.

create index if not exists idx_products_active_created
  on public.products (is_active, created_at desc, id desc);

create index if not exists idx_products_created
  on public.products (created_at desc, id desc);

-- Prefix search support: lower(name) LIKE 'x%' is the query shape the app sends
-- most often, and text_pattern_ops is what makes that an index range scan. The
-- existing trigram GIN indexes (initial_schema.sql:152-155) stay for contains
-- and similarity matching.
create index if not exists idx_products_name_prefix
  on public.products (lower(name) text_pattern_ops);

-- Both are order('name')-sorted by fetchCategories / fetchManufacturers.
create index if not exists idx_categories_name
  on public.categories (lower(name));

create index if not exists idx_manufacturers_name
  on public.manufacturers (lower(name));

-- The two lookups above are searched with ilike '%term%', which cannot use a
-- btree index, so at a few thousand rows each keystroke was a sequential scan.
-- The trigram GIN index turns the substring match into a bitmap scan, and the
-- name column is bounded by 120 characters so the index size stays small.
create extension if not exists pg_trgm;

create index if not exists idx_categories_name_trgm
  on public.categories using gin (name gin_trgm_ops);

create index if not exists idx_manufacturers_name_trgm
  on public.manufacturers using gin (name gin_trgm_ops);
