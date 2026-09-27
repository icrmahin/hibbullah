-- Real profit, and stock that comes back when an order is cancelled or a return approved.
--
-- Four separate defects are fixed here. Each was found by reading the live database rather
-- than the client, and two of them had been hiding behind each other.
--
--   1. `get_admin_dashboard_sales` guarded itself with `auth.jwt() ->> 'role' <> 'admin'`.
--      The custom access token hook is DISABLED on this project, and the hook function --
--      even if it were enabled -- writes `app_role`, never `role`. So the claim is always
--      the Postgres role, 'authenticated', the comparison is always true, and the function
--      raised on every single call. It could never return a number to anybody.
--
--   2. Because it always failed, `fetchSalesAggregates` in the client caught the error and
--      re-aggregated in JavaScript. That fallback summed `order_items` with no join to
--      `orders` and no status filter, so CANCELLED orders counted as sales, and it
--      substituted `unit_price * 0.8` for a missing cost price -- inventing a 20% margin
--      and reporting the difference as earnings.
--
--   3. `transition_order_status` set the status and wrote a timeline note. Cancelling an
--      order never returned the deducted units to `inventory_items`, so the stock was gone
--      from inventory permanently.
--
--   4. Approving a return did nothing at all -- no restock, no profit reversal -- and
--      `return_requests` had no `product_id`, only a denormalised `product_name`, so the
--      database could not even tell which product to put back.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Remember which batches each order line drew from
-- ─────────────────────────────────────────────────────────────────────────────
--
-- "Undo exactly" needs the allocation to be recorded, and it has to be recorded at
-- deduction time because the FIFO walk is the only moment the mapping is known. One row
-- per (order line, batch) pair; a line that spans three batches has three rows.
create table if not exists public.order_item_allocations (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  -- The idempotency guard. A line can never give back more than it took, and never twice.
  restocked_quantity integer not null default 0
    check (restocked_quantity >= 0 and restocked_quantity <= quantity),
  created_at timestamptz not null default now()
);

create index if not exists idx_allocations_order_item
  on public.order_item_allocations (order_item_id);
create index if not exists idx_allocations_order
  on public.order_item_allocations (order_id);

comment on table public.order_item_allocations is
  'Which inventory batches each order line was deducted from, so a cancelled order or an approved return can be undone exactly. restocked_quantity makes a double restock impossible.';

-- No policies: the table is reachable only from the SECURITY DEFINER functions below.
-- Nothing in the app reads it directly.
alter table public.order_item_allocations enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. deduct_inventory_fifo records the allocation
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The 2-argument form is dropped rather than left as an overload: an old 2-arg version
-- would still deduct stock without recording where it went, which is the exact bug being
-- fixed. `default null` keeps existing 2-argument calls working -- the default applies to
-- the single 3-argument function, not to a second function.
drop function if exists public.deduct_inventory_fifo(uuid, integer);

