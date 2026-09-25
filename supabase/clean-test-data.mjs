/**
 * Sweep test residue out of the live project.
 *
 * The verification scripts clean up after themselves by id, but a run that fails
 * before it has recorded an id -- or one interrupted mid-teardown -- leaves rows behind.
 * On a shared project those rows are not harmless: a leftover "Out of stock: E2E
 * Paracetamol" notification shows up in the real owner's notification list, and a
 * leftover category turns up in the admin's inline-add dropdown as something they
 * apparently already created.
 *
 * This is a blunt instrument on purpose, and it only ever matches names carrying the
 * test prefixes. Run it after an interrupted verification run, or before handing the
 * project to someone for real use.
 */

const REF = process.env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const MGMT = process.env.HIBBULLAH_SUPABASE_TOKEN

if (!MGMT) {
  console.error('Set HIBBULLAH_SUPABASE_TOKEN first.')
  process.exit(1)
}

const q = async (sql) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`)
  return text.trim()
}

const count = async (label, sql) => {
  const body = await q(sql)
  console.log(`  ${label}: ${body || '0'}`)
  return body
}

console.log('=== before ===')
await count('test auth users', `select count(*) from auth.users where email like '%@hibbullah.test'`)
await count('test products', `select count(*) from public.products where name like 'E2E %' or name like 'Notif %'`)
await count(
  'test categories',
  `select count(*) from public.categories where name like 'E2E %' or name like 'Notif %'`,
)
await count(
  'test manufacturers',
  `select count(*) from public.manufacturers where name like 'E2E %' or name like 'Notif %' or name like 'Notif Maker %'`,
)
await count('test notifications', `select count(*) from public.notifications where title like 'E2E %' or title like 'Out of stock: E2E %' or title like 'Out of stock: Notif %' or body like '%hibbullah.test%'`)
await count('all notifications', `select count(*) from public.notifications`)

console.log('\n=== cleaning ===')
// Children before parents: orders and returns reference products, and audit_entries
// references its actor on delete restrict.
const steps = [
  [
    'return_requests',
    `delete from public.return_requests where product_name like 'Notif %' or product_name like 'E2E %' or customer_name ilike '%Verification User%'`,
  ],
  [
    'order_items of test products',
    `delete from public.order_items where product_id in (select id from public.products where name like 'E2E %' or name like 'Notif %')`,
  ],
  [
    'orders of test users',
    `delete from public.orders where customer_id in (select id from auth.users where email like '%@hibbullah.test') or customer_name ilike '%Verification User%'`,
  ],
  [
    'cart_items of test products',
    `delete from public.cart_items where product_id in (select id from public.products where name like 'E2E %' or name like 'Notif %') or user_id in (select id from auth.users where email like '%@hibbullah.test')`,
  ],
  [
    'inventory_items of test products',
    `delete from public.inventory_items where product_id in (select id from public.products where name like 'E2E %' or name like 'Notif %') or product_id not in (select id from public.products)`,
  ],
  [
    'favorites of test users',
    `delete from public.favorites where user_id in (select id from auth.users where email like '%@hibbullah.test')`,
  ],
  [
    'addresses of test users',
    `delete from public.addresses where user_id in (select id from auth.users where email like '%@hibbullah.test')`,
  ],
  [
    'notifications of test users',
    `delete from public.notifications where user_id in (select id from auth.users where email like '%@hibbullah.test')`,
  ],
  [
    'test-titled notifications belonging to real accounts',
    `delete from public.notifications where title like 'E2E %' or title like 'Notif %' or title like 'Batch %' or title like 'Bulk %' or title like 'Keep me' or title like 'Out of stock: E2E %' or title like 'Out of stock: Notif %' or title = 'Forged' or title = 'Outsider private'`,
  ],
  [
    'audit entries from test actors',
    `delete from public.audit_entries where actor_id in (select id from auth.users where email like '%@hibbullah.test')`,
  ],
  [
    'audit entries about test products',
    `delete from public.audit_entries where record_id in (select id from public.products where name like 'E2E %' or name like 'Notif %')`,
  ],
  [
    'test products',
    `delete from public.products where name like 'E2E %' or name like 'Notif %'`,
  ],
  [
    'test categories',
    `delete from public.categories where name like 'E2E %' or name like 'Notif %' or slug like 'e2e-%' or slug like 'notif-%'`,
  ],
  [
    'test manufacturers',
    `delete from public.manufacturers where name like 'E2E %' or name like 'Notif %' or name ilike '%Sneaky%'`,
  ],
  [
    'test auth users',
    `delete from auth.users where email like '%@hibbullah.test'`,
  ],
]

for (const [label, sql] of steps) {
  try {
    await q(sql)
    console.log(`  removed: ${label}`)
  } catch (error) {
    // One blocked delete must not stop the rest of the sweep, and the reason belongs in
    // the output rather than in a thrown stack trace halfway down the list.
    console.log(`  ! ${label}: ${error.message.slice(0, 160)}`)
    process.exitCode = 1
  }
}

console.log('\n=== after ===')
await count('test auth users', `select count(*) from auth.users where email like '%@hibbullah.test'`)
await count('test products', `select count(*) from public.products where name like 'E2E %' or name like 'Notif %'`)
await count(
  'test categories',
  `select count(*) from public.categories where name like 'E2E %' or name like 'Notif %'`,
)
await count(
  'test manufacturers',
  `select count(*) from public.manufacturers where name like 'E2E %' or name like 'Notif %'`,
)
await count('notifications', `select count(*) from public.notifications`)
await count('products total', `select count(*) from public.products`)
await count('categories total', `select count(*) from public.categories`)
await count('profiles total', `select count(*) from public.profiles`)
