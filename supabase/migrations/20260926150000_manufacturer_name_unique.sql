-- Stop near-duplicate manufacturer rows.
--
-- Duplicate/near-duplicate manufacturer names pollute ILIKE search results and
-- bloat the trigram index, and the inline "add manufacturer" path in
-- ProductForm (ProductForm.tsx:177-217) can currently create unlimited of them.
--
-- Guarded rather than plain: if duplicates already exist the index creation is
-- skipped with a notice instead of failing the whole migration. Dedupe first,
-- then re-run. This matches how the app behaves — report and continue.

do $$
declare
  v_dupes bigint;
begin
  select count(*) into v_dupes
  from (
    select lower(btrim(name))
    from public.manufacturers
    group by 1
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise notice 'Skipping idx_manufacturers_name_unique: % duplicate manufacturer name group(s) exist. Dedupe then re-run this migration.', v_dupes;
    return;
  end if;

  execute 'create unique index if not exists idx_manufacturers_name_unique
           on public.manufacturers (lower(btrim(name)))';
end $$;
