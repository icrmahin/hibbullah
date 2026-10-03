-- Device push notifications: a token registry, a reference on the row, and one send
-- trigger. The in-app list already exists (notifications are written by the triggers
-- below, and the app mirrors them in the foreground); what was missing is the part where
-- the phone buzzes when the app is closed.
--
--   1. `notifications.reference_id` — which order a notification is about, so tapping the
--      push can open THAT order instead of a generic list. Nullable with no foreign key
--      on purpose: a stock alert has no order to point at, and a hard reference would
--      make deleting an order a FK negotiation with the notification history. The client
--      treats a reference that no longer resolves as "open the list" rather than as an
--      error.
--   2. `notify_user` gains an optional `p_reference_id`, and the two status triggers
--      pass it: an order notification carries its order id, a return notification carries
--      the order that return belongs to. The old four-parameter overload is dropped —
--      two live signatures would let a caller quietly reach the one that forgets the
--      reference, and a push that cannot open its order is the feature not working.
--   3. `push_tokens` — one row per device per user, written by the device itself under
--      RLS that only lets a user manage their own. Nothing else inserts here: the whole
--      point is that the token is registered by the phone that will receive the push.
--   4. `push_notification_to_devices` fires after insert on `notifications` and forwards
--      the row to the Expo Push API for every device registered to `notifications.user_id`.
--      Routing is therefore exactly the routing of the in-app list: a row addressed to a
--      customer reaches the customer's devices, a row addressed to an admin reaches the
--      admin's — this function never decides who deserves to be told, only which devices
--      belong to the person the row already names.
--
-- Two properties this design leans on and one caveat:
--
--   * It is SECURITY DEFINER because the row that triggers it was written by whatever
--     role made the change (a customer placing an order, an admin moving a status), and
--     that role must not be able to read another user's tokens. The definer reads the
--     registry; nobody else can.
--   * `net.http_post` enqueues inside this transaction, so a write that rolls back takes
--     its push with it — no notification can arrive on a device for a row that never
--     committed.
--   * The call is fire-and-forget (Expo answers with tickets this function never reads).
--     A device token Expo has retired produces a `DeviceNotRegistered` ticket that nobody
--     consumes, which is harmless but does accumulate: pruning dead tokens from those
--     receipts is deliberately out of scope here and is the obvious next step.
--
-- The stock triggers below already insert their alerts directly (no `notify_user` call),
-- so those rows keep a null reference: they open the notification list, which is where a
-- "Low stock: X" alert belongs anyway.

alter table public.notifications add column reference_id uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. notify_user learns where the notification points
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_user(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_type text default 'info',
  p_reference_id uuid default null
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

  insert into public.notifications (user_id, title, body, type, reference_id)
  values (p_user_id, left(coalesce(p_title, 'Notice'), 200), left(coalesce(p_body, ''), 1000), v_type, p_reference_id)
  returning id into v_id;

  return v_id;
end;
$$;

-- The four-parameter definition this replaces must not survive as an overload: a caller
-- omitting p_reference_id would resolve to it and produce a notification the push cannot
-- open, with nothing anywhere reporting the difference.
drop function public.notify_user(uuid, text, text, text);

revoke all on function public.notify_user(uuid, text, text, text, uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The status triggers say which order they are talking about
-- ─────────────────────────────────────────────────────────────────────────────
-- Bodies unchanged from the notifications migration except for the fifth argument:
-- orders notify with their own id, returns with the order they belong to. The triggers
-- themselves are untouched -- `create or replace` keeps trg_orders_notify and
-- trg_return_requests_notify bound to these functions.

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

  perform public.notify_user(NEW.customer_id, v_title, v_body, v_type, NEW.id);
  return null;
end;
$$;

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

  perform public.notify_user(NEW.customer_id, v_title, v_body, v_type, NEW.order_id);
  return null;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The device registry
-- ─────────────────────────────────────────────────────────────────────────────
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'android' check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create index idx_push_tokens_user on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- Read own: the app re-registers on launch and needs to know whether its token is already
-- on file. Manage own: registration and the sign-out cleanup are the device's business
-- and nobody else's. There is deliberately no policy for `anon` — a logged-out client can
-- read nothing here, which is what stops an attacker from harvesting the token registry.
create policy "Users can view own push tokens"
  on public.push_tokens for select
  using (auth.uid() = user_id);

create policy "Users can manage own push tokens"
  on public.push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Forward every new notification to that user's devices
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.push_notification_to_devices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The recipient is whoever the row is for -- a customer's order update, an admin's
  -- stock alert. Nothing here re-decides that; it only asks which devices belong to the
  -- user_id the row already carries.
  if NEW.user_id is null then
    return null;
  end if;

  -- One call per registered device for that user. Security definer because the role that
  -- produced this row (customer, admin, anon through a definer RPC) must not be able to
  -- read the token registry as a side effect of writing a notification.
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := jsonb_build_object(
      'to', t.expo_push_token,
      'title', left(coalesce(NEW.title, 'Notice'), 200),
      'body', left(coalesce(NEW.body, ''), 1024),
      'sound', 'default',
      'priority', 'high',
      'data', jsonb_build_object(
        'notificationId', NEW.id,
        'referenceId', NEW.reference_id,
        'type', NEW.type
      )
    ),
    params := '{}'::jsonb,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  )
  from public.push_tokens t
  where t.user_id = NEW.user_id;
  return null;
end;
$$;

-- Reached only from the trigger above, so the same treatment every other internal
-- function gets: no customer, no anon, no direct call that could be aimed at somebody
-- else's token list.
revoke all on function public.push_notification_to_devices() from public, anon, authenticated;

drop trigger if exists trg_notifications_push on public.notifications;
create trigger trg_notifications_push
  after insert on public.notifications
  for each row execute function public.push_notification_to_devices();
