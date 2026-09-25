-- Expose profiles.avatar_url through the admin customer RPC.
--
-- get_customers_with_stats is SECURITY DEFINER and is the only data path the
-- admin customer list/detail screens use, so without avatar_url here the
-- admin can never see a customer's profile picture.
--
-- The signature and the body are otherwise identical to the 20260922180000
-- definition: same defaults, same p.role = 'customer' filter, same
-- pre-aggregated subquery (which is what keeps this one round trip instead of
-- N+1). Only the return table and select list gain avatar_url.

-- CREATE OR REPLACE cannot change a function's return type, and adding
-- avatar_url to the return table is exactly that. Postgres rejects it with
-- "cannot change return type of existing function", so the old signature is
-- dropped first. Nothing else depends on this function.
drop function if exists public.get_customers_with_stats(text, int, int);

create or replace function public.get_customers_with_stats(
  p_query text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  email text,
  phone text,
  role text,
  avatar_url text,
  created_at timestamptz,
  order_count bigint,
  total_spent numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.email,
    p.phone,
    p.role,
    p.avatar_url,
    p.created_at,
    coalesce(o.order_count, 0) as order_count,
    coalesce(o.total_spent, 0) as total_spent
  from public.profiles p
  left join (
    select customer_id, count(*)::bigint as order_count, sum(total)::numeric as total_spent
    from public.orders
    group by customer_id
  ) o on o.customer_id = p.id
  where p.role = 'customer'
    and (
      p_query is null or p_query = ''
      or p.name ilike '%' || p_query || '%'
      or coalesce(p.email,'') ilike '%' || p_query || '%'
      or coalesce(p.phone,'') ilike '%' || p_query || '%'
    )
  order by p.created_at desc
  limit p_limit offset p_offset;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default. This function
-- is SECURITY DEFINER and reads every customer profile, so close that off.
revoke execute on function public.get_customers_with_stats(text, int, int) from public;
grant execute on function public.get_customers_with_stats(text, int, int) to authenticated;
