#!/usr/bin/env node
/**
 * Earning is profit, and stock comes back.
 *
 *   set -a && . ./.env && set +a && node supabase/verify-profit-and-restock.mjs
 *
 * Two promises the shop makes to its owner, both of which were kept only in the client's
 * head and neither of which was in the database at all:
 *
 *   1. **Earning is profit.** Not revenue, not the price of a product that was ordered and
 *      then cancelled. The dashboard's "Earning" card was answered by a JavaScript
 *      fallback that summed `order_items` with no join to `orders` — so a cancelled order
 *      counted as earnings — and that substituted `unit_price * 0.8` for any product with
 *      no cost price, inventing a 20% margin and reporting the difference as money made.
 *      `get_admin_dashboard_sales` could not have caught either, because its own guard
 *      (`auth.jwt() ->> 'role' <> 'admin'`) read a claim this project has never had, so it
 *      raised on every call and the fallback was the only thing that ever answered.
 *
 *   2. **Cancelling or returning gives the stock back.** `transition_order_status` set the
 *      status and wrote a timeline line. It never returned the units to `inventory_items`,
 *      so every cancellation removed stock from the shop permanently. Approving a return
 *      did nothing at all, and `return_requests` had no `product_id` — only a denormalised
 *      `product_name` — so the database could not even tell which product to put back.
 *
 * Both are the kind of defect that survives a review, a type-checker and a passing test
 * suite, because each was locally reasonable. Every check here drives the real functions
 * as a signed-in admin or customer would, and reads the rows back rather than trusting a
 * status code.
 */
import { env } from 'node:process'
import { grantTestAdmin, revokeTestAdmin, promoteProfile } from './lib/admin-allowlist.mjs'

const REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const URL = `https://${REF}.supabase.co`
const PUBLISHABLE = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const MGMT = env.HIBBULLAH_SUPABASE_TOKEN
const stamp = Date.now()
const P = 'aa' // fixture prefix, registered in clean-test-data.mjs so an interrupted run is swept

if (!PUBLISHABLE || !MGMT) {
  console.error('Set EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY and HIBBULLAH_SUPABASE_TOKEN.')
  process.exit(1)
}

const sqlLit = (s) => `'${String(s).replaceAll("'", "''")}'`

async function admin(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`admin SQL failed: HTTP ${res.status} ${body.slice(0, 500)}`)
  return body
}
const rows = async (sql) => JSON.parse(await admin(sql))

async function api(path, { method = 'GET', token, body, prefer } = {}) {
  const headers = { apikey: PUBLISHABLE, Authorization: `Bearer ${token ?? PUBLISHABLE}` }
  if (body) headers['Content-Type'] = 'application/json'
  // PostgREST answers a write with 201 and an empty body unless asked otherwise, so an
  // insert that "succeeds" hands back no id and everything downstream reports as a failure
  // of the thing under test rather than of the harness.
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* not json */
  }
  return { status: res.status, text, json }
}
const rpc = (name, token, args) => api(`/rest/v1/rpc/${name}`, { method: 'POST', token, body: args })

const signIn = async (email, password) => {
  const r = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })
  if (!r.json?.access_token) throw new Error(`sign-in ${email}: ${r.text.slice(0, 250)}`)
  return { id: r.json.user.id, token: r.json.access_token, email }
}
const signUp = async (email, password) => {
  const up = await api('/auth/v1/signup', { method: 'POST', body: { email, password } })
  if (up.status !== 200) throw new Error(`signup ${email}: ${up.text.slice(0, 250)}`)
  return signIn(email, password)
}

let passed = 0
let failed = 0
const failures = []
let section = ''
const head = (s) => {
  section = s
  console.log(`\n${s}`)
}
/** Assert, and record a failure without stopping — one broken thing should not hide the rest. */
const check = (ok, label, extra = '') => {
  if (ok) {
    passed += 1
    console.log(`  ${passed}. PASS  ${label}${extra ? `\n        ${extra}` : ''}`)
  } else {
    failed += 1
    failures.push(`[${section}] ${label}${extra ? ` — ${extra}` : ''}`)
    console.log(`  ${passed + failed}. FAIL  ${label}${extra ? `\n        ${extra}` : ''}`)
  }
}

const adminEmail = `${P}-pr-admin-${stamp}@hibbullah.test`
const ADMIN_PW = `${P}-Adm-${stamp}-Aa1!`
const CUST_PW = `${P}-Cus-${stamp}-Aa1!`

// One product per scenario. Sharing a product across scenarios would make each batch
// assertion depend on every scenario that ran before it, so a failure in one would report
// as a failure in the other four. Six cheap rows is a better trade than that.
const NAMES = {
  cancel: `${P}-Profit Cancel ${stamp}`,
  delivered: `${P}-Profit Delivered ${stamp}`,
  unpriced: `${P}-Profit Unpriced ${stamp}`,
  returned: `${P}-Profit Return ${stamp}`,
  overReturn: `${P}-Profit OverReturn ${stamp}`,
  unlinked: `${P}-Profit Unlinked ${stamp}`,
}

