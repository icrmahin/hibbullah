#!/usr/bin/env node
/**
 * The admin dashboard's four read areas, end to end, against the live database.
 *
 *   customers · reports · returns · audit log
 *
 * Complements `verify-lifecycle.mjs`, which walks the order and return cycles. That suite
 * proves the *rules* hold; this one asks whether the four admin screens can actually do
 * their job, and it drives them the way a screen does — through PostgREST, with a real
 * admin JWT, using the same RPC names and the same query shapes the app issues.
 *
 * ── why these are worth a suite at all ─────────────────────────────────────────────
 * Three of the four areas had defects that no type-checker, linter or review would catch,
 * because each one was locally reasonable:
 *
 *   customers   `get_customers_with_stats` is SECURITY DEFINER with no in-body check, so
 *               a logged-out visitor could page the whole customer list — every name,
 *               email, phone and lifetime spend. The screen worked perfectly; it was
 *               simply readable by anyone.
 *   reports     the totals were computed in JavaScript from every row of orders, products
 *               and inventory_items, and the expiry window was 90 days here against
 *               config's 60 everywhere else, so the reports screen and the expiry screen
 *               disagreed about what "expiring soon" meant.
 *   returns     a cancelled order was counted as money the customer had spent.
 *   audit log   `old_value` and `new_value` were arriving and mapped, and the screen
 *               rendered none of them, so every entry read as "UPDATE · order_items".
 *
 * Each of those is invisible from the client, so each is asserted here against the
 * database that would actually serve it.
 *
 * ── the shape of it ─────────────────────────────────────────────────────────────────
 * Fixtures are created and destroyed inside the run, and the teardown is in a `finally`
 * that runs on partial failure. The allowlist is restored through the same helper the
 * lifecycle suite uses, because `is_admin()` reads the email allowlist rather than
 * `profiles.role` — a test admin promoted only in the profiles table is refused by every
 * RPC under test, which is correct behaviour and an easy thing to misread as a bug.
 */
import { randomUUID } from 'node:crypto'
import { env } from 'node:process'
import { grantTestAdmin, revokeTestAdmin, promoteProfile } from './lib/admin-allowlist.mjs'

const REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const URL = `https://${REF}.supabase.co`
const PUBLISHABLE = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const MGMT = env.HIBBULLAH_SUPABASE_TOKEN
const stamp = Date.now()
const P = 'aa' // fixture prefix, so db:clean-test-data can sweep anything left behind

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
  // insert that "succeeds" hands back no id. Everything downstream then operates on
  // `undefined` and reports as a failure of the thing under test rather than of the harness.
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
/** Assert, and record a failure without stopping — one broken area should not hide the rest. */
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
/** Assert that a response is a refusal, and that it says why. */
const refused = (res, expected, label) => {
  const message = String(res.json?.message ?? res.text ?? '')
  const ok = res.status >= 400 && message.includes(expected)
  check(ok, label, ok ? `${res.status} · ${message.slice(0, 110)}` : `expected "${expected}", got ${res.status} ${message.slice(0, 150)}`)
  return ok
}

const adminEmail = `${P}-admin-${stamp}@hibbullah.test`
const customerEmail = `${P}-cust-${stamp}@hibbullah.test`
const strangerEmail = `${P}-str-${stamp}@hibbullah.test`
const ADMIN_PW = `${P}-Adm-${stamp}-Aa1!`
const CUST_PW = `${P}-Cus-${stamp}-Aa1!`
const STR_PW = `${P}-Str-${stamp}-Aa1!`

const fix = {}
let adminU
let customer
let stranger

