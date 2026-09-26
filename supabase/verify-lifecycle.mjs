#!/usr/bin/env node
/**
 * The full order lifecycle, walked through the app's real RPCs, as a real customer and a
 * real admin -- plus the RLS negatives that make those cycles safe.
 *
 * Everything here goes over PostgREST/GoTrue with real JWTs, the same way the app does.
 * No Management API is used for the actions under test; it only creates the throwaway
 * fixtures and cleans up afterwards, because there is no product/category to sell before
 * there is a product.
 *
 * Why this exists separately from verify-notifications.mjs: that suite proves a trigger
 * fires. This one proves a *cycle* works -- signup -> address -> cart -> order -> five
 * status changes -> return request -> approval -- and that each step refuses the things it
 * should refuse. The bugs it was written for were all of the "nothing is obviously wrong
 * and the user just taps again" shape, which a per-trigger check cannot see.
 *
 * Usage:
 *   set -a && . ./.env && set +a && node supabase/verify-lifecycle.mjs
 */
import { randomUUID } from 'node:crypto'
import { grantTestAdmin, revokeTestAdmin, promoteProfile } from './lib/admin-allowlist.mjs'
import { env } from 'node:process'

const PROJECT_REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`
const PUBLISHABLE = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const MGMT = env.HIBBULLAH_SUPABASE_TOKEN

if (!MGMT) {
  console.error('Set HIBBULLAH_SUPABASE_TOKEN first.')
  process.exit(1)
}

const stamp = Date.now()
const ADMIN = { email: `lc-admin-${stamp}@hibbullah.test`, password: `LcAdmin-${stamp}-Aa1!` }
const CUSTOMER = { email: `lc-cust-${stamp}@hibbullah.test`, password: `LcCust-${stamp}-Aa1!` }
const STRANGER = { email: `lc-str-${stamp}@hibbullah.test`, password: `LcStr-${stamp}-Aa1!` }

const fix = { category: randomUUID(), manufacturer: randomUUID(), product: randomUUID() }
const PRODUCT_NAME = `Lifecycle Probe Pill ${stamp}`
const START_STOCK = 40
const PRICE = 120

let section = ''
let step = 0
let failures = 0
const head = (t) => {
  section = t
  console.log(`\n${t}`)
}
const check = (cond, m, extra = '') => {
  console.log(`  ${String(++step).padStart(2)}. ${cond ? 'PASS' : 'FAIL'}  ${m}`)
  if (extra) console.log(`        ${extra}`)
  if (!cond) {
    failures += 1
    process.exitCode = 1
  }
  return cond
}
const fatal = (m) => {
  console.log(`  ${String(++step).padStart(2)}. FAIL  ${m}`)
  failures += 1
  process.exitCode = 1
  throw new Error(m)
}

/**
 * Assert a call was refused *for the stated reason*.
 *
 * Matching only the status code is how this suite went green over a dead feature: the
 * allowlist guard fired before the transition rules, so "skipping a step is refused" passed
 * while every legitimate transition was also being refused. The reason string is what
 * distinguishes "the rule I meant to test did its job" from "some other guard happened to
 * stop it".
 */
/**
 * Call an RPC the way the app does: POST with a JSON body of named arguments.
 *
 * Not `GET /rest/v1/rpc/...?p_x=eq.y`. That form makes PostgREST bind the parameters as a
 * single record, and browse_products then fails with `column record.p_category does not
 * exist` -- an error that looks exactly like a broken function but is a property of the
 * verb. supabase-js always POSTs, so the app never hits it, and neither should a test that
 * claims to mirror the app.
 */
const rpc = (name, token, args) =>
  api(`/rest/v1/rpc/${name}`, { method: 'POST', token, body: args })

const refused = (res, expected, label) => {
  const message = res.json?.message ?? res.text ?? ''
  const ok = res.status >= 400 && String(message).includes(expected)
  check(ok, label, ok ? `${res.status} · ${String(message).slice(0, 120)}` : `expected a refusal mentioning "${expected}", got ${res.status} ${String(message).slice(0, 160)}`)
  return ok
}

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

async function api(path, { method = 'GET', token, body, prefer } = {}) {
  const headers = {
    apikey: PUBLISHABLE,
    Authorization: `Bearer ${token ?? PUBLISHABLE}`,
    'Content-Type': 'application/json',
  }
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${SUPABASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* not json */
  }
  return { status: res.status, text, json }
}

async function signIn(who) {
  const inRes = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: who.email, password: who.password } })
  if (!inRes.json?.access_token) throw new Error(`sign-in ${who.email}: ${inRes.text.slice(0, 250)}`)
  return { ...who, id: inRes.json.user.id, token: inRes.json.access_token }
}

async function signUp(who) {
  const up = await api('/auth/v1/signup', { method: 'POST', body: { email: who.email, password: who.password } })
  if (up.status !== 200) throw new Error(`signup ${who.email}: ${up.text.slice(0, 250)}`)
  return signIn(who)
}

const sqlLit = (s) => `'${String(s).replaceAll("'", "''")}'`

