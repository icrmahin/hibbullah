-- SVC-02: customers N+1 -> server-side aggregation + pagination
-- Replaces client-side select profiles then select * orders per customer
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

grant execute on function public.get_customers_with_stats(text, int, int) to authenticated;

-- Also helper for single customer stats (used by fetchCustomerById fallback remains, but keep RPC consistent)
create or replace function public.get_customer_stats(p_customer_id uuid)
returns table (order_count bigint, total_spent numeric)
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint as order_count, coalesce(sum(total),0)::numeric as total_spent
  from public.orders where customer_id = p_customer_id;
$$;

grant execute on function public.get_customer_stats(uuid) to authenticated;