create or replace function public.deduct_inventory_fifo(
  p_product_id uuid,
  p_quantity integer,
  p_order_item_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_remaining integer := p_quantity;
  v_inv record;
  v_taken integer;
begin
  -- Lock the batch rows so validation + deduction see a consistent snapshot
  for v_inv in
    select id, quantity from public.inventory_items
    where product_id = p_product_id
      and quantity > 0
      and (expiry_date is null or expiry_date >= current_date)
    order by
      case when expiry_date is null then 1 else 0 end,
      expiry_date asc,
      last_updated asc
    for update
  loop
    exit when v_remaining <= 0;
    if v_inv.quantity >= v_remaining then
      v_taken := v_remaining;
      update public.inventory_items set quantity = quantity - v_remaining where id = v_inv.id;
      v_remaining := 0;
    else
      v_taken := v_inv.quantity;
      v_remaining := v_remaining - v_inv.quantity;
      update public.inventory_items set quantity = 0 where id = v_inv.id;
    end if;

    -- Record which batch this line just drew from. `on conflict ... do update` because a
    -- cart holding the same product twice merges into ONE order line and calls this
    -- function twice, so the same (line, batch) pair can legitimately appear twice.
    if p_order_item_id is not null then
      insert into public.order_item_allocations
        (order_item_id, order_id, inventory_item_id, quantity)
      values
        (p_order_item_id,
         (select order_id from public.order_items where id = p_order_item_id),
         v_inv.id, v_taken)
      on conflict (order_item_id, inventory_item_id) do update
        set quantity = public.order_item_allocations.quantity + excluded.quantity;
    end if;
  end loop;

  -- Concurrent safety: if still remaining, stock was consumed between validation and deduction
  if v_remaining > 0 and exists (select 1 from public.inventory_items where product_id = p_product_id) then
    raise exception 'Insufficient stock for product';
  end if;

  -- Legacy fallback if the product has no inventory rows at all. Nothing is recorded,
  -- because there is no batch to record against -- restock_order_lines() handles that
  -- case separately rather than pretending the undo was exact.
  if v_remaining = p_quantity then
    update public.products set stock = stock - p_quantity where id = p_product_id;
  end if;
end;
$$;

create unique index if not exists idx_allocations_line_batch
  on public.order_item_allocations (order_item_id, inventory_item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. restock_order_lines -- the undo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Walks the allocation newest-first, so the units go back to the batches they most
-- recently came out of, and stops at what the line actually took. Two cases it must not
-- silently paper over:
--
--   * An order placed before this migration has no allocation rows. Falling back to the
--     earliest-expiry non-empty batch is near-correct, not exact, and says so.
--   * The original batch may have expired since. The units go back into it and are then
--     correctly excluded from future sales by the same expiry test the deduction used.
create or replace function public.restock_order_lines(
  p_order_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_reason text default 'return'
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_remaining integer := p_quantity;
  v_alloc record;
  v_take integer;
  v_alloc_rows integer;
  v_fallback record;
  v_result text;
begin
  if p_quantity is null or p_quantity <= 0 then
    return 'nothing to restock (' || p_reason || ')';
  end if;

  -- Without a line there is no product, no batch and no allocation, so every statement
  -- below would quietly match zero rows. Said plainly, instead of by omission.
  if p_order_item_id is null then
    return 'NOT restocked: this return is not linked to an order line, so there is no stock to put back (' || p_reason || ')';
  end if;

  for v_alloc in
    select a.id, a.inventory_item_id, a.quantity, a.restocked_quantity
    from public.order_item_allocations a
    where a.order_item_id = p_order_item_id
      and a.restocked_quantity < a.quantity
    order by a.created_at desc, a.id desc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_alloc.quantity - v_alloc.restocked_quantity);
    update public.order_item_allocations
      set restocked_quantity = restocked_quantity + v_take
      where id = v_alloc.id;
    update public.inventory_items
      set quantity = quantity + v_take
      where id = v_alloc.inventory_item_id;
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    -- The remaining units can only be placed if this line has NO allocation record at all.
    --
    -- "Nothing left to draw on" has two quite different meanings, and conflating them
    -- invents stock. Either the order predates the allocation table and there is nothing to
    -- undo against, or the line's allocations exist and have *already* been fully returned
    -- -- a cancelled order being asked for a second time, or a restock for more units than
    -- the line ever took. In the second case topping up an unrelated batch creates units
    -- that were never bought. (This is not hypothetical: the first version of this function
    -- fell through to the batch fallback in both cases, and the suite caught it adding five
    -- tablets to a batch on an order that had already been cancelled.)
    select count(*) into v_alloc_rows
    from public.order_item_allocations
    where order_item_id = p_order_item_id;

    if v_alloc_rows > 0 then
      v_result := format(
        'NOT restocked: %s unit(s) were asked for but this line has only %s left to give back, so none were added',
        p_quantity, p_quantity - v_remaining
      );
    else
      -- No allocation record: an order placed before this table existed. The earliest
      -- expiry batch is the best guess available and the note says it is a guess.
      select i.id into v_fallback
      from public.inventory_items i
      where i.product_id = (select product_id from public.order_items where id = p_order_item_id)
      order by
        case when i.expiry_date is null then 1 else 0 end,
        i.expiry_date asc,
        i.last_updated asc
      limit 1
      for update;

      if v_fallback is not null then
        update public.inventory_items set quantity = quantity + v_remaining where id = v_fallback.id;
        v_result := format('restocked %s into the earliest-expiry batch, not the original (this order has no allocation record)', v_remaining);
      else
        -- Legacy product with no batch rows: mirror the deduction's own fallback.
        update public.products
        set stock = stock + v_remaining
        where id = (select product_id from public.order_items where id = p_order_item_id);
        v_result := format('restocked %s onto products.stock (no batch rows exist)', v_remaining);
      end if;
    end if;
  else
    v_result := format('restocked %s into the original batch(es)', p_quantity);
  end if;

  return coalesce(v_result, '') || ' (' || p_reason || ')';
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. create_order passes the order line through
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_order(p_customer_id uuid, p_address_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$

declare
  v_order_id uuid;
  v_existing_id uuid;
  v_existing_subtotal numeric;
  v_existing_discount numeric;
  v_subtotal numeric := 0;
  v_cart_subtotal numeric := 0;
  v_discount numeric := 0;
  v_delivery_fee numeric;
  v_total numeric := 0;
  v_customer_name text;
  v_address_text text;
  v_address_district text;
  v_cart_item record;
  v_product record;
  v_order_item_id uuid;
  v_total_stock integer;
begin
  -- This took p_customer_id on trust, so a caller could name a different customer and
  -- have the ownership check further down validate that wrong pair. The app only ever
  -- passes the signed-in user's own id, so requiring that costs nothing and closes
  -- the impersonation.
  if auth.uid() is distinct from p_customer_id then
    raise exception 'Customer ID must match authenticated user';
  end if;
  select name into v_customer_name from public.profiles where id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;
  if not exists (select 1 from public.cart_items where user_id = p_customer_id) then
    raise exception 'Cart is empty';
  end if;

  -- Refuse a missing address outright rather than defaulting it to an empty string.
  if p_address_id is null then
    raise exception 'Delivery address is required';
  end if;

  -- Ownership is part of the lookup, not a separate check afterwards. SECURITY DEFINER
  -- bypasses RLS on `addresses`, so the `user_id = p_customer_id` predicate here is the
  -- ONLY thing standing between a caller and another customer's address.
  --
  -- An address that does not exist and one that belongs to somebody else are deliberately
  -- reported the same way, so this cannot be used to confirm whether an id is real.
  select street || ', ' || city || coalesce(', ' || county, '') || coalesce(', ' || postal_code, ''),
         county
    into v_address_text, v_address_district
  from public.addresses
  where id = p_address_id and user_id = p_customer_id;

  if v_address_text is null then
    raise exception 'Delivery address not found';
  end if;

  -- NOT NULL on street/city does not stop an empty string, and the client-side check is
  -- bypassable, so an unusable address is refused here rather than at delivery time.
  if btrim(v_address_text) in ('', ',') then
    raise exception 'Delivery address is incomplete';
  end if;

  -- Priced from the district, not hard-coded. A null or unrecognised district falls to the
  -- standard rate inside delivery_fee_for_district() rather than needing a guard here.
  v_delivery_fee := public.delivery_fee_for_district(v_address_district);

  -- Check for existing PENDING invoice for this customer (row-level lock to prevent race)
  --
  -- `delivery_fee` is deliberately no longer selected out. It used to be read into
  -- `v_existing_delivery_fee` and carried into the recalculated total, which kept the old
  -- charge on an order whose address had changed. The fee is now recomputed from the
  -- address passed to this call, so there is nothing here for the existing row to
  -- contribute.
  select id, subtotal, discount into v_existing_id, v_existing_subtotal, v_existing_discount
  from public.orders
  where customer_id = p_customer_id and status = 'PENDING'
  order by created_at desc
  limit 1
  for update;

  -- Validate cart items and compute cart subtotal (products must exist and be active)
  for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
    select * into v_product from public.products where id = v_cart_item.product_id and is_active = true;
    if not found then
      raise exception 'Product not available';
    end if;
    -- Authoritative available stock = non-expired inventory sum, falling back to
    -- products.stock only for legacy products with no inventory rows at all.
    select coalesce(sum(quantity), 0) into v_total_stock
    from public.inventory_items
    where product_id = v_cart_item.product_id
      and (expiry_date is null or expiry_date >= current_date);
    if v_total_stock = 0 and not exists (select 1 from public.inventory_items where product_id = v_cart_item.product_id) then
      v_total_stock := v_product.stock;
    end if;
    if v_total_stock < v_cart_item.quantity then
      raise exception 'Insufficient stock for product %', v_product.name;
    end if;
    v_cart_subtotal := v_cart_subtotal + (v_product.price * v_cart_item.quantity);
  end loop;

  if v_existing_id is not null then
    -- Append to existing PENDING invoice
    v_order_id := v_existing_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      -- Handle duplicate product in same order: merge quantity if already exists
      if exists (select 1 from public.order_items where order_id = v_order_id and product_id = v_cart_item.product_id) then
        update public.order_items
        set quantity = quantity + v_cart_item.quantity,
            total = (quantity + v_cart_item.quantity) * v_product.price
        where order_id = v_order_id and product_id = v_cart_item.product_id;
        -- The merge means there is no RETURNING clause to read an id from, so it is looked
        -- up. This is the id the allocation is recorded against, which is what makes the
        -- eventual cancel an exact undo rather than a guess.
        select id into v_order_item_id
        from public.order_items
        where order_id = v_order_id and product_id = v_cart_item.product_id;
      else
        insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
        values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity)
        returning id into v_order_item_id;
      end if;
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity, v_order_item_id);
    end loop;
    -- Recalc totals: subtotal + cart, one delivery fee.
    --
    -- The fee is REPRICED from the address passed in here, rather than carried over from
    -- the existing order. This line used to read
    -- `coalesce(v_existing_delivery_fee, v_delivery_fee)`, which was harmless while the fee
    -- was a constant and is wrong now: a customer who first ordered to Chattogram and then
    -- added an item while switching to a Dhaka address would keep paying the 150 they were
    -- quoted, against an 80 rate. `delivery_fee` is written explicitly below too, so the
    -- stored row and the new total cannot disagree with each other either.
    v_subtotal := coalesce(v_existing_subtotal, 0) + v_cart_subtotal;
    v_total := v_subtotal - coalesce(v_existing_discount, 0) + v_delivery_fee;
    update public.orders
    set subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        total = v_total,
        updated_at = now(),
        -- Always the address just validated. This used to be
        -- `case when v_address_text <> '' then v_address_text else address end`, which kept
        -- whatever was there before; with the guard above v_address_text is never empty,
        -- so the fallback is dead code that would only ever preserve a stale address.
        address = v_address_text,
        timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('label', 'ITEMS_ADDED', 'time', now()::text, 'note', v_cart_subtotal::text || ' added'))
    where id = v_order_id;
  else
    -- No pending invoice: create new as before
    v_subtotal := v_cart_subtotal;
    v_total := v_subtotal - v_discount + v_delivery_fee;
    insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, payment_method, address)
    values (null, p_customer_id, v_customer_name, 'PENDING', v_subtotal, v_discount, v_delivery_fee, v_total, 'CASH_ON_DELIVERY', v_address_text)
    returning id into v_order_id;
    for v_cart_item in select * from public.cart_items where user_id = p_customer_id loop
      select * into v_product from public.products where id = v_cart_item.product_id;
      insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, discount_percent, total)
      values (v_order_id, v_cart_item.product_id, v_product.name, v_cart_item.quantity, v_product.price, 0, v_product.price * v_cart_item.quantity)
      returning id into v_order_item_id;
      perform public.deduct_inventory_fifo(v_cart_item.product_id, v_cart_item.quantity, v_order_item_id);
    end loop;
  end if;

  delete from public.cart_items where user_id = p_customer_id;
  return v_order_id;
