-- Dashboard 30-day aggregates moved to server-side RPC to avoid client-side full-table fetches
-- Free-tier friendly: single RPC instead of 11 parallel select('*')
create or replace function public.get_admin_dashboard_sales(p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_sales_qty int := 0;
  v_total_revenue numeric := 0;
  v_total_earning numeric := 0;
  v_sales_trend jsonb := '[]'::jsonb;
  v_earning_trend jsonb := '[]'::jsonb;
begin
  -- only admins can call
  if auth.jwt() ->> 'role' <> 'admin' then
    raise exception 'Only admins can query dashboard sales';
  end if;

  select coalesce(sum(total),0)::numeric into v_total_revenue
  from public.orders
  where created_at >= p_since and status <> 'CANCELLED';

  select
    coalesce(sum(oi.quantity),0)::int,
    coalesce(sum((oi.unit_price - coalesce(p.cost_price, oi.unit_price * 0.8)) * oi.quantity),0)::numeric
  into v_total_sales_qty, v_total_earning
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.created_at >= p_since;

  -- 7-day trends
  with days as (
    select generate_series((current_date - interval '6 days')::date, current_date::date, '1 day'::interval)::date as d
  ), qty_by_day as (
    select oi.created_at::date as d, sum(oi.quantity)::int as qty
    from public.order_items oi where oi.created_at >= p_since group by 1
  ), earn_by_day as (
    select oi.created_at::date as d, sum((oi.unit_price - coalesce(p.cost_price, oi.unit_price * 0.8)) * oi.quantity)::numeric as earn
    from public.order_items oi join public.products p on p.id = oi.product_id where oi.created_at >= p_since group by 1
  )
  select
    coalesce(jsonb_agg(coalesce(q.qty,0) order by days.d), '[]'::jsonb),
    coalesce(jsonb_agg(round(coalesce(e.earn,0)) order by days.d), '[]'::jsonb)
  into v_sales_trend, v_earning_trend
  from days
  left join qty_by_day q on q.d = days.d
  left join earn_by_day e on e.d = days.d;

  return jsonb_build_object(
    'totalSalesQty', v_total_sales_qty,
    'totalSalesRevenue', v_total_revenue,
    'totalEarning', round(v_total_earning),
    'salesTrend', v_sales_trend,
    'earningTrend', v_earning_trend
  );
end;
$$;

grant execute on function public.get_admin_dashboard_sales(timestamptz) to authenticated;
