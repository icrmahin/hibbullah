#!/usr/bin/env node
/**
 * End-to-end check of the deployed stack, against the live project.
 *
 * Creates a throwaway customer, promotes it to admin, creates a category,
 * a manufacturer and a product through the real create_product RPC, then reads the
 * product back through browse_products and search_products with the *publishable*
 * key only -- proving RLS, the RPCs and the mapping all agree.
 *
 * Everything it creates is deleted again at the end (--keep leaves it in place).
 *
 * Usage:
 *   HIBBULLAH_SUPABASE_TOKEN=sbp_... node supabase/verify-stack.mjs
 */
import { randomUUID } from 'node:crypto'
import { grantTestAdmin, revokeTestAdmin, promoteProfile } from './lib/admin-allowlist.mjs'
import { env, argv } from 'node:process'

const PROJECT_REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`
const PUBLISHABLE = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const MGMT = env.HIBBULLAH_SUPABASE_TOKEN
const KEEP = argv.includes('--keep')

if (!MGMT) {
  console.error('Set HIBBULLAH_SUPABASE_TOKEN first.')
  process.exit(1)
}

const stamp = Date.now()
const EMAIL = `e2e-${stamp}@hibbullah.test`
const PASSWORD = `E2e-${stamp}-Aa1!`
const PRODUCT_NAME = `E2E Paracetamol 500mg ${stamp}`

let step = 0
const ok = (m) => console.log(`  ${String(++step).padStart(2)}. PASS  ${m}`)
const fail = (m) => {
  console.log(`  ${String(++step).padStart(2)}. FAIL  ${m}`)
  process.exitCode = 1
}
const check = (cond, m) => (cond ? ok(m) : fail(m))

/** Management API: bypasses RLS, for setup and teardown only. */
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

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${token ?? PUBLISHABLE}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, text: await res.text() }
}

const created = { userId: null, shopperId: null, outsiderId: null, categoryId: null, manufacturerId: null, productId: null }

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
    console.log('\n--keep: leaving the test data in place.')
    return
  }
  console.log('\nCleaning up test data...')
  if (created.productId) await admin(`delete from public.inventory_items where product_id = '${created.productId}'`)
  if (created.productId) await admin(`delete from public.products where id = '${created.productId}'`)
  if (created.categoryId) await admin(`delete from public.categories where id = '${created.categoryId}'`)
  if (created.manufacturerId) await admin(`delete from public.manufacturers where id = '${created.manufacturerId}'`)
  // Also sweep anything the category/manufacturer section managed to create.
  await admin(
    `delete from public.categories where name like 'E2E Cat%';
     delete from public.manufacturers where name ilike 'E2E Maker%' or name ilike 'E2E NewMaker%' or name ilike 'E2E Sneaky%';`,
  )
  for (const id of [created.shopperId, created.outsiderId, created.userId].filter(Boolean)) {
    await admin(`delete from public.audit_entries where actor_id = '${id}'`)
  }
  for (const id of [created.shopperId, created.outsiderId, created.userId].filter(Boolean)) {
    await admin(`delete from auth.users where id = '${id}'`)
  }
  console.log('  done.')
}

console.log('=== Hibbullah stack verification ===\n')

try {
  // 1. Sign up a throwaway user through the public auth API.
  const signUp = await api('/auth/v1/signup', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  })
  check(signUp.status === 200 || signUp.status === 201, `signup via public auth API (HTTP ${signUp.status})`)

  // Sign in to get a real access token for the admin-scoped calls.
  const signIn = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  })
  const session = JSON.parse(signIn.text)
  const token = session.access_token
  check(Boolean(token), 'signin returns an access token')
  created.userId = session.user?.id
  check(Boolean(created.userId), `user id resolved (${created.userId})`)

  // The signup trigger should have made a customer profile.
  const before = await api('/rest/v1/profiles?select=id,role,phone&limit=1', { token })
  const profile = JSON.parse(before.text)[0]
  check(profile?.role === 'customer', `signup trigger created a customer profile (role=${profile?.role})`)

  // 2. Phone is canonical E.164 in the database. The client (utils/phone.ts via
  //    services/profile.ts) is what converts; the constraint is the backstop, so a
  //    raw local-format write must be refused and the canonical form must be kept.
  const raw = await admin(
    `update public.profiles set phone = '01712345678' where id = '${created.userId}'`,
  ).then(
    () => null,
    (e) => e,
  )
  check(raw !== null, 'database refuses a non-canonical phone (01712345678 rejected)')
  check(
    raw === null || raw.message.includes('profiles_phone_format'),
    `  ...rejected by profiles_phone_format, not something else`,
  )

  // What the client actually sends after normalizeBdPhone('017xxxxxxxx').
  // The digits are derived from the run stamp so repeated runs cannot collide with
  // the unique index on profiles.phone.
  const national = `1${String(stamp).slice(-9).padStart(9, '0')}`
  const canonical = `+880${national}`
  await admin(
    `update public.profiles set phone = '${canonical}' where id = '${created.userId}'`,
  )
  const phone = JSON.parse(
    (await api(`/rest/v1/profiles?select=phone&id=eq.${created.userId}`, { token })).text,
  )[0]
  check(phone?.phone === canonical, `canonical phone stored and read back (${phone?.phone})`)

  // Same human number, the other spelling, must collide rather than create a
  // second profile -- that was the whole point of the migration.
  const dup = randomUUID()
  await admin(
    `insert into auth.users (id, email, phone, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
     values ('${dup}', 'e2e-dup-${stamp}@hibbullah.test', '${canonical}', '', now(), now(), now(), '{}', '{}')`,
  )
  const dupPhone = await admin(
    `update public.profiles set phone = '880${national}' where id = '${dup}'`,
  ).then(
    () => 'accepted',
    (e) => e.message,
  )
  check(
    typeof dupPhone === 'string' && dupPhone.includes('profiles_phone_format'),
    'the "+880" and "880" spellings cannot both be stored (canonical collapse)',
  )
  await admin(`delete from public.profiles where id = '${dup}'`)
  await admin(`delete from auth.users where id = '${dup}'`)

  // 3. Grant admin for the duration of the test.
  //
  //    Neither profiles.role nor an UPDATE can grant admin: is_admin() is an email
  //    allowlist over auth.users, and trg_profiles_enforce_role rewrites profiles.role
  //    from its own copy of that list on every insert and update. So the test email is
  //    added to both, and revoked in cleanup().
  await grantTestAdmin(EMAIL)
  await promoteProfile(created.userId)
  const promoted = JSON.parse(
    (await api(`/rest/v1/profiles?select=role&id=eq.${created.userId}`, { token })).text,
  )[0]
  check(
    promoted?.role === 'admin',
    `email allowlist promotes the profile to admin on next write (role=${promoted?.role})`,
  )

  // 4. Create the category and manufacturer the product needs. categories.slug is
  //    NOT NULL with no default, so it must be supplied.
  created.categoryId = randomUUID()
  created.manufacturerId = randomUUID()
  await admin(
    `insert into public.categories (id, name, slug) values ('${created.categoryId}', 'E2E Category ${stamp}', 'e2e-category-${stamp}')`,
  )
  await admin(
    `insert into public.manufacturers (id, name) values ('${created.manufacturerId}', 'E2E Maker ${stamp}')`,
  )
  check(true, 'category and manufacturer rows created')

  // 5. create_product RPC, as a real admin, with stock so the batch insert runs too.
  created.productId = randomUUID()
  const create = await api('/rest/v1/rpc/create_product', {
    method: 'POST',
    token,
    body: {
      p_id: created.productId,
      p_name: PRODUCT_NAME,
      p_brand: 'E2EBrand',
      p_generic_name: 'Paracetamol',
      p_manufacturer_id: created.manufacturerId,
      p_category_id: created.categoryId,
      p_price: 25.5,
      p_description: 'end to end verification product',
      // A discount is only meaningful against an original price; the column check
      // enforces the pairing, so send both.
      p_original_price: 30,
      p_discount_percent: 15,
      p_unit: 'pack',
      p_is_active: true,
      p_initial_stock: 40,
      p_expiry_date: '2027-12-31',
    },
  })
  check(create.status === 200, `create_product RPC succeeded (HTTP ${create.status}) ${create.status !== 200 ? create.text.slice(0, 200) : ''}`)

  // 6. stock must be maintained by the inventory trigger, not written by the RPC.
  const row = JSON.parse(
    (await api(`/rest/v1/products?select=id,name,price,discount_percent,stock&limit=1&id=eq.${created.productId}`, {})).text,
  )[0]
  check(row?.stock === 40, `stock synced to ${row?.stock} by trg_inventory_sync_stock`)
  check(Number(row?.price) === 25.5, `price round-trips as numeric (${row?.price})`)

  // 7. browse_products, anonymous. security invoker, so RLS must let it through.
  const browse = await api('/rest/v1/rpc/browse_products', { method: 'POST', body: { p_limit: 200 } })
  const browsed = JSON.parse(browse.text)
  check(
    Array.isArray(browsed) && browsed.some((p) => p.id === created.productId),
    `browse_products returns the new product (${Array.isArray(browsed) ? browsed.length : '?'} rows)`,
  )
  const browsedRow = Array.isArray(browsed) ? browsed.find((p) => p.id === created.productId) : null
  check(
    browsedRow?.category_name === `E2E Category ${stamp}`,
    `browse_products joins category_name (${browsedRow?.category_name})`,
  )
  check(
    browsedRow?.manufacturer_name === `E2E Maker ${stamp}`,
    `browse_products joins manufacturer_name (${browsedRow?.manufacturer_name})`,
  )

  // 8. search_products, anonymous, by generic name.
  const search = await api('/rest/v1/rpc/search_products', {
    method: 'POST',
    body: { p_query: 'Paracetamol', p_limit: 50 },
  })
  const found = JSON.parse(search.text)
  check(
    Array.isArray(found) && found.some((p) => p.id === created.productId),
    `search_products('Paracetamol') finds it (${Array.isArray(found) ? found.length : '?'} rows)`,
  )
  check(
    Array.isArray(found) && Number(found[0]?.total_count) === found.length,
    `search_products returns the exact total for the count label (${found?.[0]?.total_count})`,
  )

  // 9. Search by a unique fragment, to prove trigram ranking is not just prefix luck.
  const unique = await api('/rest/v1/rpc/search_products', {
    method: 'POST',
    body: { p_query: `500mg ${stamp}`, p_limit: 10 },
  })
  const uniqueRows = JSON.parse(unique.text)
  check(
    Array.isArray(uniqueRows) && uniqueRows[0]?.id === created.productId,
    `search_products mid-string fragment ranks the product first`,
  )

  // 10. is_active = false must disappear from the anonymous reads (RLS).
  await admin(`update public.products set is_active = false where id = '${created.productId}'`)
  const hidden = JSON.parse((await api('/rest/v1/rpc/browse_products', { method: 'POST', body: { p_limit: 200 } })).text)
  check(
    Array.isArray(hidden) && !hidden.some((p) => p.id === created.productId),
    'inactive product is hidden from anonymous browse (RLS)',
  )
  const stillAdmin = JSON.parse(
    (await api('/rest/v1/rpc/browse_products', { method: 'POST', token, body: { p_status: 'inactive', p_limit: 200 } })).text,
  )
  check(
    Array.isArray(stillAdmin) && stillAdmin.some((p) => p.id === created.productId),
    'admin can still see it with p_status=inactive',
  )
  await admin(`update public.products set is_active = true where id = '${created.productId}'`)

  // 11. Categories and manufacturers are created inline by the admin from the
  //     product form, so the unique indexes and the admin RLS policy are the whole
  //     contract. These are the exact cases createCategory/createManufacturer branch on.
  const catName = `E2E Cat ${stamp}`
  const catSlug = `e2e-cat-${stamp}`

  const cat1 = await api('/rest/v1/categories', {
    method: 'POST',
    token,
    body: { name: catName, slug: catSlug },
  })
  check(cat1.status === 201, `admin can insert a category (HTTP ${cat1.status})`)

  // Same slug again -> unique violation, which is what the client resolves by lookup.
  const catDup = await api('/rest/v1/categories', {
    method: 'POST',
    token,
    body: { name: catName, slug: catSlug },
  })
  const catDupCode = JSON.parse(catDup.text || '{}').code
  check(catDup.status === 409 && catDupCode === '23505', `duplicate slug is a 23505 the client can catch (HTTP ${catDup.status} ${catDupCode})`)

  // The recovery lookup: same slug, so the client can find and return the existing row.
  const catFound = await api(`/rest/v1/categories?slug=eq.${catSlug}&select=id,name`, { token })
  check(
    JSON.parse(catFound.text).length === 1,
    'the existing category is findable by slug, so the client can resolve the duplicate',
  )

  // A distinct name: step 10 already created "E2E Maker <stamp>".
  const manName = `E2E NewMaker ${stamp}`
  const man1 = await api('/rest/v1/manufacturers', {
    method: 'POST',
    token,
    body: { name: manName, country: 'Bangladesh' },
  })
  check(man1.status === 201, `admin can insert a manufacturer (HTTP ${man1.status})`)

  // The manufacturer index is on lower(btrim(name)), so odd spacing and case collide.
  const manDup = await api('/rest/v1/manufacturers', {
    method: 'POST',
    token,
    body: { name: `  ${manName.toUpperCase()}  ` },
  })
  const manDupCode = JSON.parse(manDup.text || '{}').code
  check(
    manDup.status === 409 && manDupCode === '23505',
    `differently-cased/spaced manufacturer name still collides (HTTP ${manDup.status} ${manDupCode})`,
  )

  // A non-admin must not be able to create these at all. This one signs up through
  // the public API so it has a real password and a real access token -- a row
  // inserted straight into auth.users has no usable password and would only prove
  // that a 401 comes back.
  const outsiderEmail = `e2e-outsider-${stamp}@hibbullah.test`
  await api('/auth/v1/signup', { method: 'POST', body: { email: outsiderEmail, password: PASSWORD } })
  const outsider = JSON.parse(
    (await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: outsiderEmail, password: PASSWORD },
    })).text,
  )
  created.outsiderId = outsider.user?.id
  const shopperToken = outsider.access_token
  check(Boolean(shopperToken), 'signed in a genuine non-admin')
  const outsiderRole = JSON.parse(
    (await api(`/rest/v1/profiles?select=role&id=eq.${created.outsiderId}`, { token: shopperToken })).text,
  )[0]
  check(outsiderRole?.role === 'customer', `that account is a customer, not admin (role=${outsiderRole?.role})`)
  const nonAdminCat = await api('/rest/v1/categories', {
    method: 'POST',
    token: shopperToken,
    body: { name: `E2E Sneaky ${stamp}`, slug: `e2e-sneaky-${stamp}` },
  })
  check(
    nonAdminCat.status === 403,
    `non-admin cannot insert a category (HTTP ${nonAdminCat.status} ${JSON.parse(nonAdminCat.text || '{}').code ?? ''})`,
  )
  const nonAdminMan = await api('/rest/v1/manufacturers', {
    method: 'POST',
    token: shopperToken,
    body: { name: `E2E Sneaky ${stamp}` },
  })
  check(
    nonAdminMan.status === 403,
    `non-admin cannot insert a manufacturer (HTTP ${nonAdminMan.status})`,
  )
  // And nothing was written by the refused attempts.
  const sneaked = await api(`/rest/v1/categories?slug=eq.e2e-sneaky-${stamp}&select=id`, { token })
  check(JSON.parse(sneaked.text).length === 0, 'the refused inserts wrote nothing')

  // 12. get_customers_with_stats must expose avatar_url now. It filters role =
  //     'customer', and the test user was promoted to admin in step 9, so a second,
  //     ordinary customer is needed for there to be anything to list.
  const shopper = randomUUID()
  await admin(
    `insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
     values ('${shopper}', 'e2e-shopper-${stamp}@hibbullah.test', '', now(), now(), now(), '{}', '{}')`,
  )
  created.shopperId = shopper
  await admin(`update public.profiles set name = 'E2E Shopper' where id = '${shopper}'`)

  const stats = await api('/rest/v1/rpc/get_customers_with_stats', { method: 'POST', token, body: { p_limit: 5 } })
  const statsRows = JSON.parse(stats.text)
  const shopperRow = Array.isArray(statsRows)
    ? statsRows.find((r) => r.id === shopper)
    : undefined
  check(Boolean(shopperRow), `admin customer list includes the shopper (${statsRows.length} rows)`)
  check(
    Boolean(shopperRow) && 'avatar_url' in shopperRow && shopperRow.avatar_url === null,
    'get_customers_with_stats exposes avatar_url (null until one is uploaded)',
  )
} catch (error) {
  console.error(`\nERROR: ${error.message}`)
  process.exitCode = 1
} finally {
  await cleanup()
}

console.log(process.exitCode ? '\n=== SOME CHECKS FAILED ===' : '\n=== ALL CHECKS PASSED ===')