// The reporting window, in two forms because it is consumed two ways. PostgREST sends
// `p_since` as a JSON string and Postgres parses it as a timestamp, so the SQL expression
// "now() - interval '30 days'" arrives as a syntax error rather than as a date. The
// `ISO` form is what the RPC gets; the `SQL` form is interpolated into the independent
// verification queries, which do run as SQL.
const WINDOW_ISO = new Date(Date.now() - 30 * 864e5).toISOString()
const WINDOW = "now() - interval '30 days'"
/** Batch quantities, as { batch_number: quantity }. Read fresh, never cached. */
const batches = async (productName) => {
  const r = await rows(
    `select i.batch_number, i.quantity
       from public.inventory_items i join public.products p on p.id = i.product_id
      where p.name = ${sqlLit(productName)}
      order by i.batch_number`,
  )
  return Object.fromEntries(r.map((x) => [x.batch_number, Number(x.quantity)]))
}
const alloc = async (orderId) =>
  rows(
    `select a.id, a.quantity, a.restocked_quantity, i.batch_number
       from public.order_item_allocations a
       join public.inventory_items i on i.id = a.inventory_item_id
       join public.order_items oi on oi.id = a.order_item_id
      where oi.order_id = '${orderId}'
      order by i.batch_number`,
  )

/** A customer with a Dhaka address, so the delivery fee is a known 80. */
const makeCustomer = async (tag) => {
  const who = await signUp(`${P}-pr-${tag}-${stamp}@hibbullah.test`, CUST_PW)
  const addr = await api('/rest/v1/addresses', {
    method: 'POST',
    token: who.token,
    prefer: 'return=representation',
    body: {
      label: 'Home',
      street: '42 Profit Road',
      city: 'Dhaka',
      county: 'Dhaka',
      postal_code: '1215',
      is_default: true,
      user_id: who.id,
    },
  })
  who.addressId = addr.json?.[0]?.id
  return who
}

/** Put items in the cart and place the order the way the app does. */
const placeOrder = async (who, items) => {
  for (const [productId, quantity] of items) {
    await api('/rest/v1/cart_items', {
      method: 'POST',
      token: who.token,
      body: { user_id: who.id, product_id: productId, quantity },
    })
  }
  const placed = await rpc('create_order', who.token, { p_customer_id: who.id, p_address_id: who.addressId })
  return placed.json
}

const move = (orderId, status, token) =>
  rpc('transition_order_status', token, { p_order_id: orderId, p_new_status: status, p_admin_id: ADMIN_ID })