let adminUser
let customer
let stranger
let addressId
let orderId

try {
  // ── fixtures ─────────────────────────────────────────────────────────────────
  head('Fixtures')

  adminUser = await signUp(ADMIN)
  await grantTestAdmin(ADMIN.email)
  await promoteProfile(adminUser.id)
  // Re-sign in: the custom access token hook bakes the profile role into the JWT, so a
  // token minted before the promotion is not an admin token and transition_order_status
  // would refuse it for the wrong reason.
  adminUser = await signIn(ADMIN)
  check(Boolean(adminUser.token), `test admin ready (${adminUser.id.slice(0, 8)})`)

  customer = await signUp(CUSTOMER)
  stranger = await signUp(STRANGER)
  check(true, `customer ${customer.id.slice(0, 8)} and stranger ${stranger.id.slice(0, 8)} ready`)

  await admin(
    `insert into public.categories (id, name, slug) values ('${fix.category}', 'LC Cat ${stamp}', 'lc-cat-${stamp}');
     insert into public.manufacturers (id, name) values ('${fix.manufacturer}', 'LC Maker ${stamp}');
     insert into public.products (id, name, brand, generic_name, manufacturer_id, category_id, price, stock, unit, is_active, is_featured)
     values ('${fix.product}', ${sqlLit(PRODUCT_NAME)}, 'LCBrand', 'probe-generic', '${fix.manufacturer}', '${fix.category}', ${PRICE}, ${START_STOCK}, 'strip', true, false);`,
  )
  await admin(`insert into public.inventory_items (product_id, batch_number, quantity, expiry_date) values ('${fix.product}', 'B1', ${START_STOCK}, current_date + 400)`)
  check(true, `product "${PRODUCT_NAME}" with ${START_STOCK} in stock`)

  // ── customer onboarding ──────────────────────────────────────────────────────
  head('Customer onboarding')

  const prof = await api(`/rest/v1/profiles?select=id,name,role&email=eq.${encodeURIComponent(customer.email)}`, { token: customer.token })
  const myProfile = prof.json?.[0]
  check(
    prof.json?.length === 1 && myProfile.role === 'customer',
    'the signup trigger created exactly one profile, with role customer',
    `profiles=${prof.text.slice(0, 200)}`,
  )
  check(typeof myProfile?.name === 'string' && myProfile.name.length > 0, 'and gave it a non-empty name', `name=${JSON.stringify(myProfile?.name)}`)

  const addr = await api('/rest/v1/addresses', {
    method: 'POST',
    token: customer.token,
    prefer: 'return=representation',
    body: { label: 'Home', street: '42 Lifecycle Road', city: 'Dhaka', county: 'Dhaka', postal_code: '1215', is_default: true, user_id: customer.id },
  })
  addressId = addr.json?.[0]?.id
  check(Boolean(addressId), 'the customer saved a delivery address', addr.text.slice(0, 200))

  // ── catalog reads ────────────────────────────────────────────────────────────
  head('Catalog reads (the RPCs browse and search use)')

  const browse = await rpc('browse_products', customer.token, { p_category: fix.category, p_limit: 24 })
  const browsed = Array.isArray(browse.json) ? browse.json : []
  check(browse.status === 200 && browsed.some((p) => p.id === fix.product), `browse_products finds the product (HTTP ${browse.status}, ${browsed.length} row)`, browse.text.slice(0, 200))

  const search = await rpc('search_products', customer.token, { p_query: 'Lifecycle Probe', p_limit: 24 })
  const found = Array.isArray(search.json) ? search.json : []
  check(search.status === 200 && found.some((p) => p.id === fix.product), `search_products finds it by name (HTTP ${search.status}, ${found.length} row)`, search.text.slice(0, 200))

  const fuzzy = await rpc('search_products', customer.token, { p_query: 'Lifecycl Prob', p_limit: 24 })
  const fuzzyHits = Array.isArray(fuzzy.json) ? fuzzy.json : []
  check(fuzzy.status === 200 && fuzzyHits.some((p) => p.id === fix.product), 'and tolerates a typo, so instant search is not dead-ending', `HTTP ${fuzzy.status}, ${fuzzyHits.length} row`)

  const anon = await rpc('browse_products', undefined, { p_category: fix.category, p_limit: 24 })
  const anonRows = Array.isArray(anon.json) ? anon.json : []
  check(anon.status === 200 && anonRows.some((p) => p.id === fix.product), 'an anonymous visitor can browse too, so the shop is shoppable before sign-in', `HTTP ${anon.status}, ${anonRows.length} row`)

  // ── cart ─────────────────────────────────────────────────────────────────────
  head('Cart')

  const add = await api('/rest/v1/cart_items', {
    method: 'POST',
    token: customer.token,
    prefer: 'return=representation',
    body: { user_id: customer.id, product_id: fix.product, quantity: 2 },
  })
  const cartRow = add.json?.[0]
  check(add.status === 201 && Boolean(cartRow?.id), 'an item goes into the cart', add.text.slice(0, 200))

  const bumped = await api(`/rest/v1/cart_items?id=eq.${cartRow.id}`, {
    method: 'PATCH',
    token: customer.token,
    prefer: 'return=representation',
    body: { quantity: 3 },
  })
  check(bumped.json?.[0]?.quantity === 3, 'the quantity can be changed', bumped.text.slice(0, 200))

  const otherCart = await api('/rest/v1/cart_items', {
    method: 'POST',
    token: stranger.token,
    prefer: 'return=representation',
    body: { user_id: customer.id, product_id: fix.product, quantity: 5 },
  })
  check(otherCart.status === 400 || otherCart.status === 403, `a stranger cannot put items in somebody else's cart (HTTP ${otherCart.status})`, otherCart.text.slice(0, 200))

  // ── placing the order ────────────────────────────────────────────────────────
  head('Placing the order')

  const placed = await api('/rest/v1/rpc/create_order', {
    method: 'POST',
    token: customer.token,
    body: { p_customer_id: customer.id, p_address_id: addressId },
  })
  orderId = placed.json
  check(placed.status === 200 && Boolean(orderId), `the order is created (HTTP ${placed.status})`, placed.text.slice(0, 200))

  const order = (await api(`/rest/v1/orders?id=eq.${orderId}&select=*,order_items(*)`, { token: adminUser.token })).json?.[0]
  check(
    order?.status === 'PENDING' && order?.subtotal === PRICE * 3 && order?.delivery_fee === 150 && order?.total === PRICE * 3 + 150,
    'its money adds up: subtotal + fee = total',
    `subtotal=${order?.subtotal} fee=${order?.delivery_fee} total=${order?.total} status=${order?.status}`,
  )
  check(String(order?.address ?? '').includes('42 Lifecycle Road'), 'and it carries the chosen address', `address=${JSON.stringify(order?.address)}`)
  check(order?.order_items?.length === 1 && order?.order_items?.[0]?.quantity === 3, 'with the right line item and quantity', JSON.stringify(order?.order_items?.[0] ?? null))

  const stockRow = JSON.parse(await admin(`select stock from public.products where id = '${fix.product}'`))[0]
  const invQty = JSON.parse(await admin(`select coalesce(sum(quantity),0) q from public.inventory_items where product_id = '${fix.product}'`))[0]
  check(
    Number(stockRow.stock) === START_STOCK - 3 && Number(invQty.q) === START_STOCK - 3,
    'stock came off both the product and its inventory batch, by the ordered quantity',
    `products.stock=${stockRow.stock} inventory=${invQty.q} (started ${START_STOCK}, ordered 3)`,
  )

  const emptied = await api(`/rest/v1/cart_items?user_id=eq.${customer.id}&select=id`, { token: customer.token })
  check(emptied.json?.length === 0, 'and the cart is empty afterwards, so the badge does not lie', emptied.text.slice(0, 200))

  // ── visibility ───────────────────────────────────────────────────────────────
  head('Who can see the order')

  check((await api(`/rest/v1/orders?id=eq.${orderId}`, { token: customer.token })).json?.length === 1, 'the customer who placed it can read it back')
  check((await api(`/rest/v1/orders?id=eq.${orderId}`, { token: stranger.token })).json?.length === 0, 'a stranger cannot', 'RLS on orders')
  const anonOrders = await api(`/rest/v1/orders?id=eq.${orderId}`)
  check(anonOrders.json?.length === 0, 'and neither can an anonymous caller', 'RLS on orders')

  // ── status transitions ───────────────────────────────────────────────────────
  head('Status transitions, and who is allowed to make them')

  refused(
    await api('/rest/v1/rpc/transition_order_status', {
      method: 'POST',
      token: stranger.token,
      body: { p_order_id: orderId, p_new_status: 'CONFIRMED', p_admin_id: stranger.id },
    }),
    'Only admins can change order status',
    'a non-admin is refused',
  )

  refused(
    await api('/rest/v1/rpc/transition_order_status', {
      method: 'POST',
      token: adminUser.token,
      body: { p_order_id: orderId, p_new_status: 'CONFIRMED', p_admin_id: randomUUID() },
    }),
    'Admin ID must match authenticated user',
    'an admin cannot pass somebody else\'s id either',
  )

  refused(
    await api('/rest/v1/rpc/transition_order_status', {
      method: 'POST',
      token: adminUser.token,
      body: { p_order_id: orderId, p_new_status: 'DELIVERED', p_admin_id: adminUser.id },
    }),
    'Invalid status transition',
    'skipping a step is refused, by the transition rule rather than some other guard',
  )

  const before = JSON.parse(await admin(`select jsonb_array_length(coalesce(timeline,'[]'::jsonb)) n from public.orders where id = '${orderId}'`))[0]
  for (const next of ['CONFIRMED', 'PROCESSING', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
    const r = await api('/rest/v1/rpc/transition_order_status', {
      method: 'POST',
      token: adminUser.token,
      body: { p_order_id: orderId, p_new_status: next, p_admin_id: adminUser.id },
    })
    const now = JSON.parse(await admin(`select status, jsonb_array_length(coalesce(timeline,'[]'::jsonb)) n from public.orders where id = '${orderId}'`))[0]
    check(
      r.status === 200 && now.status === next && now.n === before.n + 1,
      `PENDING → ${next} is accepted, and the timeline grows`,
      r.status === 200 ? `status=${now.status} timeline ${before.n}→${now.n}` : `HTTP ${r.status} ${r.text.slice(0, 140)}`,
    )
    before.n = now.n
  }

  refused(
    await api('/rest/v1/rpc/transition_order_status', {
      method: 'POST',
      token: adminUser.token,
      body: { p_order_id: orderId, p_new_status: 'PENDING', p_admin_id: adminUser.id },
    }),
    'Invalid status transition',
    'going backwards is refused',
  )

  // Matched against the exact titles notify_order_status() writes, not a loose keyword
  // regex. An earlier version looked for "processing" and so missed "Preparing your order"
  // -- reporting a missing notification for a status that was in fact announced correctly.
  const EXPECTED_TITLES = {
    CONFIRMED: 'Order confirmed',
    PROCESSING: 'Preparing your order',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Order delivered',
  }
  const notifs = JSON.parse(
    await admin(`select title from public.notifications where user_id = '${customer.id}' and created_at > now() - interval '15 minutes' order by created_at`),
  ).map((n) => n.title)
  for (const [status, title] of Object.entries(EXPECTED_TITLES)) {
    const hits = notifs.filter((t) => t === title).length
    check(hits === 1, `the customer is told exactly once about ${status}`, `title "${title}" appeared ${hits}x; all: ${notifs.join(' | ').slice(0, 300)}`)
  }
  check(notifs.includes('Order placed'), 'and once that the order was placed', notifs.join(' | ').slice(0, 300))

  // ── returns ──────────────────────────────────────────────────────────────────
  head('Return requests')

  const early = await api('/rest/v1/rpc/validate_return', { method: 'POST', token: customer.token, body: { p_order_id: orderId, p_customer_id: customer.id } })
  check(early.status === 200, 'a return is allowed once the order is delivered', early.text.slice(0, 180))

  // A second, still-pending order to prove the rule bites the other way.
  await api('/rest/v1/cart_items', { method: 'POST', token: customer.token, body: { user_id: customer.id, product_id: fix.product, quantity: 1 } })
  const pendingId = (await api('/rest/v1/rpc/create_order', { method: 'POST', token: customer.token, body: { p_customer_id: customer.id, p_address_id: addressId } })).json
  const tooEarly = await api('/rest/v1/rpc/validate_return', { method: 'POST', token: customer.token, body: { p_order_id: pendingId, p_customer_id: customer.id } })
  check(tooEarly.status === 400, 'but refused while it is still pending', tooEarly.text.slice(0, 180))

  const ret = await api('/rest/v1/return_requests', {
    method: 'POST',
    token: customer.token,
    prefer: 'return=representation',
    body: { order_id: orderId, customer_id: customer.id, customer_name: 'Lifecycle Customer', product_name: PRODUCT_NAME, quantity: 1, reason: 'Wrong pack size', status: 'PENDING' },
  })
  const returnId = ret.json?.[0]?.id
  check(ret.status === 201 && Boolean(returnId), 'the customer files a return request', ret.text.slice(0, 200))

  // The regression this suite was written for: the INSERT policy used to check only
  // `auth.uid() = customer_id`, which says nothing about whose order is being returned.
  const forged = await api('/rest/v1/return_requests', {
    method: 'POST',
    token: stranger.token,
    prefer: 'return=representation',
    body: { order_id: orderId, customer_id: stranger.id, customer_name: 'Stranger', product_name: PRODUCT_NAME, quantity: 1, reason: 'not mine', status: 'PENDING' },
  })
  check(forged.status >= 400, `a stranger cannot file a return against somebody else's order (HTTP ${forged.status})`, forged.text.slice(0, 220))

  // And the same shape, but honest about claiming the order: the order belongs to the
  // customer, and a customer filing a return on their own *undelivered* order must fail.
  // The policy now owns that rule rather than the validate_return() call the client makes.
  await api('/rest/v1/cart_items', { method: 'POST', token: customer.token, body: { user_id: customer.id, product_id: fix.product, quantity: 1 } })
  const pendingId2 = (await api('/rest/v1/rpc/create_order', { method: 'POST', token: customer.token, body: { p_customer_id: customer.id, p_address_id: addressId } })).json
  const undelivered = await api('/rest/v1/return_requests', {
    method: 'POST',
    token: customer.token,
    prefer: 'return=representation',
    body: { order_id: pendingId2, customer_id: customer.id, customer_name: 'Lifecycle Customer', product_name: PRODUCT_NAME, quantity: 1, reason: 'too early', status: 'PENDING' },
  })
  check(undelivered.status >= 400, `nor can a return be filed on an order that is not delivered yet (HTTP ${undelivered.status})`, undelivered.text.slice(0, 220))

  const approved = await api(`/rest/v1/return_requests?id=eq.${returnId}`, { method: 'PATCH', token: adminUser.token, body: { status: 'APPROVED' } })
  check(approved.status === 204 || approved.status === 200, `the admin approves it (HTTP ${approved.status})`, approved.text.slice(0, 180))

  const approvedNow = (await api(`/rest/v1/return_requests?id=eq.${returnId}&select=status`, { token: customer.token })).json?.[0]
  check(approvedNow?.status === 'APPROVED', 'and the customer sees the new status', JSON.stringify(approvedNow ?? null))

  // ── audit trail ──────────────────────────────────────────────────────────────
  head('Audit trail')

  const auditRows = JSON.parse(await admin(`select action, record_type from public.audit_entries order by timestamp desc limit 20`))
  check(auditRows.length > 0, `the audit log has entries (${auditRows.length} in the last 20)`, JSON.stringify(auditRows.slice(0, 3)))
  const capped = JSON.parse(await admin(`select count(*) n from public.audit_entries`))
  check(Number(capped[0].n) <= 20, 'and is still capped at 20', `count=${capped[0].n}`)

  const notifCap = JSON.parse(await admin(`select count(*) n from public.notifications where user_id = '${customer.id}'`))
  check(Number(notifCap[0].n) <= 50, 'notifications are still capped at 50 per user', `count=${notifCap[0].n}`)
} catch (error) {
  console.error(`\nERROR: ${error.message}`)
  process.exitCode = 1
} finally {
  try {
    await revokeTestAdmin()
    console.log('\n  admin allowlist back to the two real admins.')
  } catch (e) {
    console.error(`  !! allowlist restore failed: ${e.message}`)
  }
  try {
    // Order matters. Every one of these deletes fires an audit trigger, which writes a new
    // audit_entries row pointing at the throwaway profile -- so audit_entries has to be
    // cleared *after* the table deletes and *before* auth.users. Deleting it first (as this
    // did originally) fails on the FK: audit_entries_actor_id_fkey still references the
    // profile that auth.users is about to cascade away.
    await admin(
      `delete from public.notifications where user_id in (
         select id from auth.users where email like 'lc-admin-%' or email like 'lc-cust-%' or email like 'lc-str-%');
       delete from public.return_requests where order_id in (
         select id from public.orders where customer_id in (
           select id from auth.users where email like 'lc-admin-%' or email like 'lc-cust-%' or email like 'lc-str-%'))
         or customer_id in (
           select id from auth.users where email like 'lc-admin-%' or email like 'lc-cust-%' or email like 'lc-str-%');
       delete from public.order_items where order_id in (
         select id from public.orders where customer_id in (
           select id from auth.users where email like 'lc-admin-%' or email like 'lc-cust-%' or email like 'lc-str-%'));
       delete from public.orders where customer_id in (
         select id from auth.users where email like 'lc-admin-%' or email like 'lc-cust-%' or email like 'lc-str-%');
       delete from public.cart_items where user_id in (
         select id from auth.users where email like 'lc-admin-%' or email like 'lc-cust-%' or email like 'lc-str-%');
       delete from public.addresses where user_id in (
         select id from auth.users where email like 'lc-admin-%' or email like 'lc-cust-%' or email like 'lc-str-%');
       delete from public.inventory_items where product_id in (select id from public.products where name like 'Lifecycle Probe%');
       delete from public.products where name like 'Lifecycle Probe%';
       delete from public.categories where name like 'LC Cat %';
       delete from public.manufacturers where name like 'LC Maker %';
       delete from public.audit_entries where actor_id in (
         select id from auth.users where email like 'lc-admin-%' or email like 'lc-cust-%' or email like 'lc-str-%')
         or record_id in (
           select id from public.products where name like 'Lifecycle Probe%');
       delete from auth.users where email like 'lc-admin-%' or email like 'lc-cust-%' or email like 'lc-str-%';`,
    )
    console.log('  fixtures removed.')
  } catch (e) {
    console.error(`  !! cleanup failed: ${e.message.slice(0, 300)}`)
  }
  console.log(failures === 0 ? `\nAll ${step} checks passed.\n` : `\n${failures} of ${step} checks FAILED.\n`)
}
