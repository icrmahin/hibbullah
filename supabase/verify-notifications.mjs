#!/usr/bin/env node
/**
 * Verifies the notification wiring and the two history caps against the live project.
 *
 * The point of this script is that it exercises the *real* paths, not the ones that
 * would be convenient to test:
 *
 *   - Orders are placed through the same `create_order` RPC the checkout screen calls,
 *     and moved through their statuses by a real admin token, so the notification has
 *     to come from the trigger on a genuine status change.
 *   - Notifications are read, marked, and cleared through PostgREST with the customer's
 *     own token, so RLS decides what is visible rather than a service-role bypass.
 *   - The caps are checked by writing past them, not by reading the constant back.
 *
 * It also asserts the negative that matters most: a customer cannot invent a
 * notification, and cannot see or clear anyone else's.
 *
 * Everything created here is deleted again, and the two admin allowlist functions are
 * restored. Usage:
 *
 *   HIBBULLAH_SUPABASE_TOKEN=sbp_... node supabase/verify-notifications.mjs
 */
import { randomUUID } from 'node:crypto'
import { env, argv } from 'node:process'
import { grantTestAdmin, revokeTestAdmin, promoteProfile } from './lib/admin-allowlist.mjs'

const PROJECT_REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`
const PUBLISHABLE = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const MGMT = env.HIBBULLAH_SUPABASE_TOKEN
const KEEP = argv.includes('--keep')

// Must match the caps in src/constants/limits.ts and in
// supabase/migrations/20260926170000_notifications_and_audit_limits.sql. Asserted
// against the running database below rather than trusted, because a drift between the
// three is exactly the bug this script exists to catch.
const EXPECTED_AUDIT_CAP = 20
const EXPECTED_NOTIFICATION_CAP = 50

if (!MGMT) {
  console.error('Set HIBBULLAH_SUPABASE_TOKEN first.')
  process.exit(1)
}

const stamp = Date.now()
const EMAIL = `notif-${stamp}@hibbullah.test`
const OUTSIDER_EMAIL = `notif-out-${stamp}@hibbullah.test`
const PASSWORD = `Notif-${stamp}-Aa1!`

/**
 * Read a uuid out of a response, saying which call it came from when there isn't one.
 * A bare JSON.parse of an empty body throws "Unexpected end of JSON input", which names
 * neither the endpoint nor the cause.
 */
function parseUuid(text, what) {
  const trimmed = (text ?? '').trim()
  if (!trimmed) throw new Error(`${what} returned an empty body (nothing was created, or the call failed)`)
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error(`${what} returned a non-JSON body: ${trimmed.slice(0, 200)}`)
  }
  return typeof parsed === 'string' ? parsed : null
}
let step = 0
let section = ''
const head = (title) => {
  section = title
  console.log(`\n--- ${title} ---`)
}
const ok = (m) => console.log(`  ${String(++step).padStart(2)}. PASS  ${m}`)
const fail = (m) => {
  console.log(`  ${String(++step).padStart(2)}. FAIL  ${m}`)
  process.exitCode = 1
}
const check = (cond, m) => (cond ? ok(m) : fail(m))

async function admin(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`admin SQL failed: HTTP ${res.status} ${body.slice(0, 500)}`)
  return body
}

/** Management API query, parsed. Returns [] for an empty result set. */
async function rows(sql) {
  const body = await admin(sql)
  if (!body.trim()) return []
  return JSON.parse(body)
}

async function api(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${token ?? PUBLISHABLE}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, text: await res.text() }
}

/** Parse a response body, naming the call when it is empty or not JSON. */
function parseBody(text, what) {
  const trimmed = (text ?? '').trim()
  if (!trimmed) throw new Error(`${what} returned an empty body`)
  try {
    return JSON.parse(trimmed)
  } catch {
    throw new Error(`${what} returned a non-JSON body: ${trimmed.slice(0, 200)}`)
  }
}

const created = { userId: null, outsiderId: null, categoryId: null, manufacturerId: null, productId: null, orderId: null, returnId: null }
async function cleanup() {
  // First and unconditionally: the role trigger is production code, and leaving a test
  // address in it is worse than any leftover row below.
  try {
    const removed = await revokeTestAdmin()
    for (const r of removed) console.log(`  removed stray allowlist entry: ${r}`)
    console.log('  admin allowlist back to the two real admins.')
  } catch (error) {
    console.error(`  !! FAILED TO RESTORE THE ADMIN ALLOWLIST: ${error.message}`)
    process.exitCode = 1
  }
  if (KEEP) {
    console.log('\n--keep: leaving test data in place.')
    return
  }
  console.log('\nCleaning up...')
  // Child rows first: orders and returns reference the product, and audit_entries
  // references actors on delete restrict.
  //
  // Each step is guarded and non-fatal. Teardown that throws aborts before the admin
  // allowlist is put back and hides the real results behind a stack trace, so a cleanup
  // problem must be reported, never allowed to mask the checks.
  const step = async (label, sql) => {
    try {
      await admin(sql)
    } catch (error) {
      console.log(`  ! ${label}: ${error.message.slice(0, 160)}`)
      process.exitCode = 1
    }
  }
  const uuid = (v) =>
    typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null

  const orderId = uuid(created.orderId)
  const productId = uuid(created.productId)
  if (orderId) {
    await step('return_requests', `delete from public.return_requests where order_id = '${orderId}'`)
    await step('order_items', `delete from public.order_items where order_id = '${orderId}'`)
    await step('orders', `delete from public.orders where id = '${orderId}'`)
  }
  if (productId) {
    await step('inventory_items', `delete from public.inventory_items where product_id = '${productId}'`)
    await step('cart_items', `delete from public.cart_items where product_id = '${productId}'`)
    await step('products', `delete from public.products where id = '${productId}'`)
  }
  if (uuid(created.categoryId)) {
    await step('categories', `delete from public.categories where id = '${created.categoryId}'`)
  }
  if (uuid(created.manufacturerId)) {
    await step('manufacturers', `delete from public.manufacturers where id = '${created.manufacturerId}'`)
  }
  for (const id of [uuid(created.userId), uuid(created.outsiderId)].filter(Boolean)) {
    await step(`notifications ${id.slice(0, 8)}`, `delete from public.notifications where user_id = '${id}'`)
    await step(`audit_entries ${id.slice(0, 8)}`, `delete from public.audit_entries where actor_id = '${id}'`)
    await step(`auth.users ${id.slice(0, 8)}`, `delete from auth.users where id = '${id}'`)
  }
  // The audit cap is global, so this run displaced the real project's history. Say so
  // rather than letting it look like nothing happened.
  const left = await rows(`select count(*)::int n from public.audit_entries`)
  console.log(`  audit_entries remaining: ${left[0]?.n} (this test shares a global 20-entry window)`)
  console.log('  done.')
}

/** Notifications as the customer's own token sees them -- RLS decides. */
async function myNotifications(token, userId) {
  const res = await api(
    `/rest/v1/notifications?select=id,title,body,type,read&user_id=eq.${userId}&order=created_at.desc`,
    { token },
  )
  if (res.status !== 200) throw new Error(`fetch notifications: HTTP ${res.status} ${res.text.slice(0, 200)}`)
  return JSON.parse(res.text)
}

async function signUp(email) {
  await api('/auth/v1/signup', { method: 'POST', body: { email, password: PASSWORD } })
  const res = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password: PASSWORD },
  })
  if (res.status !== 200) throw new Error(`signin ${email}: HTTP ${res.status} ${res.text.slice(0, 200)}`)
  return JSON.parse(res.text)
}

let token
let outsiderToken

/**
 * PostgREST answers 204 No Content for an UPDATE or DELETE that matched rows but
 * returned none, which is the normal case here since the app never asks for the rows
 * back. Treating that as a failure would mean every write in the app "failed" while
 * actually working, so success is 2xx rather than exactly 200.
 */
const succeeded = (res) => res.status >= 200 && res.status < 300

console.log('=== Notifications & history limits ===')

try {
  // ─────────────────────────────────────────────────────────────────────────────
  head('Setup')
  // ─────────────────────────────────────────────────────────────────────────────
  const session = await signUp(EMAIL)
  created.userId = session.user?.id
  token = session.access_token
  check(Boolean(token && created.userId), `customer signed up (${created.userId})`)

  const outsider = await signUp(OUTSIDER_EMAIL)
  created.outsiderId = outsider.user?.id
  outsiderToken = outsider.access_token
  check(Boolean(outsiderToken && created.outsiderId), `second customer signed up (${created.outsiderId})`)

  await grantTestAdmin(EMAIL)
  await promoteProfile(created.userId)
  const role = JSON.parse((await api(`/rest/v1/profiles?select=role&id=eq.${created.userId}`, { token })).text)[0]
  check(role?.role === 'admin', `customer promoted to admin for this test (role=${role?.role})`)

  // A real catalog item, created the way the admin screen creates one. The reference
  // rows go in via SQL because PostgREST returns no body for an insert without
  // `Prefer: return=representation`, and their ids are needed before the RPC call.
  created.categoryId = randomUUID()
  created.manufacturerId = randomUUID()
  await admin(
    `insert into public.categories (id, name, slug) values ('${created.categoryId}', 'Notif Cat ${stamp}', 'notif-cat-${stamp}')`,
  )
  await admin(
    `insert into public.manufacturers (id, name) values ('${created.manufacturerId}', 'Notif Maker ${stamp}')`,
  )
  check(true, 'category and manufacturer created')

  const made = await api('/rest/v1/rpc/create_product', {
    method: 'POST',
    token,
    body: {
      p_id: randomUUID(),
      p_name: `Notif Paracetamol ${stamp}`,
      p_brand: 'NotifBrand',
      p_generic_name: 'Paracetamol',
      p_manufacturer_id: created.manufacturerId,
      p_category_id: created.categoryId,
      p_price: 25,
      p_description: 'Verification product',
      p_original_price: null,
      p_discount_percent: 0,
      p_cost_price: null,
      p_unit: 'strip',
      p_image_url: null,
      p_secondary_image_url: null,
      p_is_active: true,
      p_is_featured: false,
      p_initial_stock: 50,
      p_batch_number: null,
      p_expiry_date: null,
    },
  })
  check(made.status === 200, `create_product succeeded (HTTP ${made.status} ${made.text.slice(0, 150)})`)
  created.productId = parseUuid(made.text, 'create_product')
  check(Boolean(created.productId), `product created through create_product (${created.productId})`)

  // ─────────────────────────────────────────────────────────────────────────────
  head('Placing an order produces a notification')
  // ─────────────────────────────────────────────────────────────────────────────
  // `user_id` is not null with no default, and the addresses policy's WITH CHECK
  // compares it to auth.uid(), so omitting it fails as an RLS violation rather than as
  // a missing column. The app sends it (see toDbAddress in services/addresses.ts);
  // this mirrors that.
  const address = await api('/rest/v1/addresses', {
    method: 'POST',
    token,
    headers: { Prefer: 'return=representation' },
    body: {
      user_id: created.userId,
      label: 'Home',
      street: '12 Test Road',
      city: 'Dhaka',
      is_default: true,
    },
  })
  check(
    address.status === 200 || address.status === 201,
    `address insert accepted (HTTP ${address.status} ${address.text.slice(0, 200)})`,
  )
  const addressId = address.status >= 400 ? null : parseBody(address.text, 'addresses insert')[0]?.id
  check(Boolean(addressId), `delivery address saved (${addressId})`)
  if (!addressId) throw new Error('cannot place an order without an address; stopping here rather than testing less')

  const cart = await api('/rest/v1/cart_items', {
    method: 'POST',
    token,
    body: { user_id: created.userId, product_id: created.productId, quantity: 2 },
  })
  check(cart.status === 200 || cart.status === 201, `cart item added (HTTP ${cart.status} ${cart.text.slice(0, 150)})`)

  // The same RPC the checkout screen calls.
  const orderRes = await api('/rest/v1/rpc/create_order', {
    method: 'POST',
    token,
    body: { p_customer_id: created.userId, p_address_id: addressId },
  })
  check(orderRes.status === 200, `create_order succeeded (HTTP ${orderRes.status} ${orderRes.text.slice(0, 200)})`)
  created.orderId = parseUuid(orderRes.text, 'create_order')
  check(Boolean(created.orderId), `order id returned (${created.orderId})`)
  if (!created.orderId) throw new Error('no order was created, so the status-change notifications cannot be tested')

  let notifications = await myNotifications(token, created.userId)
  const placed = notifications.find((n) => n.title === 'Order placed')
  check(Boolean(placed), `placing an order created a notification ("${placed?.title}")`)
  check(
    Boolean(placed) && placed.body.includes('received your order'),
    `  ...with a real body, not a placeholder ("${placed?.body}")`,
  )
  check(
    Boolean(placed) && placed.read === false,
    '  ...and it starts unread, so it counts towards the badge',
  )

  // ─────────────────────────────────────────────────────────────────────────────
  head('Every status change reaches the customer')
  // ─────────────────────────────────────────────────────────────────────────────
  const STAGES = [
    ['CONFIRMED', 'Order confirmed'],
    ['PROCESSING', 'Preparing your order'],
    ['OUT_FOR_DELIVERY', 'Out for delivery'],
    ['DELIVERED', 'Order delivered'],
  ]
  for (const [status, expectedTitle] of STAGES) {
    const before = (await myNotifications(token, created.userId)).length
    const res = await api(`/rest/v1/orders?id=eq.${created.orderId}`, {
      method: 'PATCH',
      token,
      body: { status },
    })
    check(succeeded(res), `admin moved the order to ${status} (HTTP ${res.status})`)
    const after = await myNotifications(token, created.userId)
    const found = after.find((n) => n.title === expectedTitle)
    check(Boolean(found), `${status} produced "${expectedTitle}"`)
    check(after.length === before + 1, `  ...exactly one new notification (${before} -> ${after.length})`)
  }

  // A change that is not a status change must stay quiet. The app also rewrites
  // `timeline` and `updated_at`, and notifying the customer every time would train
  // them to ignore the list.
  const quietBefore = (await myNotifications(token, created.userId)).length
  const noop = await api(`/rest/v1/orders?id=eq.${created.orderId}`, {
    method: 'PATCH',
    token,
    body: { address: '99 Quiet Lane, Dhaka' },
  })
  check(succeeded(noop), 'a non-status edit to the order succeeded')
  const quietAfter = await myNotifications(token, created.userId)
  check(
    quietAfter.length === quietBefore,
    `editing the address notified nobody (${quietBefore} -> ${quietAfter.length})`,
  )

  // ─────────────────────────────────────────────────────────────────────────────
  head('Return requests reach the customer')
  // ─────────────────────────────────────────────────────────────────────────────
  const ret = await api('/rest/v1/return_requests', {
    method: 'POST',
    token,
    headers: { Prefer: 'return=representation' },
    body: {
      order_id: created.orderId,
      customer_id: created.userId,
      customer_name: 'Verification User',
      product_name: `Notif Paracetamol ${stamp}`,
      quantity: 1,
      reason: 'Damaged pack',
    },
  })
  check(ret.status === 200 || ret.status === 201, `return requested (HTTP ${ret.status} ${ret.text.slice(0, 120)})`)
  created.returnId = parseBody(ret.text, 'return_requests insert')[0]?.id ?? null
  check(Boolean(created.returnId), `return id returned (${created.returnId})`)

  notifications = await myNotifications(token, created.userId)
  check(
    notifications.some((n) => n.title === 'Return requested'),
    'requesting a return created a notification',
  )

  const approved = await api(`/rest/v1/return_requests?id=eq.${created.returnId}`, {
    method: 'PATCH',
    token,
    body: { status: 'APPROVED' },
  })
  check(succeeded(approved), `admin approved the return (HTTP ${approved.status})`)
  notifications = await myNotifications(token, created.userId)
  const approval = notifications.find((n) => n.title === 'Return approved')
  check(Boolean(approval), 'the approval was notified')
  check(Boolean(approval) && approval.type === 'success', '  ...typed as a success, not a generic info')

  // ─────────────────────────────────────────────────────────────────────────────
  head('The caps hold')
  // ─────────────────────────────────────────────────────────────────────────────
  // Written past the cap, not read back from a constant: the trim is a trigger, so the
  // only way to know it works is to overrun it.
  //
  // Spread over three separate transactions on purpose. `created_at` defaults to now(),
  // which is the *transaction* start time, so 65 inserts in one statement all share a
  // timestamp and the trim has no way to tell which is newest -- it would fall back to
  // the id tiebreaker and keep an arbitrary 50. Real notifications arrive one per
  // trigger firing, so testing across transactions is both the realistic case and the
  // one where "newest" is actually defined.
  const BATCHES = 3
  const PER_BATCH = 20
  for (let batch = 0; batch < BATCHES; batch += 1) {
    await admin(
      `select public.notify_user('${created.userId}', 'Batch ${batch} item ' || n, 'body', 'info')
       from generate_series(1, ${PER_BATCH}) n`,
    )
  }
  const flooded = BATCHES * PER_BATCH

  const capped = await rows(
    `select count(*)::int n from public.notifications where user_id = '${created.userId}'`,
  )
  check(
    capped[0].n === EXPECTED_NOTIFICATION_CAP,
    `notifications capped at ${EXPECTED_NOTIFICATION_CAP} per user after ${flooded} (${capped[0].n})`,
  )

  // The last batch is unambiguously the newest, so every one of its rows must have
  // survived. Checking only the count would pass even if the trim kept the oldest.
  const survivors = await rows(
    `select title from public.notifications
     where user_id = '${created.userId}' and title like 'Batch %'
     order by created_at desc`,
  )
  const keptBatches = survivors.map((r) => Number(r.title.split(' ')[1]))
  const newestBatchKept = keptBatches.filter((b) => b === BATCHES - 1).length
  const oldestBatchKept = keptBatches.filter((b) => b === 0).length
  check(
    newestBatchKept === PER_BATCH,
    `every one of the newest batch survived (${newestBatchKept}/${PER_BATCH})`,
  )
  check(
    oldestBatchKept < PER_BATCH,
    `the oldest batch was trimmed back (${oldestBatchKept}/${PER_BATCH} kept)`,
  )

  // Per user, not global: the second account must be untouched by the first's flood.
  const outsiderCount = await rows(
    `select count(*)::int n from public.notifications where user_id = '${created.outsiderId}'`,
  )
  check(outsiderCount[0].n === 0, "the other customer's list was not affected by the flood")

  // Audit is triggered by every product mutation, which is what makes it the fastest
  // growing table once the catalog is large. Overrun it and check it settles at the cap.
  await admin(
    `update public.products set description = 'audit bump ' || n
     from generate_series(1, ${EXPECTED_AUDIT_CAP + 12}) n
     where id = '${created.productId}'`,
  )
  const auditRows = await rows(`select count(*)::int n from public.audit_entries`)
  check(
    auditRows[0].n === EXPECTED_AUDIT_CAP,
    `audit log capped at ${EXPECTED_AUDIT_CAP} after ${EXPECTED_AUDIT_CAP + 12} new entries (${auditRows[0].n})`,
  )

  // The caps apply to the logs only. The records the business runs on must survive an
  // audit flood untouched -- that is the whole distinction being asked for.
  const productStill = await rows(`select name from public.products where id = '${created.productId}'`)
  check(productStill.length === 1, 'the product survived the audit flood (business data is not trimmed)')
  const orderStill = await rows(`select order_number from public.orders where id = '${created.orderId}'`)
  check(orderStill.length === 1, 'the order survived the audit flood')

  // ─────────────────────────────────────────────────────────────────────────────
  head('Marking read')
  // ─────────────────────────────────────────────────────────────────────────────
  const unreadBefore = await rows(
    `select count(*)::int n from public.notifications where user_id = '${created.userId}' and read = false`,
  )
  check(unreadBefore[0].n > 0, `${unreadBefore[0].n} notifications start unread`)

  const markAll = await api(
    `/rest/v1/notifications?user_id=eq.${created.userId}&read=eq.false`,
    { method: 'PATCH', token, body: { read: true } },
  )
  check(succeeded(markAll), `mark all read succeeded (HTTP ${markAll.status})`)
  const unreadAfter = await rows(
    `select count(*)::int n from public.notifications where user_id = '${created.userId}' and read = false`,
  )
  check(unreadAfter[0].n === 0, 'the unread badge is now empty')

  // ─────────────────────────────────────────────────────────────────────────────
  head('Clearing')
  // ─────────────────────────────────────────────────────────────────────────────
  // Put one unread notification back among the read ones, so "clear read" has
  // something it must keep.
  await admin(`select public.notify_user('${created.userId}', 'Keep me', 'unread', 'alert')`)
  const split = await rows(
    `select count(*) filter (where read) read, count(*) filter (where not read) unread
     from public.notifications where user_id = '${created.userId}'`,
  )
  check(
    split[0].read > 0 && split[0].unread === 1,
    `test set up: ${split[0].read} read, ${split[0].unread} unread`,
  )

  const clearRead = await api(`/rest/v1/notifications?user_id=eq.${created.userId}&read=eq.true`, {
    method: 'DELETE',
    token,
  })
  check(succeeded(clearRead), `"clear read" succeeded (HTTP ${clearRead.status} ${clearRead.text.slice(0, 120)})`)
  const afterClearRead = await rows(
    `select title, read from public.notifications where user_id = '${created.userId}'`,
  )
  check(afterClearRead.length === 1, `"clear read" removed exactly the read ones (${afterClearRead.length} left)`)
  check(
    afterClearRead[0]?.title === 'Keep me' && afterClearRead[0]?.read === false,
    '  ...and kept the unread one, which is the point of that option',
  )

  const clearAll = await api(`/rest/v1/notifications?user_id=eq.${created.userId}`, {
    method: 'DELETE',
    token,
  })
  check(succeeded(clearAll), `"clear all" succeeded (HTTP ${clearAll.status})`)
  const afterClearAll = await rows(
    `select count(*)::int n from public.notifications where user_id = '${created.userId}'`,
  )
  check(afterClearAll[0].n === 0, 'the list is empty afterwards')

  // ─────────────────────────────────────────────────────────────────────────────
  head('Notifications cannot be faked, or read by someone else')
  // ─────────────────────────────────────────────────────────────────────────────
  // A notification is a claim that something happened. If a client could write one, the
  // list would be worth nothing -- so INSERT is revoked and only the triggers may write.
  const forge = await api('/rest/v1/notifications', {
    method: 'POST',
    token,
    body: { user_id: created.userId, title: 'Forged', body: 'Never happened', type: 'alert' },
  })
  check(
    forge.status >= 400,
    `a customer cannot invent a notification (HTTP ${forge.status}: ${forge.text.slice(0, 90)})`,
  )
  const forged = await rows(
    `select count(*)::int n from public.notifications where title = 'Forged'`,
  )
  check(forged[0].n === 0, 'and the forged row does not exist in the database')

  // Isolation between customers.
  await admin(`select public.notify_user('${created.outsiderId}', 'Outsider private', 'body', 'info')`)
  const outsiderSees = await myNotifications(outsiderToken, created.outsiderId)
  check(
    outsiderSees.length === 1 && outsiderSees[0].title === 'Outsider private',
    'the second customer sees only their own notification',
  )
  const crossRead = await api(`/rest/v1/notifications?user_id=eq.${created.outsiderId}`, { token })
  check(
    crossRead.status === 200 && JSON.parse(crossRead.text).length === 0,
    "one customer cannot read another's notifications over the API",
  )
  const outsiderTarget = await rows(
    `select id from public.notifications where user_id = '${created.outsiderId}' limit 1`,
  )
  const crossDelete = await api(`/rest/v1/notifications?id=eq.${outsiderTarget[0].id}`, {
    method: 'DELETE',
    token,
  })
  // 204, not an error: RLS filtered the row out so nothing matched, and PostgREST
  // reports "no rows" as success. The next check is the one that proves nothing was
  // actually deleted.
  check(
    succeeded(crossDelete),
    `a cross-account delete is accepted syntactically (HTTP ${crossDelete.status})`,
  )
  const outsiderStill = await rows(
    `select count(*)::int n from public.notifications where user_id = '${created.outsiderId}'`,
  )
  check(
    outsiderStill[0].n === 1,
    '  ...but RLS deleted nothing, so the other customer kept their notification',
  )
} catch (error) {
  console.error(`\nERROR: ${error.message}`)
  process.exitCode = 1
} finally {
  await cleanup()
}

console.log(process.exitCode ? '\n=== SOME CHECKS FAILED ===' : '\n=== ALL CHECKS PASSED ===')