/** PENDING → … → DELIVERED, the only route the transition table allows. */
let ADMIN_ID = null
const deliver = async (orderId, adminToken) => {
  for (const s of ['CONFIRMED', 'PROCESSING', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
    const r = await move(orderId, s, adminToken)
    if (r.status !== 200) return { ok: false, at: s, res: r }
  }
  return { ok: true }
}

const dashboard = async (adminToken) =>
  rpc('get_admin_dashboard_sales', adminToken, { p_since: WINDOW_ISO })

/** File a return the way the app does, optionally with the order line it belongs to. */
const fileReturn = async (who, orderId, productName, quantity, orderItemId, productId) => {
  const r = await api('/rest/v1/return_requests', {
    method: 'POST',
    token: who.token,
    prefer: 'return=representation',
    body: {
      order_id: orderId,
      customer_id: who.id,
      customer_name: `${P}-Customer`,
      product_name: productName,
      quantity,
      reason: `${P}-reason`,
      ...(orderItemId ? { order_item_id: orderItemId, product_id: productId } : {}),
    },
  })
  return r.json?.[0]?.id
}

/**
 * The order line a return should name.
 *
 * Read with the customer's token, not anon: `order_items` is not world-readable, so the
 * first version of this returned nothing and every return it filed was silently unlinked —
 * which the suite then reported as "no order line" rather than as "wrong token". Rows are
 * found by ownership rather than by a name the test invented, so a prefix has to stay in
 * step with every value that embeds it and a foreign key does not.
 */
const orderLineId = async (orderId, productId, token) =>
  (
    await api(`/rest/v1/order_items?order_id=eq.${orderId}&product_id=eq.${productId}&select=id,quantity`, {
      token,
    })
  ).json?.[0]

let adminU
const fix = {}

try {
  // ── fixtures ──────────────────────────────────────────────────────────────────────
  adminU = await signUp(adminEmail, ADMIN_PW)
  await grantTestAdmin(adminEmail)
  await promoteProfile(adminU.id)
  // Re-signed: a token minted before the allowlist grant is not an admin token, and
  // `is_admin()` reads the allowlist off auth.users rather than profiles.role.
  adminU = await signIn(adminEmail, ADMIN_PW)
  ADMIN_ID = adminU.id
  check(Boolean(adminU.token), `admin session ready (${adminU.id.slice(0, 8)})`)

  const [cat] = await rows(
    `insert into public.categories (name, slug) values (${sqlLit(`${P}-PR Cat ${stamp}`)}, ${sqlLit(`${P}-pr-cat-${stamp}`)}) returning id`,
  )
  const [man] = await rows(
    `insert into public.manufacturers (name, country) values (${sqlLit(`${P}-PR Maker ${stamp}`)}, 'Bangladesh') returning id`,
  )

  // `cost_price` is nullable, which is the whole point of the unpriced fixture: a product
  // the owner has not priced the cost of. Everything else gets a 40 taka margin
  // (120 - 80) so the expected numbers are arithmetic rather than a captured output.
  await admin(`
    insert into public.products (name, brand, generic_name, manufacturer_id, category_id, price, cost_price, stock, is_active)
    values
      (${sqlLit(NAMES.cancel)},     'AA', 'aa-generic', '${man.id}', '${cat.id}', 120,  80, 0, true),
      (${sqlLit(NAMES.delivered)},  'AA', 'aa-generic', '${man.id}', '${cat.id}', 120,  80, 0, true),
      (${sqlLit(NAMES.unpriced)},   'AA', 'aa-generic', '${man.id}', '${cat.id}', 100, null, 0, true),
      (${sqlLit(NAMES.returned)},   'AA', 'aa-generic', '${man.id}', '${cat.id}', 120,  80, 0, true),
      (${sqlLit(NAMES.overReturn)}, 'AA', 'aa-generic', '${man.id}', '${cat.id}', 120,  80, 0, true),
      (${sqlLit(NAMES.unlinked)},   'AA', 'aa-generic', '${man.id}', '${cat.id}', 120,  80, 0, true)`)

  // Ids are looked up by name, not taken from RETURNING: Postgres does not promise that
  // RETURNING rows arrive in VALUES order, and a suite that trusts the order silently
  // adopts the wrong fixture. Same trap, same fix as verify-admin-areas.
  const byName = new Map(
    (await rows(`select id, name from public.products where name like '${P}-Profit %'`)).map((p) => [p.name, p.id]),
  )
  for (const [key, name] of Object.entries(NAMES)) fix[key] = byName.get(name)
  check(
    Object.values(fix).every(Boolean),
    'all six product fixtures exist and are addressable by name',
    Object.entries(NAMES)
      .map(([k, n]) => `${k}=${byName.get(n) ? 'yes' : 'MISSING'}`)
      .join(' '),
  )

  // Two batches per product: one expiring soon, one far out. FIFO draws the earliest
  // expiry first, so an order large enough to span both proves which batch it took --
  // which is the only way to tell an exact undo from one that dumped everything back into
  // whichever batch happened to be first in a query.
  //
  // `products.stock` is derived: `trg_inventory_sync_stock` overwrites it with the batch
  // total on every insert, so it is declared 0 here and never asserted on directly.
  const batchRows = []
  for (const name of Object.values(NAMES)) {
    const id = byName.get(name)
    batchRows.push(`('${id}', '${P}-soon', 10, current_date + 30)`)
    batchRows.push(`('${id}', '${P}-later', 10, current_date + 400)`)
  }
  await admin(`insert into public.inventory_items (product_id, batch_number, quantity, expiry_date) values ${batchRows.join(',\n     ')}`)

  // ── 1. cancelling an order gives the stock back ────────────────────────────────────
  head('Cancelling an order returns its units to the batch they came from')
  const cCancel = await makeCustomer('cancel')
  check(Boolean(cCancel.addressId), 'the cancelling customer has a delivery address', String(cCancel.addressId))

  const o1 = await placeOrder(cCancel, [[fix.cancel, 3]])
  check(Boolean(o1), 'the order is placed', String(o1))

  const afterOrder = await batches(NAMES.cancel)
  check(
    afterOrder[`${P}-soon`] === 7 && afterOrder[`${P}-later`] === 10,
    'the order is drawn from the earliest-expiry batch, and only from that one',
    `soon=${afterOrder[`${P}-soon`]} (expected 7) later=${afterOrder[`${P}-later`]} (expected 10)`,
  )

  const a1 = await alloc(o1)
  check(
    a1.length === 1 && Number(a1[0].quantity) === 3 && a1[0].batch_number === `${P}-soon`,
    'the deduction records which batch it drew from',
    `${a1.length} allocation(s): ${a1.map((x) => `${x.batch_number}×${x.quantity}`).join(', ')}`,
  )

  const cancel = await move(o1, 'CANCELLED', adminU.token)
  check(cancel.status === 200 && cancel.json === true, 'the admin cancels it', `HTTP ${cancel.status} ${String(cancel.text).slice(0, 90)}`)

  const afterCancel = await batches(NAMES.cancel)
  check(
    afterCancel[`${P}-soon`] === 10 && afterCancel[`${P}-later`] === 10,
    'the units go back to the batch they were taken from, and nowhere else',
    `soon=${afterCancel[`${P}-soon`]} (expected 10) later=${afterCancel[`${P}-later`]} (expected 10, untouched)`,
  )
  const [cancelledOrder] = await rows(`select status from public.orders where id = '${o1}'`)
  check(cancelledOrder?.status === 'CANCELLED', 'and the order really is CANCELLED', `status=${cancelledOrder?.status}`)

  const a1After = await alloc(o1)
  check(
    a1After.length === 1 && Number(a1After[0].restocked_quantity) === 3,
    'the allocation records that all 3 units were given back',
    `restocked=${a1After[0]?.restocked_quantity} of ${a1After[0]?.quantity}`,
  )

  const [timeline] = await rows(`select timeline from public.orders where id = '${o1}'`)
  const restockNote = (timeline?.timeline ?? []).find((t) => t.label === 'STOCK_RESTOCKED')
  check(Boolean(restockNote), 'the order timeline says the stock was put back', restockNote ? restockNote.note : 'no STOCK_RESTOCKED entry')

  // The transition table has no CANCELLED → CANCELLED edge, so a second cancel is refused
  // before any restock code runs. Asserted on the batch, not on the message: a restock
  // that ran twice would still leave the order looking correctly CANCELLED.
  const twice = await move(o1, 'CANCELLED', adminU.token)
  const afterTwice = await batches(NAMES.cancel)
  check(
    twice.status >= 400 && afterTwice[`${P}-soon`] === 10,
    'cancelling twice is refused, and no stock is conjured by the second attempt',
    `HTTP ${twice.status} · soon=${afterTwice[`${P}-soon`]} (expected 10, not 13)`,
  )

  // A second, independent guard: restock_order_lines() stops at what the line actually
  // took. Called directly as the database owner, asking for more than the line holds.
  const overPull = await rows(
    `select public.restock_order_lines('${o1}', (select id from public.order_items where order_id = '${o1}'), 5, 'probe') as note`,
  )
  const afterProbe = await batches(NAMES.cancel)
  check(
    Number(afterProbe[`${P}-soon`]) === 10,
    'a restock for more units than the order took adds nothing',
    `asked for 5 more, ${afterProbe[`${P}-soon`]} in the batch (expected 10) · note: ${String(overPull[0]?.note).slice(0, 80)}`,
  )

  // ── 2. a delivered order earns its margin, and only its margin ────────────────────
  head('Earning counts delivered profit, and nothing else')
  const cDel = await makeCustomer('delivered')
  const o2 = await placeOrder(cDel, [
    [fix.delivered, 2],
    [fix.unpriced, 2],
  ])
  check(Boolean(o2), 'an order of one priced and one unpriced product is placed', String(o2))
  const d2 = await deliver(o2, adminU.token)
  check(d2.ok, 'and is delivered', d2.ok ? 'PENDING → CONFIRMED → PROCESSING → OUT_FOR_DELIVERY → DELIVERED' : `failed at ${d2.at}: HTTP ${d2.res?.status} ${String(d2.res?.text).slice(0, 90)}`)

  const dash1 = await dashboard(adminU.token)
  check(dash1.status === 200 && dash1.json, 'the dashboard aggregate answers at all', `HTTP ${dash1.status} ${dash1.text.slice(0, 110)}`)

  // Computed independently, the long way, so the RPC is checked against the rules rather
  // than against itself. `wantStrict` is the specification: DELIVERED only, a real cost
  // price required, minus returns dated by approval. `wantLoose` is the bug that shipped:
  // every order counted, and a missing cost price filled in as 80% of the sale price.
  // Asserting the RPC equals `wantStrict` *and* differs from `wantLoose` is what proves
  // the fixture can tell the difference, rather than passing by coincidence.
  const [truth] = await rows(`
    with strict_profit as (
      select coalesce(sum((oi.unit_price - p.cost_price) * oi.quantity), 0)::numeric v
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        join public.products p on p.id = oi.product_id
       where o.status = 'DELIVERED' and oi.created_at >= ${WINDOW} and p.cost_price is not null
    ), loose_profit as (
      select coalesce(sum((oi.unit_price - coalesce(p.cost_price, oi.unit_price * 0.8)) * oi.quantity), 0)::numeric v
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        join public.products p on p.id = oi.product_id
       where oi.created_at >= ${WINDOW} and o.status <> 'RETURNED'
    ), strict_rev as (
      select coalesce(sum((oi.unit_price - p.cost_price) * r.quantity), 0)::numeric v
        from public.return_requests r
        join public.order_items oi on oi.id = r.order_item_id
        join public.products p on p.id = oi.product_id
       where r.status in ('APPROVED','PROCESSED') and r.approved_at is not null
         and r.approved_at >= ${WINDOW} and p.cost_price is not null
    )
    select (select v from strict_profit) - (select v from strict_rev) as strict_v,
           (select v from loose_profit)  - (select v from strict_rev)  as loose_v,
           (select v from strict_profit) as gross_v,
           (select v from strict_rev)   as rev_v`)

  const strict = Number(truth.strict_v)
  const loose = Number(truth.loose_v)
  check(
    Number(dash1.json?.totalEarning) === strict,
    'Earning equals delivered profit',
    `rpc=${dash1.json?.totalEarning} spec=${strict}`,
  )
  check(
    Number(dash1.json?.totalEarning) !== loose,
    'and is NOT the figure the old fallback produced',
    `rpc=${dash1.json?.totalEarning} buggy=${loose} — equal means a cancelled order or a guessed margin is back in`,
  )
  check(
    Number(dash1.json?.grossProfit) - Number(dash1.json?.returnedProfit) === Number(dash1.json?.totalEarning),
    'gross profit less approved returns is the headline, so the number can be explained',
    `${dash1.json?.grossProfit} − ${dash1.json?.returnedProfit} = ${dash1.json?.totalEarning}`,
  )

  // The unpriced product must contribute nothing and be named. Counting it at an assumed
  // 20% margin would have added 2 × (100 − 80) = 40 taka of earnings nobody had.
  const unpricedQty = Number(dash1.json?.unpricedQty ?? 0)
  check(
    unpricedQty >= 2,
    'a product with no cost price is reported rather than guessed at',
    `unpricedItems=${dash1.json?.unpricedItems} unpricedQty=${unpricedQty} (expected ≥ 2)`,
  )

  // And specifically: the cancelled order from section 1 is in neither revenue nor profit.
  const revTruth = (await rows(`
    select coalesce(sum(case when o.status = 'DELIVERED' then o.total else 0 end), 0)::numeric delivered_rev,
           coalesce(sum(o.total), 0)::numeric every_rev
      from public.orders o where o.created_at >= ${WINDOW}`))[0]
  check(
    Number(dash1.json?.totalSalesRevenue) === Number(revTruth.delivered_rev),
    'revenue counts delivered orders only, so a cancelled order is not money taken',
    `rpc=${dash1.json?.totalSalesRevenue} delivered=${revTruth.delivered_rev} everyOrder=${revTruth.every_rev}`,
  )

  // The function must be admin-only. It used to guard itself with a JWT claim this project
  // has never had, so it refused everyone — including real admins — and the client quietly
  // took over with a JavaScript fallback that had none of these rules.
  for (const [who2, tok] of [
    ['a logged-out visitor', undefined],
    ['a signed-in customer', cDel.token],
  ]) {
    const r = await rpc('get_admin_dashboard_sales', tok, { p_since: WINDOW_ISO })
    check(r.status >= 400, `${who2} cannot read the dashboard aggregate`, `HTTP ${r.status} ${String(r.json?.message ?? r.text).slice(0, 70)}`)
  }
  const asAdmin = await rpc('get_admin_dashboard_sales', adminU.token, { p_since: WINDOW_ISO })
  check(asAdmin.status === 200, 'a real admin can — the guard is no longer over-broad', `HTTP ${asAdmin.status}`)

  // ── 3. approving a return gives the stock back and reverses the profit ─────────────
  head('Approving a return restores the units and reverses the profit')
  const cRet = await makeCustomer('returned')
  const o3 = await placeOrder(cRet, [[fix.returned, 6]])
  check(Boolean(o3), 'a six-unit order is placed', String(o3))
  const d3 = await deliver(o3, adminU.token)
  check(d3.ok, 'and is delivered', d3.ok ? 'delivered' : `failed at ${d3.at}`)

  const afterSell = await batches(NAMES.returned)
  check(afterSell[`${P}-soon`] === 4, 'six units left the earliest-expiry batch', `soon=${afterSell[`${P}-soon`]} (expected 4)`)

  const beforeReturn = await dashboard(adminU.token)
  const line3 = await orderLineId(o3, fix.returned, cRet.token)
  check(Boolean(line3?.id), 'the order line is addressable, so the return can name it', JSON.stringify(line3))

  const ret3 = await fileReturn(cRet, o3, NAMES.returned, 2, line3?.id, fix.returned)
  check(Boolean(ret3), 'the customer returns 2 of the 6', String(ret3))

  const beforeStock = await batches(NAMES.returned)
  const approve3 = await api(`/rest/v1/return_requests?id=eq.${ret3}`, {
    method: 'PATCH',
    token: adminU.token,
    body: { status: 'APPROVED' },
  })
  // The status code is not the evidence. A PATCH matching zero rows answers 204, so the
  // row is read back and the stock is re-read — the stock is the actual promise here.
  const ret3Row = (await api(`/rest/v1/return_requests?id=eq.${ret3}&select=status,approved_at,restock_note`, { token: adminU.token })).json?.[0]
  check(
    approve3.status < 300 && ret3Row?.status === 'APPROVED',
    'the admin approves it',
    `HTTP ${approve3.status} · status=${ret3Row?.status}`,
  )
  check(Boolean(ret3Row?.approved_at), 'and the approval is dated, which is what the reversal keys on', `approved_at=${ret3Row?.approved_at}`)
  check(
    /restocked/i.test(String(ret3Row?.restock_note)) && !/NOT restocked/i.test(String(ret3Row?.restock_note)),
    'and the row records that the stock went back',
    String(ret3Row?.restock_note).slice(0, 130),
  )

  const afterReturn = await batches(NAMES.returned)
  check(
    afterReturn[`${P}-soon`] === beforeStock[`${P}-soon`] + 2,
    'the two returned units are back in the shop',
    `soon ${beforeStock[`${P}-soon`]} → ${afterReturn[`${P}-soon`]} (expected ${beforeStock[`${P}-soon`] + 2})`,
  )

  const afterReturnDash = await dashboard(adminU.token)
  check(
    Number(afterReturnDash.json?.totalEarning) === Number(beforeReturn.json?.totalEarning) - 80,
    'and the profit comes off: 2 units × 40 taka margin',
    `${beforeReturn.json?.totalEarning} → ${afterReturnDash.json?.totalEarning} (expected ${Number(beforeReturn.json?.totalEarning) - 80})`,
  )

  // Approving again must be a no-op. The trigger fires only on the status *crossing* to
  // APPROVED, so a re-save cannot restock twice — and the profit must not be reversed twice
  // either, which is why both are re-read rather than assumed.
  const reApprove = await api(`/rest/v1/return_requests?id=eq.${ret3}`, {
    method: 'PATCH',
    token: adminU.token,
    body: { status: 'APPROVED' },
  })
  const afterRe = await batches(NAMES.returned)
  const afterReDash = await dashboard(adminU.token)
  check(
    afterRe[`${P}-soon`] === afterReturn[`${P}-soon`] && Number(afterReDash.json?.totalEarning) === Number(afterReturnDash.json?.totalEarning),
    'approving the same return again changes neither the stock nor the profit',
    `stock still ${afterRe[`${P}-soon`]} · earning still ${afterReDash.json?.totalEarning} · the re-save answered ${reApprove.status}`,
  )

  // ── 4. an over-sized return is capped, not obeyed ────────────────────────────────
  head('A return for more units than were sold cannot inflate the stock')
  const cOver = await makeCustomer('over')
  const o4 = await placeOrder(cOver, [[fix.overReturn, 2]])
  const d4 = await deliver(o4, adminU.token)
  check(d4.ok, 'a two-unit order is placed and delivered', d4.ok ? 'delivered' : `failed at ${d4.at}`)

  const line4 = await orderLineId(o4, fix.overReturn, cOver.token)
  const ret4 = await fileReturn(cOver, o4, NAMES.overReturn, 5, line4?.id, fix.overReturn)
  const beforeOver = await batches(NAMES.overReturn)
  await api(`/rest/v1/return_requests?id=eq.${ret4}`, { method: 'PATCH', token: adminU.token, body: { status: 'APPROVED' } })
  const ret4Row = (await api(`/rest/v1/return_requests?id=eq.${ret4}&select=status,restock_note`, { token: adminU.token })).json?.[0]
  const afterOver = await batches(NAMES.overReturn)
  const given = afterOver[`${P}-soon`] - beforeOver[`${P}-soon`]

  check(
    ret4Row?.status === 'APPROVED',
    'the approval still goes through — the shop is not left with a stuck return',
    `status=${ret4Row?.status} · ${String(ret4Row?.restock_note).slice(0, 120)}`,
  )
  check(
    given === 2,
    'but only the 2 units that were actually sold go back, not the 5 that were asked for',
    `requested 5, line held 2, stock grew by ${given} (expected 2)`,
  )
  check(
    /NOT restocked|partly restocked/i.test(String(ret4Row?.restock_note)),
    'and the row says the request exceeded what was sold',
    String(ret4Row?.restock_note).slice(0, 150),
  )

  // ── 5. a return that cannot be linked is visible, not silent ──────────────────────
  head('A return with no order line is flagged rather than silently dropping stock')
  const cUn = await makeCustomer('unlinked')
  const o5 = await placeOrder(cUn, [[fix.unlinked, 1]])
  const d5 = await deliver(o5, adminU.token)
  check(d5.ok, 'a one-unit order is placed and delivered', d5.ok ? 'delivered' : `failed at ${d5.at}`)

  // Filed the way a pre-migration row looks: a product NAME and nothing else. This is the
  // shape the app used to send, and it is the reason the column existed at all.
  const ret5 = await fileReturn(cUn, o5, NAMES.unlinked, 1, null, null)
  check(Boolean(ret5), 'the customer files a return with only a product name', String(ret5))

  const beforeUn = await batches(NAMES.unlinked)
  await api(`/rest/v1/return_requests?id=eq.${ret5}`, { method: 'PATCH', token: adminU.token, body: { status: 'APPROVED' } })
  const ret5Row = (await api(`/rest/v1/return_requests?id=eq.${ret5}&select=status,approved_at,restock_note`, { token: adminU.token })).json?.[0]
  const afterUn = await batches(NAMES.unlinked)

  check(
    ret5Row?.status === 'APPROVED',
    'the approval succeeds anyway, rather than being vetoed by a bookkeeping gap',
    `status=${ret5Row?.status} · ${String(ret5Row?.restock_note).slice(0, 130)}`,
  )
  check(
    /^NOT restocked/i.test(String(ret5Row?.restock_note)),
    'and the row says in plain words that no stock was restored',
    String(ret5Row?.restock_note).slice(0, 150),
  )
  check(
    afterUn[`${P}-soon`] === beforeUn[`${P}-soon`],
    'so an unlinked return adds no stock rather than guessing which product it meant',
    `soon ${beforeUn[`${P}-soon`]} → ${afterUn[`${P}-soon`]}`,
  )
  check(
    Boolean(ret5Row?.approved_at),
    'but it is still dated, because the refund really did happen',
    `approved_at=${ret5Row?.approved_at}`,
  )

  // Its profit cannot be reversed — there is no unit price or cost price to reverse — and
  // that gap is counted so it can be chased rather than quietly inflating earnings.
  const dash5 = await dashboard(adminU.token)
  check(
    Number(dash5.json?.unlinkedReturns ?? 0) >= 1,
    'and the un-reversible refund is counted, so the gap is visible',
    `unlinkedReturns=${dash5.json?.unlinkedReturns} · the shop can see which return to fix by hand`,
  )

  // ── 6. the inventory helpers are not callable by the app's own users ──────────────
  head('The stock helpers are unreachable from outside the database')
  // Supabase's default privileges grant EXECUTE on every new function to anon and
  // authenticated at CREATE time, so `revoke ... from public` alone leaves a signed-in
  // customer able to call any of these. `restock_order_lines` in particular would let a
  // stranger add stock to any batch just by knowing a product id.
  for (const [name, args, label] of [
    ['deduct_inventory_fifo', { p_product_id: fix.cancel, p_quantity: 1 }, 'destroy stock'],
    ['restock_order_lines', { p_order_id: o1, p_order_item_id: o1, p_quantity: 5, p_reason: 'x' }, 'add stock'],
    ['approve_return_stock', { p_return_id: ret3 }, 'restock a return by hand'],
    ['profit_since', { p_since: WINDOW_ISO }, 'read the whole profit figure'],
  ]) {
    for (const [who2, tok] of [
      ['a logged-out visitor', undefined],
      ['a signed-in customer', cDel.token],
      ['a signed-in admin', adminU.token],
    ]) {
      const r = await rpc(name, tok, args)
      check(r.status >= 400, `${who2} cannot ${label} (${name})`, `HTTP ${r.status} ${String(r.json?.message ?? r.text).slice(0, 70)}`)
    }
  }
  // …and the shop is still browsable without an account. A lockdown that broke this would
  // be worse than the leak it prevents.
  const stillBrowsable = await api('/rest/v1/products?select=id&limit=1', { token: undefined })
  check(stillBrowsable.status === 200 && (stillBrowsable.json ?? []).length === 1, 'a logged-out visitor can still browse products', `HTTP ${stillBrowsable.status}`)

  // ── 7. a product can be added without knowing what it cost ─────────────────────────
  head('A product with no cost price saves, and is then reported as unpriced')
  // The client used to fill this gap in: `createProduct` sent `price * 0.8` whenever the
  // cost box was left empty, so the exclusion the dashboard performs was undone one RPC
  // call earlier. The client now sends nothing, which makes this — an unpriced product
  // going in through `create_product` — the normal case rather than an edge case. So it is
  // exercised here, and "the product still saves" is a measured fact rather than an
  // assumption. Refusing the save would be worse than an unpriced product: not knowing what
  // you paid for something is an ordinary state for a shop.
  const cat2 = (await rows(`select id from public.categories where slug like '${P}-pr-cat-%' limit 1`))[0]
  const man2 = (await rows(`select id from public.manufacturers where name like '${P}-PR Maker %' limit 1`))[0]
  // A fixed-shape uuid from the run's own stamp, so an interrupted run cannot collide
  // with the row it is trying to insert.
  const newId = `11111111-2222-4333-8444-${String(stamp).replace(/\D/g, '').slice(0, 12).padEnd(12, '0')}`
  const noCostName = `${P}-Profit NoCost ${stamp}`

  // The baseline is read *before* the product exists, so a version of the database that
  // wrongly counted listed-but-unsold products would be caught here rather than hidden by
  // a baseline taken afterwards.
  const beforeListing = Number((await dashboard(adminU.token)).json?.unpricedItems ?? 0)

  const created = await rpc('create_product', adminU.token, {
    p_id: newId,
    p_name: noCostName,
    p_brand: 'AA',
    p_generic_name: 'aa-generic',
    p_manufacturer_id: man2?.id,
    p_category_id: cat2?.id,
    p_price: 100,
    p_cost_price: null,
    p_initial_stock: 5,
  })
  check(
    created.status < 300,
    'the product saves at all, with no cost price supplied',
    `HTTP ${created.status} ${String(created.json?.message ?? created.text).slice(0, 80)}`,
  )
  const stored = (await rows(`select cost_price, price from public.products where id = ${sqlLit(newId)}`))[0]
  check(
    stored != null && stored.cost_price === null,
    'and the cost stays empty rather than being filled in with a 20% guess',
    `row=${stored ? 'found' : 'MISSING'} cost_price=${JSON.stringify(stored?.cost_price)} price=${stored?.price}`,
  )
  const afterListing = Number((await dashboard(adminU.token)).json?.unpricedItems ?? 0)
  check(
    afterListing === beforeListing,
    'a listed-but-unsold unpriced product does not move the unpriced count — it counts earnings left out, not catalog gaps',
    `unpricedItems ${beforeListing} → ${afterListing} after listing ${noCostName} (expected no change)`,
  )

  // Sold, it does count. This is the figure the card is about.
  const cNoCost = await makeCustomer('nocost')
  const o7 = await placeOrder(cNoCost, [[newId, 1]])
  const d7 = o7 ? await deliver(o7, adminU.token) : { ok: false, at: 'order was not placed' }
  check(d7.ok, 'and once it is sold and delivered', d7.ok ? 'delivered' : `failed at ${d7.at}`)
  const dash7 = await dashboard(adminU.token)
  check(
    Number(dash7.json?.unpricedItems ?? 0) === beforeListing + 1,
    'the unpriced count rises by exactly one product — it counts products, not order lines',
    `unpricedItems ${beforeListing} → ${dash7.json?.unpricedItems} (expected ${beforeListing + 1})`,
  )
  check(
    Number(dash7.json?.unpricedQty ?? 0) >= 1,
    'and the units are reported too, so the warning reads as an amount of money',
    `unpricedQty=${dash7.json?.unpricedQty} · the card reads "Earnings exclude 1 product sold with no cost price set · 1 unit"`,
  )
} catch (e) {
  failed += 1
  failures.push(`threw: ${e?.message ?? e}`)
  console.log(`\nTHREW: ${e?.stack ?? e?.message ?? e}`)
} finally {
  try {
    await revokeTestAdmin()
    console.log('\n  admin allowlist back to the two real admins.')
  } catch (e) {
    console.error(`  !! allowlist restore failed: ${e.message}`)
  }
  try {
    // Order matters. `order_item_allocations` references `inventory_items` ON DELETE
    // RESTRICT, so the order items (and with them the allocations) have to go before the
    // batches do. `audit_entries` references profiles ON DELETE RESTRICT, so it goes after
    // the table deletes and before auth.users.
    //
    // No `.catch(() => {})`: verify-admin-areas learned the hard way that a swallowed
    // teardown failure turns one unmatched pattern into a database nobody trusts.
    const TEST_IDS = `(select id from auth.users where email like '%@hibbullah.test')`
    const steps = [
      ['return requests', `delete from public.return_requests where customer_id in ${TEST_IDS} or product_name like '${P}-%'`],
      ['order items', `delete from public.order_items where order_id in (select id from public.orders where customer_id in ${TEST_IDS}) or product_id in (select id from public.products where name like '${P}-%')`],
      ['orders', `delete from public.orders where customer_id in ${TEST_IDS} or order_number like '${P}-%'`],
      ['inventory items', `delete from public.inventory_items where product_id in (select id from public.products where name like '${P}-%')`],
      ['cart items', `delete from public.cart_items where product_id in (select id from public.products where name like '${P}-%') or user_id in ${TEST_IDS}`],
      ['favorites', `delete from public.favorites where user_id in ${TEST_IDS}`],
      ['addresses', `delete from public.addresses where user_id in ${TEST_IDS}`],
      ['notifications', `delete from public.notifications where user_id in ${TEST_IDS} or title like '${P}-%' or body like '%${P}-%' or title like 'Out of stock: ${P}-%'`],
      ['products', `delete from public.products where name like '${P}-%'`],
      ['manufacturers', `delete from public.manufacturers where name like '${P}-%'`],
      ['categories', `delete from public.categories where name like '${P}-%' or slug like '${P}-%'`],
      ['audit entries', `delete from public.audit_entries where actor_id in ${TEST_IDS} or record_id in (select id from public.return_requests where customer_id in ${TEST_IDS})`],
      ['test auth users', `delete from auth.users where email like '%@hibbullah.test'`],
    ]
    for (const [label, sql] of steps) {
      try {
        await admin(sql)
      } catch (e) {
        failed += 1
        failures.push(`teardown could not remove ${label}: ${String(e.message).slice(0, 160)}`)
        console.log(`  TEARDOWN FAILED  ${label}: ${String(e.message).slice(0, 160)}`)
      }
    }
    // The point of the sweep: a fixture this suite forgot to delete is still deletable.
    const residue = await rows(
      `select
         (select count(*)::int from public.products where name like '${P}-%') products,
         (select count(*)::int from public.orders where customer_id in ${TEST_IDS}) orders,
         (select count(*)::int from public.return_requests where customer_id in ${TEST_IDS}) returns_,
         (select count(*)::int from public.order_item_allocations a
            where not exists (select 1 from public.order_items oi where oi.id = a.order_item_id)) orphan_allocations,
         (select count(*)::int from auth.users where email like '%@hibbullah.test') users`,
    )
    const r = residue[0] ?? {}
    const clean = Object.values(r).every((v) => Number(v) === 0)
    check(clean, 'no fixture residue is left behind', JSON.stringify(r))
    console.log('  fixtures removed.')
  } catch (e) {
    console.error(`  !! cleanup failed: ${String(e.message).slice(0, 300)}`)
    failed += 1
  }
  const total = passed + failed
  console.log(failed === 0 ? `\nAll ${total} checks passed.\n` : `\n${failed} of ${total} checks FAILED.\n`)
  if (failures.length) {
    console.log('Failures:')
    for (const f of failures) console.log(`  · ${f}`)
  }
  if (failed > 0) process.exitCode = 1
}
