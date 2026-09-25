-- Canonical E.164 phone storage.
--
-- Problem: the previous check allowed the leading '+' to be optional
-- (phone ~* '^\+?8801[0-9]{9}$'), so '8801865858544' and '+8801865858544'
-- were two different values for the same human number and could occupy two
-- different slots in the partial unique index. The client also had no
-- normalizer, so '01865858544' was rejected outright instead of converted.
--
-- This migration collapses existing rows onto one canonical representation and
-- then makes the database enforce it.

alter table public.profiles drop constraint if exists profiles_phone_format;

-- 1) Collapse rows that normalize to the same E.164 number.
--    The earliest-created row wins; later duplicates get phone = null.
--    This must run before normalization, otherwise the unique index is violated.
with normalized as (
  select
    p.id,
    p.created_at,
    case
      when d like '880%' then '+' || d
      when d like '0%'   then '+880' || substr(d, 2)
      else '+880' || d
    end as e164
  from public.profiles p
  cross join lateral (select regexp_replace(p.phone, '\D', '', 'g') as d) s
  where p.phone is not null and btrim(p.phone) <> ''
),
ranked as (
  select
    id,
    e164,
    row_number() over (partition by e164 order by created_at asc, id asc) as rn
  from normalized
)
update public.profiles p
set phone = null, updated_at = now()
from ranked r
where p.id = r.id and r.rn > 1;

-- 2) Normalize the survivors to '+8801XXXXXXXXX'.
update public.profiles p
set phone = n.e164, updated_at = now()
from (
  select
    id,
    case
      when d like '880%' then '+' || d
      when d like '0%'   then '+880' || substr(d, 2)
      else '+880' || d
    end as e164
  from (
    select id, regexp_replace(phone, '\D', '', 'g') as d
    from public.profiles
    where phone is not null and btrim(phone) <> ''
  ) s
) n
where p.id = n.id and p.phone <> n.e164;

-- 3) The leading '+' is now mandatory. The constraint name is reused so future
--    drop/replace cycles stay a one-liner.
alter table public.profiles
  add constraint profiles_phone_format
  check (phone is null or btrim(phone) = '' or phone ~ '^\+8801[0-9]{9}$');
