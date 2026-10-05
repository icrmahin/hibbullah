#!/usr/bin/env node
/**
 * Batch identifiers, end to end — `B-000123`, and only ever on a new row.
 *
 * The batch number changed shape (20261005020000), and the things that could go wrong
 * with a change like this are not the ones a type-checker sees. An identifier is also a
 * foreign key into stock, orders, expiry and the audit trail; a generator that fires at
 * the wrong moment rewrites history, and a generator that fires twice under concurrency
 * trips `unique_product_batch` and fails a sale.
 *
 * So this walks the three ways a batch row actually gets created — the RPC the product
 * form uses, an admin who typed a number themselves, and the column default behind
 * `updateProduct`'s "reached editing with no batches at all" branch — and then asks the
 * questions that protect what was already there:
 *
 *   · is the identifier short, and never the legacy `BATCH-<uuid>-001`?
 *   · does an admin-supplied number survive untouched?
 *   · are two products ever handed the same value?
 *   · does editing a product leave its batch number alone?
 *   · is every row that existed before this suite exactly as it was afterwards?
 *   · can somebody who is not an admin call the re-declared `create_product`?
 *
 * Fixtures are throwaway and swept in the `finally`; the allowlist is sanitised on the
 * way out by `revokeTestAdmin()`. Nothing that existed before a run is ever deleted.
 *
 * Usage:
 *   set -a && . ./.env && set +a && node supabase/verify-batch-numbers.mjs
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
const PREFIX = `Batch Probe ${stamp}`
const ADMIN = { email: `bn-admin-${stamp}@hibbullah.test`, password: `BnAdmin-${stamp}-Aa1!` }
const CUSTOMER = { email: `bn-cust-${stamp}@hibbullah.test`, password: `BnCust-${stamp}-Aa1!` }
const FIX = { category: randomUUID(), manufacturer: randomUUID() }

/** The shape every newly generated identifier must have: B- followed by digits. */
const SHORT = /^B-\d{6,}$/
/** The legacy shape: 18 characters of uuid. Never acceptable for a NEW row. */
const LEGACY = /^BATCH-[0-9A-F]{8}-\d{3}$/

let step = 0
let failures = 0
const head = (t) => console.log(`\n${t}`)
const check = (cond, m, extra = '') => {
  console.log(`  ${String(++step).padStart(2)}. ${cond ? 'PASS' : 'FAIL'}  ${m}`)
  if (extra) console.log(`        ${extra}`)
  if (!cond) {
    failures += 1
    process.exitCode = 1
  }
  return cond
}

async function admin(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`admin SQL failed: HTTP ${res.status} ${body.slice(0, 500)}`)
  return JSON.parse(body)
}

async function api(path, { method = 'GET', token, body, prefer } = {}) {
  const headers = {
    apikey: PUBLISHABLE,
    Authorization: `Bearer ${token ?? PUBLISHABLE}`,
    'Content-Type': 'application/json',
  }
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* not json */
  }
  return { status: res.status, text, json }
}

/** Named arguments over POST, the way supabase-js does it — never GET /rpc/?p_x=eq.y. */
const rpc = (name, token, args) => api(`/rest/v1/rpc/${name}`, { method: 'POST', token, body: args })

async function signIn(who) {
  const r = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: who.email, password: who.password },
  })
  if (!r.json?.access_token) throw new Error(`sign-in ${who.email}: ${r.text.slice(0, 250)}`)
  return { ...who, id: r.json.user.id, token: r.json.access_token }
}

async function signUp(who) {
  const up = await api('/auth/v1/signup', {
    method: 'POST',
    body: { email: who.email, password: who.password },
  })
  if (up.status !== 200) throw new Error(`signup ${who.email}: ${up.text.slice(0, 250)}`)
  return signIn(who)
}

const sqlLit = (s) => `'${String(s).replaceAll("'", "''")}'`

/** Every batch number in the whole database, with its quantity — read before and after. */
async function snapshotAll() {
  const rows = await admin(
    `select product_id, batch_number, quantity from public.inventory_items order by product_id, batch_number`,
  )
  return rows.map((r) => `${r.product_id}|${r.batch_number}|${r.quantity}`).sort()
}

const createdProductIds = []

/**
 * The exact argument set the medicine form sends. `p_batch_number: null` is the
 * interesting case: the form no longer asks for one, so this is what every product an
 * owner creates now goes through.
 */
