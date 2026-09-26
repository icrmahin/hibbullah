-- Reports that aggregate in the database, and customer spend that stops counting cancelled
-- orders as money taken.
--
-- Two problems, both in the reporting the admin dashboard shows.
--
-- 1. `src/services/reports.ts` fetched every row of `orders`, `products` and
--    `inventory_items` into the phone and added them up in JavaScript. The project is
--    specified for a 4,000-product catalogue, so the inventory report alone was pulling
--    4,000 product rows plus every batch on each visit, and a report that degrades with
--    the size of the shop is not a report. The row cap is also not a defence here: with
--    `db-max-rows` unset, PostgREST returns everything, and if an operator ever does set
--    a cap the totals would silently under-report instead of failing.
--
-- 2. `get_customers_with_stats` and `get_customer_stats` summed `orders.total` across
--    every status, so a cancelled order showed up as money the customer had spent.
--
-- Scope is deliberately different in the two places, because they answer different
-- questions, and the two used to be conflated:
--
--   "Revenue" on the sales report is settled income, so it counts DELIVERED only, and
--     "Discounts given" is now counted over that same DELIVERED set. Before this the two
--     tiles sat side by side on one card while being computed over different populations,
--     so their difference did not mean anything.
--   "Total spent" on a customer is lifetime value, so it counts everything the customer
--     committed to and did not cancel. An order still PENDING is money the customer
--     intends to pay; a CANCELLED one is money nobody is going to see.

-- ==========================================================================
-- get_reports — sales and inventory totals, aggregated in the database
-- ==========================================================================
--
-- The thresholds are parameters rather than constants so that `config.lowStockThreshold`
-- and `config.expiryWarningDays` stay the only place they are defined. Hardcoding 10 and
-- 90 here is what let the reports screen disagree with the rest of the app: the expiry
-- screen counted 90 days while `config.expiryWarningDays` says 60, so an admin was shown
-- two different answers to "what is expiring soon" on two screens in the same app.
create or replace function public.get_reports(
  p_low_stock_threshold integer default 10,
  p_expiry_warning_days  integer default 60
)
returns table (
  revenue         numeric,
  delivered_orders bigint,
  discounts       numeric,
  low_stock       bigint,
  out_of_stock    bigint,
  expiring        bigint,
  inventory_value numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_low  integer;
  v_days integer;
begin
  -- SECURITY DEFINER ignores RLS, so without this the numbers would be the whole shop's
  -- for anyone who reached it. Reports are an admin view by definition.
  if not public.is_admin() then
    raise exception 'Only admins can query reports';
  end if;

  -- A caller passing a negative or absurd window should get a report, not an error and
  -- not a wrong answer, so both inputs are clamped to a sane range here.
  v_low := greatest(coalesce(p_low_stock_threshold, 10), 0);
  v_days := least(greatest(coalesce(p_expiry_warning_days, 60), 0), 3650);

  return query
  with delivered as (
    -- `total` is subtotal - discount + delivery fee, so this revenue figure includes the
    -- delivery charges. That is the money that actually came in and is what an owner
    -- reconciles against, so it is left inclusive rather than quietly redefining
    -- "revenue" to mean product sales only.
    select coalesce(sum(total), 0)::numeric   as revenue,
           count(*)::bigint                    as delivered_orders,
           coalesce(sum(discount), 0)::numeric as discounts
      from public.orders
     where status = 'DELIVERED'
  ),
  stock as (
    -- Counted per product, not per batch: a shop with one product split across four
    -- batches needs one low-stock warning, not four.
    select count(*) filter (where stock > 0 and stock < v_low)::bigint as low_stock,
           count(*) filter (where stock <= 0)::bigint                   as out_of_stock
      from public.products
  ),
  batches as (
    -- Zero-quantity batches are left out. A batch is emptied when it is consumed or
    -- written off but its row is kept, and counting those as "expiring soon" reported
    -- stock that no longer existed. It does not change the inventory value, since those
    -- rows contribute nothing to the sum either way.
    select b.product_id, b.quantity, b.expiry_date
      from public.inventory_items b
     where b.quantity > 0
  ),
  soon as (
    -- Already-expired batches are excluded rather than counted as "expiring": an admin
    -- chasing expiry warnings wants the stock still sellable, and a batch past its date
    -- is a withdrawal problem, not a warning.
    select count(*)::bigint as expiring
      from batches
     where expiry_date is not null
       and expiry_date >= current_date
       and expiry_date <= current_date + v_days
  ),
  value as (
    -- Valued at the current selling price. Left joins so a batch whose product row has
    -- gone is valued at zero rather than dropping the whole batch out of the total.
    select coalesce(sum(b.quantity * coalesce(p.price, 0)), 0)::numeric as inventory_value
      from batches b
      left join public.products p on p.id = b.product_id
  )
  select d.revenue, d.delivered_orders, d.discounts,
         s.low_stock, s.out_of_stock, n.expiring, v.inventory_value
    from delivered d
    cross join stock   s
    cross join soon    n
    cross join value   v;
end;
$$;


-- ==========================================================================
-- Customer spend — a cancelled order is not money spent
-- ==========================================================================
--
-- The order count below deliberately still counts every order, cancelled included: "how
-- many orders has this customer placed" is a question about their history, and the shop
-- owner still placed and cancelled it. Only the money total is filtered, because a
-- cancelled order is one where no payment is ever collected.
create or replace function public.get_customers_with_stats(p_query text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
returns TABLE(id uuid, name text, email text, phone text, role text, avatar_url text, created_at timestamp with time zone, order_count bigint, total_spent numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Anon-callable and unguarded: any logged-out visitor could page the whole customer
  -- list out of this, because SECURITY DEFINER ignores the RLS on profiles and orders.
  if not public.is_admin() then
    raise exception 'Only admins can query customers';
  end if;
  return query

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
    select customer_id,
           count(*)::bigint as order_count,
           sum(total) filter (where status <> 'CANCELLED')::numeric as total_spent
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
end;
$$;

create or replace function public.get_customer_stats(p_customer_id uuid)
returns TABLE(order_count bigint, total_spent numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Anon-callable and unguarded: any logged-out visitor could page the whole customer
  -- list out of this, because SECURITY DEFINER ignores the RLS on profiles and orders.
  if not public.is_admin() then
    raise exception 'Only admins can query customers';
  end if;
  return query

  select count(*)::bigint as order_count,
         coalesce(sum(total) filter (where status <> 'CANCELLED'), 0)::numeric as total_spent
  from public.orders where customer_id = p_customer_id;
end;
$$;
