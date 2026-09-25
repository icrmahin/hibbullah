-- Notifications and the audit log: real wiring, and hard limits.
--
-- Three separate problems, addressed together because they all concern "how much
-- history does this app keep":
--
--   1. Notifications were only ever produced by stock triggers. Order and return
--      status changes -- the events a customer actually waits on -- created nothing,
--      so the notification list was silently empty. Fixed with two new triggers.
--   2. Neither list had a ceiling. `audit_entries` grows with the catalog: every
--      product insert or update writes a row, so 4k products means 4k audit rows,
--      and the screen only ever showed the newest 50 of them. Notifications had no
--      bound at all.
--   3. A limit enforced only in the query would leave the table growing forever, and
--      a limit a client can ask past is not a limit. Both are trimmed in the database
--      by trigger, so the bound holds no matter which client writes.
--
-- What is NOT trimmed: products, orders, order items, inventory, returns, profiles,
-- categories and manufacturers. Those are the records the business runs on and they
-- are left to grow without limit. Only the two transient logs are capped.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. notify_user -- the single way a notification gets created
-- ─────────────────────────────────────────────────────────────────────────────
-- Every producer goes through this rather than inserting directly, so the type
-- validation and the length clamps are applied once instead of at each call site.

create or replace function public.notify_user(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_type text default 'info'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  -- The table constrains `type` to four values. Validating here turns a typo into a
  -- sensible default instead of aborting the caller's transaction -- and the callers
  -- are triggers on orders and returns, so a raised error would roll back the very
  -- status change the notification is describing.
  v_type text := case
    when p_type in ('info', 'success', 'warning', 'alert') then p_type
    else 'info'
  end;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.notifications (user_id, title, body, type)
  values (p_user_id, left(coalesce(p_title, 'Notice'), 200), left(coalesce(p_body, ''), 1000), v_type)
  returning id into v_id;

  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Order updates reach the customer
-- ─────────────────────────────────────────────────────────────────────────────
-- Fires on insert (the order was placed) and on a real status change. A status that
-- has not changed produces nothing: the app also rewrites `timeline` and `updated_at`,
-- and a customer does not need to be told their order was placed every time a status
-- row is appended to.

create or replace function public.notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text := coalesce(NEW.order_number, OLD.order_number);
  v_title text;
  v_body text;
  v_type text;
begin
  if tg_op = 'INSERT' then
    v_title := 'Order placed';
    v_body := 'We have received your order ' || v_number || '. We will confirm it shortly.';
    v_type := 'info';
  elsif NEW.status is distinct from OLD.status then
    case NEW.status
      when 'CONFIRMED' then
        v_title := 'Order confirmed';
        v_body := 'Your order ' || v_number || ' has been confirmed.';
        v_type := 'info';
      when 'PROCESSING' then
        v_title := 'Preparing your order';
        v_body := 'We are packing your order ' || v_number || '.';
        v_type := 'info';
      when 'OUT_FOR_DELIVERY' then
        v_title := 'Out for delivery';
        v_body := 'Your order ' || v_number || ' is on the way.';
        v_type := 'success';
      when 'DELIVERED' then
        v_title := 'Order delivered';
        v_body := 'Your order ' || v_number || ' has been delivered.';
        v_type := 'success';
      when 'CANCELLED' then
        v_title := 'Order cancelled';
        v_body := 'Your order ' || v_number || ' has been cancelled. Contact us if this was not expected.';
        v_type := 'alert';
      when 'RETURNED' then
        v_title := 'Order returned';
        v_body := 'Your order ' || v_number || ' has been returned.';
        v_type := 'alert';
      else
        -- A status this app does not narrate yet (PENDING reached by an update rather
        -- than an insert). Nothing useful to say, so say nothing.
        return null;
    end case;
  else
    return null;
  end if;

  perform public.notify_user(NEW.customer_id, v_title, v_body, v_type);
  return null;
end;
$$;

drop trigger if exists trg_orders_notify on public.orders;
create trigger trg_orders_notify
  after insert or update of status on public.orders
  for each row execute function public.notify_order_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Return requests reach the customer
-- ─────────────────────────────────────────────────────────────────────────────
-- A customer who has asked for money back wants to know the answer, so the decision
-- notifies, not just the request.

create or replace function public.notify_return_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_body text;
  v_type text;
begin
  if tg_op = 'INSERT' then
    v_title := 'Return requested';
    v_body := 'We received your return request for ' || NEW.product_name || '. We will review it shortly.';
    v_type := 'info';
  elsif NEW.status is distinct from OLD.status then
    case NEW.status
      when 'APPROVED' then
        v_title := 'Return approved';
        v_body := 'Your return request for ' || NEW.product_name || ' has been approved.';
        v_type := 'success';
      when 'REJECTED' then
        v_title := 'Return declined';
        v_body := 'Your return request for ' || NEW.product_name || ' was declined. Contact us if you need help.';
        v_type := 'alert';
      when 'PROCESSED' then
        v_title := 'Return completed';
        v_body := 'Your return for ' || NEW.product_name || ' has been processed.';
        v_type := 'success';
      else
        return null;
    end case;
  else
    return null;
  end if;

  perform public.notify_user(NEW.customer_id, v_title, v_body, v_type);
  return null;
end;
$$;

drop trigger if exists trg_return_requests_notify on public.return_requests;
create trigger trg_return_requests_notify
  after insert or update of status on public.return_requests
  for each row execute function public.notify_return_status();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Notifications: keep the newest 50 per user
-- ─────────────────────────────────────────────────────────────────────────────
-- Per user, not global: one noisy account must not empty everyone else's list.
--
-- AFTER INSERT only, and the trim deletes rows rather than inserting, so the trigger
-- cannot re-fire on its own work. The table therefore stays at 50 rows per user no
-- matter how many notifications arrive, which is what makes the client's own query
-- limit safe to rely on rather than merely optimistic.
--
-- What the ordering can and cannot promise. `created_at` defaults to now(), which is
-- the transaction start time, so notifications created in the SAME transaction all share
-- a timestamp and there is no "newest" among them to preserve -- the id tiebreaker then
-- decides, and the surviving 50 are as good as any. That cannot bite in practice: the
-- producers below emit one notification per trigger firing, and the stock triggers send
-- at most one per user per event. Across transactions, which is every real case, a kept
-- row is never older than a dropped one.

create or replace function public.trim_user_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where id in (
    select id
    from public.notifications
    where user_id = NEW.user_id
    order by created_at desc, id desc
    offset 50 -- public.notification_cap()
  );
  return null;
end;
$$;

drop trigger if exists trg_notifications_trim on public.notifications;
create trigger trg_notifications_trim
  after insert on public.notifications
  for each row execute function public.trim_user_notifications();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Audit log: keep the newest 20, drop the rest
-- ─────────────────────────────────────────────────────────────────────────────
-- Deliberately global and deliberately small. The audit log answers "what just
-- happened", and it is triggered by every product, order, inventory and return
-- mutation, so it is by far the fastest-growing table in the database once the
-- catalog is large. Trimming the screen query alone would still leave it growing
-- forever, so the rows are removed at write time.
--
-- FOR EACH STATEMENT, because this examines the whole table and there is no reason to
-- run it once per row of a bulk import.
--
-- Safe to delete from: nothing has a foreign key onto audit_entries, and it is a log
-- rather than a source of truth. Deleting an entry never cascades anywhere.

create or replace function public.trim_audit_entries()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.audit_entries
  where id in (
    select id
    from public.audit_entries
    order by timestamp desc, id desc
    offset 20 -- public.audit_log_cap()
  );
  return null;
end;
$$;

drop trigger if exists trg_audit_entries_trim on public.audit_entries;
create trigger trg_audit_entries_trim
  after insert on public.audit_entries
  for each statement execute function public.trim_audit_entries();

-- Apply the audit cap to what is already there, so the invariant holds immediately
-- rather than only after the next write.
delete from public.audit_entries
where id in (
  select id from public.audit_entries order by timestamp desc, id desc offset 20
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Clients may read, mark read, and clear their own notifications. Nothing else.
-- ─────────────────────────────────────────────────────────────────────────────
-- The old policy was FOR ALL, which reads as "a customer can do anything to their
-- own notifications" and, via its implicit WITH CHECK, would have let one rewrite
-- their own rows arbitrarily. Split into the three commands the app actually uses.
--
-- Notably absent: INSERT. A notification is a statement about something that
-- happened, so it may only come from the triggers above. Leaving INSERT permitted
-- would let any signed-in client invent an "Out of stock" alert for themselves.

drop policy if exists "Customers can manage own notifications" on public.notifications;

create policy "Customers can mark own notifications read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Customers can clear own notifications"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- The triggers above are SECURITY DEFINER, so they write as the table owner and are
-- unaffected by these revokes.
revoke insert, truncate on public.notifications from anon, authenticated;