try {
  // ── fixtures ──────────────────────────────────────────────────────────────────────
  adminU = await signUp(adminEmail, ADMIN_PW)
  await grantTestAdmin(adminEmail)
  await promoteProfile(adminU.id)
  // Re-signed: the token minted at signup predates the promotion, and `is_admin()` reads
  // the allowlist off auth.users, so a token from before the grant is not an admin token.
  adminU = await signIn(adminEmail, ADMIN_PW)
  customer = await signUp(customerEmail, CUST_PW)
  stranger = await signUp(strangerEmail, STR_PW)
  check(Boolean(adminU.token), `admin session ready (${adminU.id.slice(0, 8)})`)

  // Fixture category and manufacturer. Products carry both as NOT NULL foreign keys, so
  // these have to exist before the products do; they are prefixed so the teardown removes
  // them along with everything else. Reusing the shop's real ones would work, but a test
  // that mutates shared rows is a test that can break real data.
  const [cat] = await rows(
    `insert into public.categories (name, slug) values (${sqlLit(`${P}-Category ${stamp}`)}, ${sqlLit(`${P}-cat-${stamp}`)}) returning id`,
  )
  const [man] = await rows(
    `insert into public.manufacturers (name, country) values (${sqlLit(`${P}-Manufacturer ${stamp}`)}, 'Bangladesh') returning id`,
  )
  fix.category = cat.id
  fix.manufacturer = man.id

  // Three products, so the low-stock and out-of-stock counts are not trivially zero. A
  // report checked only against an empty shop would pass just as happily if every field
  // returned 0, so the fixtures have to make the arithmetic mean something.
  //
  // `products` has no `low_stock_threshold` column — the threshold lives in
  // `config.lowStockThreshold` and is passed in as a parameter, which is why a hard-coded
  // 10 in the reports service was invisible until the two drifted apart.
  //
  // The ids are then looked up by name rather than taken from RETURNING. Postgres does not
  // promise that RETURNING rows arrive in VALUES order, and it did not here: the run
  // silently adopted the wrong product as its stock fixture and asserted against it.
  await admin(`
    insert into public.products (name, brand, generic_name, manufacturer_id, category_id, price, stock, is_active)
    values
      (${sqlLit(`${P}-Pill ${stamp}`)}, 'AA', 'aa-generic', '${fix.manufacturer}', '${fix.category}', 120, 40, true),
      (${sqlLit(`${P}-Low ${stamp}`)}, 'AA', 'aa-generic', '${fix.manufacturer}', '${fix.category}', 60, 3, true),
      (${sqlLit(`${P}-Out ${stamp}`)}, 'AA', 'aa-generic', '${fix.manufacturer}', '${fix.category}', 60, 0, true)`)
  const byName = new Map(
    (await rows(`select id, name, stock from public.products where name like '${P}-%'`)).map((p) => [p.name, p]),
  )
  fix.product = byName.get(`${P}-Pill ${stamp}`)?.id
  fix.lowProduct = byName.get(`${P}-Low ${stamp}`)?.id
  fix.outProduct = byName.get(`${P}-Out ${stamp}`)?.id
  check(
    Boolean(fix.product && fix.lowProduct && fix.outProduct),
    'the three product fixtures exist and are addressable by name',
    `pill=${byName.get(`${P}-Pill ${stamp}`)?.stock} low=${byName.get(`${P}-Low ${stamp}`)?.stock} out=${byName.get(`${P}-Out ${stamp}`)?.stock}`,
  )

  // Two batches: one inside any sane expiry warning, one far out. The pair is what makes
  // the `expiring` count able to distinguish a correct window from a hard-coded one.
  //
  // The quantities sum to the product's declared stock on purpose. `inventory_items` is
  // the source of truth for stock — `trg_inventory_sync_stock` calls `sync_product_stock`
  // and overwrites `products.stock` with the batch total on every insert — so a fixture
  // that declared 40 and then added batches summing to 20 was quietly rewritten to 20 the
  // moment the batches landed, and the later stock checks were reading a number the test
  // itself had invalidated.
  await admin(
    `insert into public.inventory_items (product_id, batch_number, quantity, expiry_date) values
       ('${fix.product}', '${P}-soon', 20, current_date + 20),
       ('${fix.product}', '${P}-later', 20, current_date + 400)`,
  )
  // A DELIVERED order, so revenue, delivered_orders and discounts are all non-zero, and a
  // CANCELLED one to prove it is excluded from spend but still counted as an order.
  await admin(
    `insert into public.orders (order_number, customer_id, customer_name, status, subtotal, discount, delivery_fee, total, address, created_at)
     values
       (${sqlLit(`${P}-DEL-${stamp}`)}, '${customer.id}', ${sqlLit(`${P}-Customer`)}, 'DELIVERED', 120, 20, 80, 180, 'flat, Dhaka, Dhaka', now()),
       (${sqlLit(`${P}-CAN-${stamp}`)}, '${customer.id}', ${sqlLit(`${P}-Customer`)}, 'CANCELLED', 100, 0, 150, 250, 'flat, Dhaka, Gazipur', now())`,
  )

  // ── 1. the customer list must not be public ───────────────────────────────────────
  head('Customers — the list is admin-only')
  for (const [name, args] of [
    ['get_customers_with_stats', { p_limit: 50, p_offset: 0 }],
    ['get_customer_stats', { p_customer_id: customer.id }],
  ]) {
    const anonRes = await rpc(name, undefined, args)
    refused(anonRes, 'permission denied', `a logged-out visitor is refused by ${name}`)
    const custRes = await rpc(name, customer.token, args)
    refused(custRes, 'Only admins', `a signed-in customer is refused by ${name}`)
  }

  head('Customers — the admin list works')
  const list = await rpc('get_customers_with_stats', adminU.token, { p_query: null, p_limit: 50, p_offset: 0 })
  check(list.status === 200 && Array.isArray(list.json), 'admin reads the customer list', `HTTP ${list.status} ${list.text.slice(0, 110)}`)
  const mine = (list.json ?? []).find((c) => c.id === customer.id)
  check(Boolean(mine), 'the customer just created is in the list')
  check(
    (list.json ?? []).every((c) => c.role === 'customer'),
    'no administrator appears in the customer list',
    (list.json ?? []).filter((c) => c.role !== 'customer').map((c) => c.email).join(', ') || 'all rows are role=customer',
  )
  // 2 delivered + 1 cancelled order. The count is the whole history; the spend is not.
  check(Number(mine?.order_count) === 2, 'order count includes the cancelled order', `count=${mine?.order_count} (expected 2)`)
  check(
    Number(mine?.total_spent) === 180,
    'a cancelled order is not counted as money spent',
    `total_spent=${mine?.total_spent} · delivered 180 + cancelled 250 must be 180, not 430`,
  )

  const searched = await rpc('get_customers_with_stats', adminU.token, {
    p_query: `${P}-cust`,
    p_limit: 20,
    p_offset: 0,
  })
  check(
    searched.status === 200 && (searched.json ?? []).length === 1 && searched.json[0].id === customer.id,
    'search narrows to the one matching customer',
    `matched ${(searched.json ?? []).length}`,
  )
  const paged = await rpc('get_customers_with_stats', adminU.token, { p_query: null, p_limit: 1, p_offset: 0 })
  check((paged.json ?? []).length === 1, 'p_limit is honoured', `returned ${(paged.json ?? []).length} of a 1-row page`)

  const detail = await rpc('get_customer_stats', adminU.token, { p_customer_id: customer.id })
  check(
    detail.status === 200 && Number(detail.json?.[0]?.total_spent) === 180,
    'get_customer_stats agrees with the list',
    `stats=${detail.json?.[0]?.total_spent} · list=${mine?.total_spent}`,
  )

  // ── 2. reports ────────────────────────────────────────────────────────────────────
  head('Reports — aggregated in the database, admin-only')
  for (const [who, tok] of [
    ['a logged-out visitor', undefined],
    ['a signed-in customer', customer.token],
  ]) {
    const r = await rpc('get_reports', tok, { p_low_stock_threshold: 10, p_expiry_warning_days: 60 })
    refused(r, 'Only admins', `${who} is refused by get_reports`)
  }

  const LOW = 10
  const DAYS = 60
  const rep = await rpc('get_reports', adminU.token, {
    p_low_stock_threshold: LOW,
    p_expiry_warning_days: DAYS,
  })
  check(rep.status === 200 && Array.isArray(rep.json) && rep.json.length === 1, 'admin reads the reports', `HTTP ${rep.status} ${rep.text.slice(0, 110)}`)
  const got = rep.json?.[0] ?? {}

  // Computed independently, the long way, so the RPC is checked against the data rather
  // than against itself. The two counts get distinct output names on purpose: naming both
  // of them `n` meant the API returned two columns with the same key, the second overwrote
  // the first in the JSON, and `delivered_orders` was being compared against the expiring
  // count. The first version of this reported a mismatch for the wrong reason, and the
  // `expiring` check passed for the wrong one.
  const [want] = await rows(`
    with d as (
      select coalesce(sum(total),0)::numeric revenue, count(*)::bigint delivered, coalesce(sum(discount),0)::numeric discount
        from public.orders where status = 'DELIVERED'
    ), s as (
      select count(*) filter (where stock > 0 and stock < ${LOW})::bigint low,
             count(*) filter (where stock <= 0)::bigint out
        from public.products
    ), b as (
      select product_id, quantity, expiry_date from public.inventory_items where quantity > 0
    ), e as (
      select count(*)::bigint expiring from b
       where expiry_date is not null and expiry_date >= current_date and expiry_date <= current_date + ${DAYS}
    ), v as (
      select coalesce(sum(b.quantity * coalesce(p.price,0)),0)::numeric val
        from b left join public.products p on p.id = b.product_id
    )
    select d.revenue, d.delivered, d.discount, s.low, s.out, e.expiring, v.val from d, s, e, v`)

  for (const [key, wkey] of [
    ['revenue', 'revenue'],
    ['delivered_orders', 'delivered'],
    ['discounts', 'discount'],
    ['low_stock', 'low'],
    ['out_of_stock', 'out'],
    ['expiring', 'expiring'],
    ['inventory_value', 'val'],
  ]) {
    const same = Number(got[key]) === Number(want[wkey])
    check(same, `get_reports.${key} matches the data`, `rpc=${got[key]} sql=${want[wkey]}`)
  }

  // The fixtures make these non-zero, which is the point: a report checked only against an
  // empty shop would pass just as happily if every field returned 0.
  check(Number(got.revenue) > 0 && Number(got.delivered_orders) > 0, 'revenue and delivered orders are non-zero for the fixture', `revenue=${got.revenue} orders=${got.delivered_orders}`)
  check(Number(got.discounts) > 0, 'discounts are non-zero, and counted over DELIVERED only', `discounts=${got.discounts}`)
  check(Number(got.low_stock) > 0 && Number(got.out_of_stock) > 0, 'low and out-of-stock counts are non-zero', `low=${got.low_stock} out=${got.out_of_stock}`)
  check(Number(got.expiring) > 0, 'the near batch is counted as expiring', `expiring=${got.expiring}`)

  // The window is a parameter. A hard-coded 90 or 60 would answer these identically, so the
  // test asks for a window that only the parameter can produce.
  const tight = await rpc('get_reports', adminU.token, { p_low_stock_threshold: LOW, p_expiry_warning_days: 5 })
  const loose = await rpc('get_reports', adminU.token, { p_low_stock_threshold: LOW, p_expiry_warning_days: 3650 })
  check(
    Number(tight.json?.[0]?.expiring) < Number(got.expiring) &&
      Number(loose.json?.[0]?.expiring) > Number(got.expiring),
    'the expiry window is a parameter, not a constant',
    `5d=${tight.json?.[0]?.expiring} ${DAYS}d=${got.expiring} 3650d=${loose.json?.[0]?.expiring}`,
  )
  const hiThreshold = await rpc('get_reports', adminU.token, { p_low_stock_threshold: 50, p_expiry_warning_days: DAYS })
  check(
    Number(hiThreshold.json?.[0]?.low_stock) > Number(got.low_stock),
    'the low-stock threshold is a parameter, not a constant',
    `threshold 10 → ${got.low_stock}, threshold 50 → ${hiThreshold.json?.[0]?.low_stock}`,
  )
  const absurd = await rpc('get_reports', adminU.token, { p_low_stock_threshold: -5, p_expiry_warning_days: -5 })
  check(absurd.status === 200, 'nonsense thresholds give a report rather than an error', `HTTP ${absurd.status}`)

  // ── 3. returns ────────────────────────────────────────────────────────────────────
  head('Returns — ownership, status transitions, notification')
  const ord = (await rows(`select id from public.orders where order_number = ${sqlLit(`${P}-DEL-${stamp}`)}`))[0]
  const good = await rpc('validate_return', customer.token, { p_order_id: ord.id, p_customer_id: customer.id })
  check(good.status === 200, 'the owning customer may validate a return on their own order', `HTTP ${good.status} ${String(good.json?.message ?? '').slice(0, 80)}`)
  const wrongOwner = await rpc('validate_return', customer.token, { p_order_id: ord.id, p_customer_id: stranger.id })
  refused(wrongOwner, 'must match authenticated', 'a customer cannot validate a return naming somebody else')
  const anonValidate = await rpc('validate_return', undefined, { p_order_id: ord.id, p_customer_id: customer.id })
  check(anonValidate.status >= 400, 'a logged-out visitor cannot validate a return', `HTTP ${anonValidate.status}`)

  const ins = await api('/rest/v1/return_requests', {
    method: 'POST',
    token: customer.token,
    prefer: 'return=representation',
    body: {
      order_id: ord.id,
      customer_id: customer.id,
      customer_name: `${P}-Customer`,
      product_name: `${P}-Pill ${stamp}`,
      quantity: 2,
      reason: `${P}-reason`,
    },
  })
  check(ins.status === 201 || ins.status === 200, 'the customer files a return request', `HTTP ${ins.status} ${ins.text.slice(0, 110)}`)
  fix.return = ins.json?.id ?? ins.json?.[0]?.id
  // Asserted rather than assumed: with no id the next dozen checks all address `undefined`
  // and fail in ways that read like product defects.
  check(Boolean(fix.return), 'and the created row has an id to act on', String(fix.return))

  const strangerFile = await api('/rest/v1/return_requests', {
    method: 'POST',
    token: stranger.token,
    body: { order_id: ord.id, customer_id: customer.id, customer_name: 'x', product_name: 'x', quantity: 1, reason: `${P}-nope` },
  })
  check(strangerFile.status === 403, "a stranger cannot file against somebody else's order", `HTTP ${strangerFile.status}`)

  const adminSees = await api('/rest/v1/return_requests?select=id,status&order=created_at.desc&limit=50', { token: adminU.token })
  check(
    (adminSees.json ?? []).some((r) => r.id === fix.return),
    'the admin sees the return in the list the returns screen reads',
  )
  const custSees = await api('/rest/v1/return_requests?select=id&limit=50', { token: customer.token })
  const strangerSees = await api('/rest/v1/return_requests?select=id&limit=50', { token: stranger.token })
  check((custSees.json ?? []).some((r) => r.id === fix.return), 'the customer sees their own return')
  check(!(strangerSees.json ?? []).some((r) => r.id === fix.return), 'a stranger does not see it')

  const approve = await api(`/rest/v1/return_requests?id=eq.${fix.return}`, {
    method: 'PATCH',
    token: adminU.token,
    body: { status: 'APPROVED' },
  })
  check(approve.status === 204 || approve.status === 200, 'the admin approves it', `HTTP ${approve.status} ${approve.text.slice(0, 100)}`)
  // The status code is not the evidence -- a PATCH matching zero rows answers 204 too, so
  // the row is read back and the value checked. Relying on the code here would let an
  // approval that changed nothing pass as a success.
  const approvedStatus = (await api(`/rest/v1/return_requests?id=eq.${fix.return}&select=status`, { token: adminU.token })).json?.[0]?.status
  check(approvedStatus === 'APPROVED', 'and the row really is APPROVED', `status=${approvedStatus}`)
  const afterApprove = await api(`/rest/v1/return_requests?id=eq.${fix.return}&select=status`, { token: customer.token })
  check(afterApprove.json?.[0]?.status === 'APPROVED', 'the customer sees the new status', afterApprove.json?.[0]?.status)
  const notified = await rows(`select count(*)::int n from public.notifications where user_id = '${customer.id}' and title ilike '%return%'`)
  check(Number(notified[0].n) > 0, 'the customer was notified about it', `${notified[0].n} notification(s)`)

  // Asserted on the effect, not on the response. PostgREST answers a PATCH that matched no
  // rows with the same 204 as one that did match, so the first version of this check
  // reported a failure for a stranger who had correctly been refused -- the `using:
  // is_admin()` policy declines quietly. The same trap would have hidden an admin
  // approval that silently did nothing, so the admin's own write is checked by reading
  // the row back too.
  const readStatus = async () =>
    (await api(`/rest/v1/return_requests?id=eq.${fix.return}&select=status`, { token: adminU.token })).json?.[0]?.status

  const strangerApprove = await api(`/rest/v1/return_requests?id=eq.${fix.return}`, {
    method: 'PATCH',
    token: stranger.token,
    body: { status: 'REJECTED' },
  })
  check(
    (await readStatus()) === 'APPROVED',
    "a stranger cannot decide somebody else's return",
    `still ${await readStatus()}; their PATCH answered ${strangerApprove.status}, which is not itself a failure`,
  )

  // ── 4. audit log ──────────────────────────────────────────────────────────────────
  head('Audit log — recent, capped, and carrying the change')
  const audit = await api('/rest/v1/audit_entries?select=*,profiles(name)&order=timestamp.desc&limit=20', { token: adminU.token })
  check(audit.status === 200 && Array.isArray(audit.json), 'the admin reads the audit log', `HTTP ${audit.status}`)
  // Read through `rows()` rather than Number() on the raw text: the Management API answers
  // with a JSON array, so Number('[{"n":20}]') is NaN and the comparison silently failed.
  const cap = (await rows(`select count(*)::int n from public.audit_entries`))[0].n
  check(cap <= 20, 'the table is capped at the limit the screen asks for', `table holds ${cap}`)
  check(
    (audit.json ?? []).length === Math.min(cap, 20),
    'the screen receives the whole capped log, not a truncation of a longer one',
    `rows=${(audit.json ?? []).length} table=${cap}`,
  )
  // The approve above is an UPDATE, so there must be a row carrying both sides of it.
  const returnAudit = (audit.json ?? []).find((e) => e.record_type === 'return_requests' && e.action === 'UPDATE')
  check(Boolean(returnAudit), 'the approval is recorded')
  check(
    Boolean(returnAudit?.old_value) && Boolean(returnAudit?.new_value),
    'the entry carries both the old and the new value',
    `old=${returnAudit?.old_value ? 'yes' : 'no'} new=${returnAudit?.new_value ? 'yes' : 'no'}`,
  )
  const oldStatus = returnAudit?.old_value?.status
  const newStatus = returnAudit?.new_value?.status
  check(
    oldStatus === 'PENDING' && newStatus === 'APPROVED',
    'so the screen can say what actually changed',
    `${oldStatus} → ${newStatus}`,
  )
  // Actor name: a trigger-written row has no actor, and the mapper is meant to render that
  // as "System" rather than a blank line.
  check(
    (audit.json ?? []).every((e) => e.profiles?.name || e.actor_id === null || e.profiles !== null),
    'every entry has a resolvable actor (name, or null for a system action)',
  )
  const customerAudit = await api('/rest/v1/audit_entries?select=id&limit=5', { token: customer.token })
  check(!(customerAudit.json ?? []).length, 'a customer cannot read the audit log', `customer saw ${(customerAudit.json ?? []).length} rows`)
  const anonAudit = await api('/rest/v1/audit_entries?select=id&limit=5', { token: undefined })
  check(!(anonAudit.json ?? []).length, 'a logged-out visitor cannot read the audit log', `anon saw ${(anonAudit.json ?? []).length} rows`)

  // ── 5. the lockdown, as a whole ───────────────────────────────────────────────────
  head('The other definer functions are unreachable from outside')
  // Read fresh rather than trusting the number written at fixture setup. `products.stock`
  // is derived, not authoritative: `trg_inventory_sync_stock` reconciles it against the
  // batch rows, so a check that compared a stored constant with itself would report
  // "unchanged" no matter what happened in between.
  const stockBefore = (await rows(`select stock from public.products where id = '${fix.product}'`))[0].stock
  check(
    stockBefore === 40,
    'the fixture product still holds the stock its batches add up to',
    `declared 40, batches 20+20, products.stock reads ${stockBefore} — a mismatch here means the batch rows no longer drive stock`,
  )
  const notifBefore = (await rows(`select count(*)::int n from public.notifications`))[0].n
  for (const [name, args, label] of [
    ['deduct_inventory_fifo', { p_product_id: fix.product, p_quantity: 1 }, 'destroy stock'],
    ['notify_user', { p_user_id: customer.id, p_title: `${P}-inject`, p_body: 'x' }, 'inject a notification'],
    ['is_admin_email', { p_email: 'icrmahin@gmail.com' }, 'enumerate the administrators'],
  ]) {
    for (const [who, tok] of [
      ['a logged-out visitor', undefined],
      ['a signed-in customer', customer.token],
    ]) {
      const r = await rpc(name, tok, args)
      check(r.status >= 400, `${who} cannot ${label} (${name})`, `HTTP ${r.status} ${String(r.json?.message ?? r.text).slice(0, 70)}`)
    }
  }
  const stockAfter = (await rows(`select stock from public.products where id = '${fix.product}'`))[0].stock
  check(stockAfter === stockBefore, 'no stock was destroyed', `${stockBefore} → ${stockAfter}`)
  const notifAfter = (await rows(`select count(*)::int n from public.notifications`))[0].n
  check(notifAfter === notifBefore, 'no notification was injected', `${notifBefore} → ${notifAfter}`)

  // The whole point of revoking narrowly: the shop must still be browsable without an
  // account. A lockdown that broke this would be worse than the leak.
  const anonProducts = await api('/rest/v1/products?select=id&limit=1', { token: undefined })
  check(anonProducts.status === 200 && (anonProducts.json ?? []).length === 1, 'a logged-out visitor can still browse products', `HTTP ${anonProducts.status}`)
  const anonCategories = await api('/rest/v1/categories?select=id&limit=1', { token: undefined })
  check(anonCategories.status === 200, 'a logged-out visitor can still browse categories', `HTTP ${anonCategories.status}`)

  // create_order still has to work for its actual caller.
  const ownOrder = await rpc('create_order', customer.token, { p_customer_id: customer.id, p_address_id: randomUUID() })
  check(
    ownOrder.status >= 400 && !String(ownOrder.json?.message ?? '').includes('must match authenticated'),
    "create_order still accepts a customer's own id",
    `reached the normal checks: ${String(ownOrder.json?.message).slice(0, 60)}`,
  )
  const otherOrder = await rpc('create_order', customer.token, { p_customer_id: stranger.id, p_address_id: randomUUID() })
  refused(otherOrder, 'must match authenticated', 'create_order refuses an id that is not the caller')
} catch (e) {
  failed += 1
  failures.push(`threw: ${e?.message ?? e}`)
  console.log(`\nTHREW: ${e?.message ?? e}`)
} finally {
  // ── teardown ──────────────────────────────────────────────────────────────────────
  //
  // Two rules learned the hard way here, both by leaving residue in the live database:
  //
  // 1. No `.catch(() => {})`. The first version of this block swallowed every failure, and
  //    a single unmatched pattern then cascaded: a `return_requests` row whose `reason`
  //    read `aa reason` did not match the `aa-%` pattern the sweep used, its
  //    `ON DELETE RESTRICT` foreign key blocked the delete of the orders, that failure was
  //    swallowed too, and the delete of `auth.users` then failed on `orders_customer_id_
  //    fkey` — leaving six test accounts and their orders in the shop with nothing
  //    reported. Silent teardown turns one typo into a database nobody trusts.
  //
  // 2. Rows are found by *ownership* (`customer_id in <test users>`) rather than by
  //    matching a name the test invented. A prefix has to stay in step with every value
  //    that embeds it; a foreign key does not. `clean-test-data.mjs` already works this way
  //    for the same reason, and this suite's `aa-` prefix is registered in its PREFIXES so
  //    an interrupted run is swept by the shared pass at the end of `npm run verify`.
  const TEST_IDS = `(select id from auth.users where email like '%@hibbullah.test')`
  const steps = [
    ['return requests', `delete from public.return_requests where customer_id in ${TEST_IDS} or product_name like '${P}-%'`],
    ['order items', `delete from public.order_items where order_id in (select id from public.orders where customer_id in ${TEST_IDS}) or product_id in (select id from public.products where name like '${P}-%')`],
    ['orders', `delete from public.orders where customer_id in ${TEST_IDS} or order_number like '${P}-%'`],
    ['inventory items', `delete from public.inventory_items where product_id in (select id from public.products where name like '${P}-%')`],
    ['cart items', `delete from public.cart_items where product_id in (select id from public.products where name like '${P}-%') or user_id in ${TEST_IDS}`],
    ['favorites', `delete from public.favorites where user_id in ${TEST_IDS}`],
    ['addresses', `delete from public.addresses where user_id in ${TEST_IDS}`],
    ['notifications', `delete from public.notifications where user_id in ${TEST_IDS} or title like '${P}-%' or body like '${P}-%'`],
    ['products', `delete from public.products where name like '${P}-%'`],
    ['manufacturers', `delete from public.manufacturers where name like '${P}-%'`],
    ['categories', `delete from public.categories where name like '${P}-%' or slug like '${P}-%'`],
    // audit_entries references profiles ON DELETE RESTRICT, so this has to precede the
    // user delete or the users cannot be removed at all.
    ['audit entries', `delete from public.audit_entries where actor_id in ${TEST_IDS} or record_id in (select id from public.return_requests where customer_id in ${TEST_IDS})`],
    ['test auth users', `delete from auth.users where email like '%@hibbullah.test'`],
  ]

  for (const [label, sql] of steps) {
    try {
      await admin(sql)
    } catch (e) {
      // Reported, not thrown: a cleanup problem must not mask the check results, but it
      // does have to be visible, and it fails the run.
      failed += 1
      failures.push(`teardown could not remove ${label}: ${String(e.message).slice(0, 160)}`)
      console.log(`  TEARDOWN FAILED  ${label}: ${String(e.message).slice(0, 160)}`)
    }
  }
  try {
    await revokeTestAdmin()
  } catch (e) {
    failed += 1
    failures.push(`teardown could not restore the admin allowlist: ${String(e.message).slice(0, 160)}`)
    console.log(`  TEARDOWN FAILED  admin allowlist: ${String(e.message).slice(0, 160)}`)
  }

  // The sweeper is the backstop for anything this block missed, and running it here makes
  // the residue visible immediately rather than at the end of a much longer `verify`.
  const residue = await rows(
    `select
       (select count(*) from auth.users where email like '%@hibbullah.test') as users,
       (select count(*) from public.orders where order_number like '${P}-%') as orders,
       (select count(*) from public.products where name like '${P}-%') as products,
       (select count(*) from public.profiles where email like '%@hibbullah.test') as profiles`,
  ).catch((e) => [{ users: '?', orders: '?', products: '?', profiles: '?' }])
  const left = residue[0]
  const clean = left.users === 0 && left.orders === 0 && left.products === 0 && left.profiles === 0
  if (!clean) {
    failed += 1
    failures.push(`residue left behind: ${JSON.stringify(left)}`)
  }
  check(clean, 'the run leaves no test data behind', clean ? 'users, orders, products and profiles all back to zero' : JSON.stringify(left))
}

console.log(failed === 0 ? `\nAll ${passed} checks passed.` : `\n${failed} FAILED of ${passed + failed}:`)
for (const f of failures) console.log(`  · ${f}`)
process.exit(failed === 0 ? 0 : 1)