function createArgs(name, { stock = 0, batchNumber = null } = {}) {
  return {
    p_id: randomUUID(),
    p_name: name,
    p_brand: 'BnBrand',
    p_generic_name: 'bn-generic',
    p_description: '',
    p_manufacturer_id: FIX.manufacturer,
    p_category_id: FIX.category,
    p_price: 100,
    p_original_price: null,
    p_discount_percent: 0,
    p_cost_price: null,
    p_unit: 'pack',
    p_image_url: null,
    p_secondary_image_url: null,
    p_is_active: true,
    p_is_featured: false,
    p_initial_stock: stock,
    p_batch_number: batchNumber,
    p_expiry_date: null,
  }
}

async function batchesFor(productId) {
  const rows = await admin(
    `select batch_number, quantity from public.inventory_items where product_id = '${productId}' order by batch_number`,
  )
  return rows
}

let adminUser
let customer
let before

try {
  head('Fixtures')
  adminUser = await signUp(ADMIN)
  await grantTestAdmin(ADMIN.email)
  await promoteProfile(adminUser.id)
  // Re-sign in: the custom access token hook bakes the profile role into the JWT, so a
  // token minted before the promotion is not an admin token and create_product would
  // refuse for the wrong reason.
  adminUser = await signIn(ADMIN)
  check(Boolean(adminUser.token), `test admin ready (${adminUser.id.slice(0, 8)})`)

  customer = await signUp(CUSTOMER)
  check(Boolean(customer.token), `customer ready (${customer.id.slice(0, 8)})`)

  await admin(
    `insert into public.categories (id, name, slug) values ('${FIX.category}', ${sqlLit(`Bn Cat ${stamp}`)}, 'bn-cat-${stamp}');
     insert into public.manufacturers (id, name) values ('${FIX.manufacturer}', ${sqlLit(`Bn Maker ${stamp}`)});`,
  )

  before = await snapshotAll()
  check(true, `catalogued ${before.length} pre-existing inventory row(s) to compare against later`)

  // ── the RPC the product form uses ────────────────────────────────────────────
  head('create_product with no batch number (what the form sends)')

  const a = createArgs(`${PREFIX} A`, { stock: 50 })
  createdProductIds.push(a.p_id)
  const made = await rpc('create_product', adminUser.token, a)
  check(made.status === 200, `product created (HTTP ${made.status})`, made.text.slice(0, 200))

  const aBatches = await batchesFor(a.p_id)
  check(aBatches.length === 1, `one batch row was written (${aBatches.length})`, JSON.stringify(aBatches))
  const aNum = aBatches[0]?.batch_number
  check(SHORT.test(aNum ?? ''), `its identifier is the short form: ${aNum}`)
  check(!LEGACY.test(aNum ?? ''), `and is not the legacy uuid form: ${aNum}`)

  // ── an admin who typed a number themselves ───────────────────────────────────
  head('create_product with an admin-supplied batch number')

  const b = createArgs(`${PREFIX} B`, { stock: 20, batchNumber: 'Warehouse Seven' })
  createdProductIds.push(b.p_id)
  const madeB = await rpc('create_product', adminUser.token, b)
  check(madeB.status === 200, `second product created (HTTP ${madeB.status})`, madeB.text.slice(0, 200))
  const bNum = (await batchesFor(b.p_id))[0]?.batch_number
  check(bNum === 'Warehouse Seven', `the number the admin chose is used verbatim: ${bNum}`)

  // ── the column default behind updateProduct's no-batches branch ──────────────
  head('the column default, over PostgREST, with batch_number omitted')

  const c = createArgs(`${PREFIX} C`, { stock: 0 })
  createdProductIds.push(c.p_id)
  await rpc('create_product', adminUser.token, c)
  const empty = await batchesFor(c.p_id)
  check(empty.length === 0, `a product with no stock has no batch yet (${empty.length})`)

  const implicit = await api('/rest/v1/inventory_items', {
    method: 'POST',
    token: adminUser.token,
    prefer: 'return=representation',
    body: { product_id: c.p_id, quantity: 10, expiry_date: null },
  })
  const cNum = implicit.json?.[0]?.batch_number
  check(
    implicit.status === 201 && SHORT.test(cNum ?? ''),
    `omitting the column still yields a short identifier: ${cNum}`,
    implicit.text.slice(0, 200),
  )

  // ── uniqueness, across products created back to back ─────────────────────────
  head('uniqueness across products created back to back')

  const made_ = []
  for (let i = 0; i < 6; i++) {
    const args = createArgs(`${PREFIX} U${i}`, { stock: 5 })
    createdProductIds.push(args.p_id)
    const res = await rpc('create_product', adminUser.token, args)
    if (res.status !== 200) check(false, `create_product #${i} failed`, res.text.slice(0, 200))
    const n = (await batchesFor(args.p_id))[0]?.batch_number
    if (n) made_.push(n)
  }
  const unique = new Set(made_)
  check(made_.length === 6, `six products each got a batch (${made_.length})`, JSON.stringify(made_))
  check(unique.size === made_.length, `all six identifiers are distinct`, JSON.stringify(made_))

  // ── an identifier is assigned once, then stays ───────────────────────────────
  head('editing a product does not regenerate its batch number')

  const beforeEdit = (await batchesFor(a.p_id))[0]?.batch_number
  const edit = await api(`/rest/v1/products?id=eq.${a.p_id}`, {
    method: 'PATCH',
    token: adminUser.token,
    body: { price: 115, updated_at: new Date().toISOString() },
  })
  check(edit.status === 204 || edit.status === 200, `the edit was accepted (HTTP ${edit.status})`, edit.text.slice(0, 160))
  const afterEdit = (await batchesFor(a.p_id))[0]?.batch_number
  check(
    beforeEdit === afterEdit,
    `the identifier survived the edit: ${beforeEdit} -> ${afterEdit}`,
  )

  // ── what was there before is still exactly as it was ─────────────────────────
  head('pre-existing rows are untouched')

  const after = await snapshotAll()
  const beforeSet = new Set(before)
  const vanished = before.filter((row) => !after.includes(row))
  check(vanished.length === 0, `no pre-existing row was rewritten, removed or re-quantitied (${vanished.length} changed)`, vanished.join(' | '))

  const ourProducts = new Set(createdProductIds)
  const strangers = after.filter((row) => !beforeSet.has(row) && !ourProducts.has(row.split('|')[0]))
  check(strangers.length === 0, `and nothing we did not create appeared (${strangers.length})`, strangers.join(' | '))

  const legacyStillPresent = after.some((row) => LEGACY.test(row.split('|')[1]))
  console.log(
    `        note: legacy BATCH- identifiers still present and still valid: ${legacyStillPresent ? 'yes' : 'none in this project'}`,
  )

  // ── the re-declared RPC still refuses non-admins ─────────────────────────────
  head('create_product is still admin-only')

  const stranger = await rpc('create_product', customer.token, createArgs(`${PREFIX} Rogue`, { stock: 1 }))
  const message = String(stranger.json?.message ?? stranger.text ?? '')
  check(
    stranger.status >= 400 && message.includes('not authorized'),
    `a customer calling it is refused for the stated reason (HTTP ${stranger.status})`,
    message.slice(0, 200),
  )
} catch (error) {
  console.error(`\nERROR: ${error.message}`)
  process.exitCode = 1
} finally {
  head('Cleanup')
  try {
    await revokeTestAdmin()
    if (createdProductIds.length) {
      await admin(
        `delete from public.inventory_items where product_id in (${createdProductIds.map((id) => `'${id}'`).join(',')});
         delete from public.products where id in (${createdProductIds.map((id) => `'${id}'`).join(',')});`,
      )
    }
    await admin(
      `delete from public.categories where name like 'Bn Cat %';
       delete from public.manufacturers where name like 'Bn Maker %';
       delete from auth.users where email like 'bn-admin-%@hibbullah.test' or email like 'bn-cust-%@hibbullah.test';`,
    )
    const finalSnapshot = await snapshotAll()
    const base = before ?? []
    const lost = base.filter((row) => !finalSnapshot.includes(row))
    check(
      createdProductIds.length > 0 ? lost.length === 0 : true,
      `after cleanup the ${base.length} pre-existing row(s) are still exactly as found (${lost.length} missing)`,
      lost.join(' | '),
    )
    console.log('  fixtures removed; the allowlist is back to the real admins.')
  } catch (e) {
    console.error(`  !! cleanup failed: ${e.message.slice(0, 300)}`)
  }
  console.log(failures === 0 ? `\n=== ALL ${step} CHECKS PASSED ===` : `\n=== ${failures} of ${step} CHECKS FAILED ===`)
}
