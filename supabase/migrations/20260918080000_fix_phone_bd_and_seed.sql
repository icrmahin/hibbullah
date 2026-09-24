-- Fix Bangladeshi phone format: +880 (country code +880, typical 10 digits after: +8801865858544)
-- Previous format was Kenyan +254; now Bangladeshi per request. Example: +8801865858544 -> +8801[0-9]{9}

-- 1. Drop old constraint and create new Bangladeshi format
alter table public.profiles drop constraint if exists profiles_phone_format;
alter table public.profiles add constraint profiles_phone_format
  check (phone is null or phone = '' or phone ~* '^\+?8801[0-9]{9}$');

-- 2. Migrate existing Kenyan seed phones to Bangladeshi equivalents (keep determinism)
-- Map: +254712345678 -> +8801712345678, +254701234567 -> +8801865858544 (user's number), +254722345678 -> +8801923456789
update public.profiles set phone = '+8801712345678', updated_at = now() where phone = '+254712345678';
update public.profiles set phone = '+8801865858544', updated_at = now() where phone = '+254701234567';
update public.profiles set phone = '+8801923456789', updated_at = now() where phone = '+254722345678';

-- Also fix any remaining Kenyan phones that may have been used in tests
update public.profiles set phone = '+8801712345678' where phone ~* '^\+?254';

-- 3. Keep partial unique index (already partial where phone is not null and <>'' and <>'null')
drop index if exists idx_profiles_phone;
create unique index idx_profiles_phone on public.profiles (phone) where phone is not null and phone <> '' and phone <> 'null';