end;

$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Cancelling an order gives the stock back
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.transition_order_status(
  p_order_id uuid,
  p_new_status text,
  p_admin_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_catalog'
as $$
declare
  v_current_status text;
  v_allowed boolean := false;
  v_line record;
  v_note text := '';
begin
  if not public.is_admin() then
    raise exception 'Only admins can change order status';
  end if;
  if p_admin_id is distinct from auth.uid() then
    raise exception 'Admin ID must match authenticated user';
  end if;
  if not exists (select 1 from auth.users where id = p_admin_id and public.is_admin_email(email)) then
    raise exception 'Only allowlisted admins can change order status';
  end if;

  select status into v_current_status from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;

  v_allowed := (
      (v_current_status = 'PENDING'     and p_new_status in ('CONFIRMED', 'CANCELLED'))
   or (v_current_status = 'CONFIRMED'   and p_new_status in ('PROCESSING', 'CANCELLED'))
   or (v_current_status = 'PROCESSING'  and p_new_status in ('OUT_FOR_DELIVERY', 'CANCELLED'))
   or (v_current_status = 'OUT_FOR_DELIVERY' and p_new_status in ('DELIVERED'))
   or (v_current_status = 'DELIVERED'   and p_new_status in ('RETURNED'))
  );
  if not v_allowed then
    raise exception 'Invalid status transition from % to %', v_current_status, p_new_status;
  end if;

  update public.orders
  set status = p_new_status,
      updated_at = now(),
      timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('label', 'STATUS_CHANGED', 'time', now()::text, 'note', v_current_status || ' → ' || p_new_status)
      )
  where id = p_order_id;

  -- Cancelling used to move the order and nothing else. Every unit the order had drawn
  -- out of `inventory_items` stayed out, permanently, so the stock level silently drifted
  -- below the truth for the rest of time. Each line is put back separately, because
  -- restock_order_lines() stops at what that line actually took.
  if p_new_status = 'CANCELLED' then
    for v_line in
      select id, quantity from public.order_items where order_id = p_order_id
    loop
      v_note := v_note || public.restock_order_lines(p_order_id, v_line.id, v_line.quantity, 'order cancelled') || '; ';
    end loop;

    update public.orders
    set timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('label', 'STOCK_RESTOCKED', 'time', now()::text, 'note', v_note)
    )
    where id = p_order_id;
  end if;

  return true;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. A return can identify its product, and approval restores the stock
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.return_requests add column if not exists product_id uuid references public.products(id) on delete set null;
alter table public.return_requests add column if not exists order_item_id uuid references public.order_items(id) on delete set null;
alter table public.return_requests add column if not exists approved_at timestamptz;
alter table public.return_requests add column if not exists restock_note text;

