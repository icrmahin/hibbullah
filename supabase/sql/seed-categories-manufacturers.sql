-- Seed reference data: categories and manufacturers.
--
-- NOT a migration. This lives in supabase/sql/ rather than supabase/migrations/ on
-- purpose: the app already creates both inline from the admin product form, so this
-- is only a convenience for loading a catalogue in bulk. Keeping it out of
-- migrations/ means apply-new-migrations.mjs will never try to run it.
--
-- ── HOW TO USE ────────────────────────────────────────────────────────────────────
-- Replace the two lists in the "fill these in" block below with the real names, then
-- run it from the Supabase SQL Editor. Nothing else needs to change: slugs are
-- derived, and the inserts are idempotent, so re-running after editing a name updates
-- it instead of duplicating.
--
-- The guard at the bottom raises an exception if the placeholders are still in place,
-- so this file cannot accidentally seed fake catalogue data into a real database.
-- ──────────────────────────────────────────────────────────────────────────────────

-- ── fill these in ─────────────────────────────────────────────────────────────────
-- Categories: one quoted name per line. `description` and `icon` are optional --
-- leave them out and they stay null.
--
-- insert into public.categories (name, description, icon) values
--   ('Analgesic', 'Pain relief and fever reducers', 'pain'),
--   ('Antibiotic', 'Antibacterial medicines', 'shield');

-- Manufacturers: one quoted name per line. `country` defaults to 'Bangladesh' and
-- `website` to null when the columns are omitted.
--
-- insert into public.manufacturers (name, country) values
--   ('Square Pharmaceuticals', 'Bangladesh'),
--   ('Beximco Pharmaceuticals', 'Bangladesh');
-- ──────────────────────────────────────────────────────────────────────────────────

-- Derive the slug the same way everywhere else in the app expects: lowercase, any run
-- of non-alphanumerics collapsed to a single hyphen, trimmed. Kept as a function so
-- the categories insert below and any future seed agree.
create or replace function public.hibbullah_slugify(p_name text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
$$;

-- ── Categories ────────────────────────────────────────────────────────────────────
-- categories has a unique index on slug (categories_slug_key), which is the natural
-- idempotency key: the slug is derived from the name, so the same name can never
-- produce two rows. do update rather than do nothing so that correcting a typo or a
-- description in a later edit takes effect instead of being silently ignored.
--
-- The row_number() pass is not decoration. Postgres refuses ON CONFLICT DO UPDATE
-- when a single statement proposes the same conflict key twice ("ON CONFLICT DO
-- UPDATE command cannot affect row a second time"), so 'Diabetes & Care' and
-- 'diabetes-care' in the same list -- which slugify to the same slug -- would abort
-- the entire seed rather than quietly merging. Deduplicating on the conflict key
-- first turns that hard failure into a merge, with the last spelling in the list
-- winning, which is what you want when you are editing the list to fix a typo.
-- Names are btrim()'d on the way in, so a stray leading space in one list entry does
-- not survive into the stored value or into search results.
insert into public.categories (name, slug, description, icon)
select
  btrim(d.name),
  d.slug,
  d.description,
  d.icon
from (
  select
    v.name,
    public.hibbullah_slugify(v.name) as slug,
    v.description,
    v.icon,
    row_number() over (
      partition by public.hibbullah_slugify(v.name)
      order by v.ord desc
    ) as rn
  from (
    select t.name, t.description, t.icon, row_number() over () as ord
    from (values
      -- __CATEGORIES__
      ('__PLACEHOLDER_CATEGORY__'::text, null::text, null::text)
    ) as t(name, description, icon)
  ) v
) d
where d.rn = 1
on conflict (slug) do update
  set name = excluded.name,
      description = coalesce(excluded.description, categories.description),
      icon = coalesce(excluded.icon, categories.icon);

-- ── Manufacturers ────────────────────────────────────────────────────────────────
-- manufacturers has a unique index on lower(btrim(name))
-- (idx_manufacturers_name_unique, from 20260926150000). That expression is the
-- conflict target, so 'Square Pharma' and 'square pharma ' collide on purpose and
-- cannot become two rows that would each show up in search. Deduplicated on that
-- same expression for the same reason as above.
insert into public.manufacturers (name, country)
select
  btrim(d.name),
  coalesce(d.country, 'Bangladesh')
from (
  select
    v.name,
    v.country,
    row_number() over (
      partition by lower(btrim(v.name))
      order by v.ord desc
    ) as rn
  from (
    select t.name, t.country, row_number() over () as ord
    from (values
      -- __MANUFACTURERS__
      ('__PLACEHOLDER_MANUFACTURER__'::text, null::text)
    ) as t(name, country)
  ) v
) d
where d.rn = 1
on conflict (lower(btrim(name))) do update
  set country = coalesce(excluded.country, manufacturers.country);

-- ── Guard ─────────────────────────────────────────────────────────────────────────
-- Two distinct placeholder names, so a copy-paste that only fills in one of the two
-- lists is still caught.
do $$
declare
  v_cats bigint;
  v_mans bigint;
begin
  select count(*) into v_cats from public.categories where name like '__PLACEHOLDER%';
  select count(*) into v_mans from public.manufacturers where name like '__PLACEHOLDER%';

  if v_cats > 0 or v_mans > 0 then
    raise exception
      'Refusing to finish: % placeholder categor(y/ies) and % placeholder manufacturer(s) would be seeded. Replace the two lists in this migration with the real names first.',
      v_cats, v_mans;
  end if;
end;
$$;