comment on column public.return_requests.product_id is
  'Denormalised product_name could not identify a row to restock. Backfilled by matching the name against the order''s own lines.';
comment on column public.return_requests.approved_at is
  'When the return was approved. Profit is reversed at this timestamp, not at the order''s date.';
comment on column public.return_requests.restock_note is
  'What happened to the stock when this return was approved, in one line of plain words. Written whether or not it worked, so an approval that could not restore stock is visible on the returns screen instead of being a silent no-op.';

-- Backfill by matching the name against the lines of THAT order. Guessing from the
-- product table alone could pick a different product that happens to share a name.
update public.return_requests r
set order_item_id = oi.id,
    product_id = oi.product_id
from public.order_items oi
where r.order_id = oi.order_id
  and r.order_item_id is null
  and lower(trim(r.product_name)) = lower(trim(oi.product_name));

-- ─────────────────────────────────────────────────────────────────────────────
-- 6b. Approving a return gives the units back
-- ─────────────────────────────────────────────────────────────────────────────
--
-- This deliberately never raises.
--
-- It is tempting to `raise exception` when a return cannot be restocked, and it was the
-- first version. That is the wrong shape: the trigger runs inside the admin's PATCH, so a
-- raise takes down the whole approval and leaves the return stuck in PENDING with no way
-- out. The admin has judged the return legitimate; the fact that this particular row cannot
-- be matched to a batch is a bookkeeping gap, and it should not be able to veto them.
--
-- So the rule is: approve, restock as much as can be justified, and write down exactly
-- what happened in `restock_note`. The returns screen shows that note, so a return whose
-- stock did not come back is visible to the shop instead of quietly eating inventory.
create or replace function public.approve_return_stock(p_return_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ret public.return_requests%rowtype;
  v_line_quantity integer;
  v_already_returned integer;
  v_quantity integer;
  v_requested integer;
begin
  select * into v_ret from public.return_requests where id = p_return_id;
  if not found then
    return 'NOT restocked: the return request no longer exists';
  end if;

  if v_ret.order_item_id is null then
    -- The only case the app can still produce, and only for rows that predate this
    -- migration. `product_name` is text, so there is nothing to restock from.
    return format(
      'NOT restocked: this return names "%s" but is not linked to an order line, so the units could not be identified. Match it to the order''s line by hand, or the stock stays short.',
      coalesce(v_ret.product_name, '(no product recorded)')
    );
  end if;

  select quantity into v_line_quantity from public.order_items where id = v_ret.order_item_id;
  v_requested := coalesce(v_ret.quantity, 0);

  -- Never restock more than the line held, even across several separate returns. Without
  -- this a second return on the same line would put back stock that was never sold. The
  -- shortfall is reported rather than refused, for the reason above.
  select coalesce(sum(quantity), 0) into v_already_returned
  from public.return_requests
  where order_item_id = v_ret.order_item_id
    and id <> v_ret.id
    and status in ('APPROVED', 'PROCESSED');

  v_quantity := least(v_requested, coalesce(v_line_quantity, 0) - v_already_returned);

  if v_quantity <= 0 then
    return format(
      'NOT restocked: %s unit(s) were requested but %s of %s had already been returned on this order line',
      v_requested, v_already_returned, coalesce(v_line_quantity, 0)
    );
  end if;

  if v_quantity < v_requested then
    return format(
      'partly restocked: %s of %s unit(s) — %s had already been returned on this order line. %s',
      v_quantity, v_requested, v_already_returned,
      public.restock_order_lines(v_ret.order_id, v_ret.order_item_id, v_quantity, 'return approved')
    );
  end if;

  return public.restock_order_lines(v_ret.order_id, v_ret.order_item_id, v_quantity, 'return approved');
end;
$$;

-- A trigger rather than a new RPC, because the app approves a return by PATCHing
-- `return_requests` directly. Firing on the status crossing to APPROVED -- and only then
-- -- means a second approval cannot restock twice, with no separate bookkeeping to keep in
-- step with the status. The `old.status is distinct from` half is the idempotency: a
-- re-save that leaves the status at APPROVED does nothing, so approving twice is harmless
-- without the admin having to know that.
create or replace function public.trg_return_restock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'APPROVED' and (old.status is distinct from 'APPROVED') then
    new.approved_at := now();
    new.restock_note := public.approve_return_stock(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_return_restock on public.return_requests;
create trigger trg_return_restock
  before update of status on public.return_requests
  for each row execute function public.trg_return_restock();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Real profit
-- ─────────────────────────────────────────────────────────────────────────────
--
-- One function, used by both the dashboard card and the reports screen, so the two cannot
-- drift apart again.
--
-- The rules, in the order they matter:
--
--   * Only DELIVERED orders count. A PENDING order has not been sold, so it has earned
--     nothing. Cancelling therefore needs no profit reversal at all -- the order was never
--     in the figure to begin with. That is the whole reason the cancel path above only
--     touches stock.
--   * An approved return comes off at its APPROVAL date, not the order's date, so
--     approving a return today reduces this month's number and leaves last month's
--     settled figure alone.
--   * A line with no cost price contributes NOTHING. The old code substituted
--     `unit_price * 0.8` and reported the difference as earnings, which is not a
--     measurement. The count is returned so the card can say how much of the figure it
--     had to leave out -- but it is a count and not a list, so it cannot name them. That
--     was claimed here once and was not true, which is worse than saying nothing: an
--     earlier version of this comment promised the card could "say which products to
--     price" while the function only ever returned a number.
create or replace function public.profit_since(p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_profit numeric := 0;
  v_returned_profit numeric := 0;
  v_unpriced_items integer := 0;
  v_unpriced_qty integer := 0;
  v_unlinked_returns integer := 0;
  v_trend jsonb := '[]'::jsonb;
begin
  -- Gross: delivered lines only, real cost price required. The FULL line quantity counts
  -- here. Returns are subtracted once, separately, dated by approval -- also netting them
  -- into the line would count the same refund twice whenever the sale and the refund fall
  -- inside one window.
  -- `count(distinct p.id)`, not `count(*)`. The card says "N products have no cost price
  -- set", and `count(*)` counted order *lines*: one product sold three times in the window
  -- reported as 3 products, so the number the owner acted on did not match anything they
  -- could see in the catalog they were being sent to. `v_unpriced_qty` stays a line sum,
  -- because there the quantity is the point -- it is how many units of earnings are
  -- missing rather than how many rows were skipped.
  select
    coalesce(sum((oi.unit_price - p.cost_price) * oi.quantity), 0)::numeric,
    count(distinct p.id) filter (where p.cost_price is null),
    coalesce(sum(oi.quantity) filter (where p.cost_price is null), 0)::int
  into v_profit, v_unpriced_items, v_unpriced_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  join public.products p on p.id = oi.product_id
  where o.status = 'DELIVERED'
    and oi.created_at >= p_since;

  -- Reversals, dated by when the return was APPROVED rather than when the order was
  -- placed. A line that was never priced contributes nothing here either: reversing a
  -- guess would still be a guess.
  select coalesce(sum((oi.unit_price - p.cost_price) * r.quantity), 0)::numeric
  into v_returned_profit
  from public.return_requests r
  join public.order_items oi on oi.id = r.order_item_id
  join public.products p on p.id = oi.product_id
  where r.status in ('APPROVED', 'PROCESSED')
    and r.approved_at is not null
    and r.approved_at >= p_since
    and p.cost_price is not null;

  -- An approved return with no order line has no unit price and no cost price, so the join
  -- above skips it and the figure above is not reversed. That is the correct direction to
  -- err in -- guessing a margin is worse than a known gap -- but a gap that cannot be seen
  -- is a gap nobody fixes, so it is counted and reported. The returns screen shows the
  -- same problem on each row, as `restock_note`.
  select count(*)::int
  into v_unlinked_returns
  from public.return_requests
  where status in ('APPROVED', 'PROCESSED')
    and approved_at is not null
    and approved_at >= p_since
    and order_item_id is null;

  -- 7-day net trend, obeying exactly the same two rules as the headline figure, so the
  -- sparkline and the number above can never disagree.
  with days as (
    select generate_series((current_date - interval '6 days')::date, current_date::date, '1 day'::interval)::date as d
  ), gross as (
    select oi.created_at::date as d,
           sum((oi.unit_price - p.cost_price) * oi.quantity)::numeric as earn
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.products p on p.id = oi.product_id
    where o.status = 'DELIVERED'
      and oi.created_at >= p_since
      and p.cost_price is not null
    group by 1
  ), ret as (
    select r.approved_at::date as d,
           sum((oi.unit_price - p.cost_price) * r.quantity)::numeric as earn
    from public.return_requests r
    join public.order_items oi on oi.id = r.order_item_id
    join public.products p on p.id = oi.product_id
    where r.status in ('APPROVED', 'PROCESSED')
      and r.approved_at is not null
      and r.approved_at >= p_since
      and p.cost_price is not null
    group by 1
  )
  select coalesce(
           jsonb_agg(round(coalesce(g.earn, 0) - coalesce(rt.earn, 0)) order by days.d),
           '[]'::jsonb
         )
  into v_trend
  from days
  left join gross g on g.d = days.d
  left join ret rt on rt.d = days.d;

  return jsonb_build_object(
    'profit', round(coalesce(v_profit, 0) - coalesce(v_returned_profit, 0), 2),
    'grossProfit', round(coalesce(v_profit, 0), 2),
    'returnedProfit', round(coalesce(v_returned_profit, 0), 2),
    'unpricedItems', v_unpriced_items,
    'unpricedQty', v_unpriced_qty,
    'unlinkedReturns', v_unlinked_returns,
    'profitTrend', v_trend
  );
end;
$$;



-- ─────────────────────────────────────────────────────────────────────────────
-- 8. The dashboard aggregate, finally able to answer
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_admin_dashboard_sales(p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_total_sales_qty int := 0;
  v_total_revenue numeric := 0;
  v_sales_trend jsonb := '[]'::jsonb;
  v_profit jsonb;
begin
  -- is_admin() reads the email allowlist, which is the one place an administrator is
  -- defined. This used to read `auth.jwt() ->> 'role'`, a claim this project has never
  -- had: the access token hook is disabled, and the hook function writes `app_role`, not
  -- `role`. So it raised for everybody, and the client silently fell back to a
  -- JavaScript re-aggregation that counted cancelled orders and invented a 20% margin.
  if not public.is_admin() then
    raise exception 'Only admins can query dashboard sales';
  end if;

  select coalesce(sum(total), 0)::numeric
  into v_total_revenue
  from public.orders
  where created_at >= p_since
    and status = 'DELIVERED';

  with days as (
    select generate_series((current_date - interval '6 days')::date, current_date::date, '1 day'::interval)::date as d
  ), qty_by_day as (
    select oi.created_at::date as d, sum(oi.quantity)::int as qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.created_at >= p_since and o.status = 'DELIVERED'
    group by 1
  )
  select coalesce(jsonb_agg(coalesce(q.qty, 0) order by days.d), '[]'::jsonb)
  into v_sales_trend
  from days
  left join qty_by_day q on q.d = days.d;

  select count(*)::int into v_total_sales_qty
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.created_at >= p_since and o.status = 'DELIVERED';

  v_profit := public.profit_since(p_since);

  return jsonb_build_object(
    'totalSalesQty', v_total_sales_qty,
    'totalSalesRevenue', v_total_revenue,
    'totalEarning', v_profit->'profit',
    'grossProfit', v_profit->'grossProfit',
    'returnedProfit', v_profit->'returnedProfit',
    'deliveredQty', v_profit->'deliveredQty',
    'unpricedItems', v_profit->'unpricedItems',
    'unpricedQty', v_profit->'unpricedQty',
    'unlinkedReturns', v_profit->'unlinkedReturns',
    'salesTrend', v_sales_trend,
    'earningTrend', v_profit->'profitTrend',
    'returnTrend', v_profit->'returnTrend'
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Grants
-- ─────────────────────────────────────────────────────────────────────────────
-- The lockdown migration revoked these from anon/public. Redone here because
-- `deduct_inventory_fifo` gained an argument, which makes it a DIFFERENT function to
-- PostgreSQL -- the old revoke would not apply to it and it would be wide open again.
--
-- `authenticated` is revoked alongside anon, and that is the part worth writing down.
-- This project's default privileges are
--     {postgres=X, anon=X, authenticated=X, service_role=X} to PUBLIC
-- for every new function, applied at CREATE time. So `revoke ... from public` does NOT
-- close a function: PUBLIC loses the grant, but the explicit `authenticated=X` entry
-- stays, and every signed-in customer inherits it. On the first pass at this migration
-- that left `restock_order_lines` callable by any customer -- which would have let a
-- stranger add stock to any batch just by knowing a product id. Revoking from anon and
-- public is only half the job on a Supabase project; the role has to be named.
revoke all on function public.deduct_inventory_fifo(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.restock_order_lines(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.approve_return_stock(uuid) from public, anon, authenticated;
revoke all on function public.profit_since(timestamptz) from public, anon, authenticated;
revoke all on function public.trg_return_restock() from public, anon, authenticated;

-- Only these three are the app's actual entry points, and each is reachable only from
-- inside a guarded function or from the app as the signed-in user it is meant to be.
--   create_order                    -> the customer, and refuses a p_customer_id that is not auth.uid()
--   transition_order_status         -> is_admin() plus an allowlist check on the email
--   get_admin_dashboard_sales       -> is_admin()
--
-- anon and PUBLIC are revoked from all three as well, which they were not before. Each
-- already refused a logged-out caller through the in-function guard, so this changes no
-- message the app shows -- it just stops an anonymous request from getting far enough to
-- run the guard, and keeps the guard as the second line rather than the only one.
revoke all on function public.get_admin_dashboard_sales(timestamptz) from public, anon;
revoke all on function public.create_order(uuid, uuid) from public, anon;
revoke all on function public.transition_order_status(uuid, text, uuid) from public, anon;

grant execute on function public.get_admin_dashboard_sales(timestamptz) to authenticated;
grant execute on function public.create_order(uuid, uuid) to authenticated;
grant execute on function public.transition_order_status(uuid, text, uuid) to authenticated;
