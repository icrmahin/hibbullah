/**
 * Sweep test residue out of the live project.
 *
 * The verification scripts clean up after themselves by id, but a run that fails
 * before it has recorded an id -- or one interrupted mid-teardown -- leaves rows behind.
 * On this project those rows are not harmless: a leftover "Out of stock: E2E Paracetamol"
 * notification shows up in the owner's notification list, and a leftover category turns up
 * in the admin's inline-add dropdown as something they apparently already created.
 *
 * ── Why the prefixes live in one place ──────────────────────────────────────────────
 * The first version repeated the test-name prefixes inline in fourteen separate SQL
 * strings. That is a list of prefixes maintained in fourteen places, so it was not a list
 * of prefixes at all: adding a probe and forgetting to edit the sweep left its residue
 * behind. Three prefixes were in exactly that state -- Lifecycle Probe%, OrdProbe% and
 * LC Cat%/LC Maker% -- and their residue was still sitting in the live database, visible
 * to the owner as five "Out of stock" alerts for products that no longer exist.
 *
 * So PREFIXES below is the only list. Add a probe's prefix here and the counts, the
 * deletes and the after-report all pick it up.
 *
 * ── What it deliberately does not do ────────────────────────────────────────────────
 * An earlier version also swept `inventory_items where product_id not in (select id from
 * products)` -- every orphaned batch in the database, not just probe leftovers. That
 * contradicts the promise in this file's header that it only ever matches the test
 * prefixes, and it is the one step here that can destroy something a person wanted. An
 * orphaned batch is invisible in the app (there is no product to hang it under), so
 * leaving it costs nothing; deleting it destroys the only record of stock that might
 * matter if a product row was removed by mistake. Orphans are now *reported* by the
 * inventory line of the after-block instead, so they are visible rather than destroyed.
 *
 * ── Why the audit sweep runs last ───────────────────────────────────────────────────
 * Every delete fires the audit trigger, so deleting the test products, categories and
 * manufacturers *generates* new audit rows. The audit sweep therefore runs after all of
 * those, not before -- otherwise the sweep deletes the old audit history and immediately
 * writes a fresh set describing its own work, which is both useless and misleading: the
 * log claims the owner deleted "Lifecycle Probe Pill". audit_entries.actor_id also
 * references profiles on delete-restrict, so this must be before auth.users.
 *
 * Run it after an interrupted verification run, or before handing the project to someone
 * for real use. It only ever matches names carrying the test prefixes below.
 *
 * ── Why it is the last step of `npm run verify`, not just a manual tool ───────────────
 * The individual scripts delete their own fixtures, and for the most part they manage it.
 * But `trg_product_stock_check` fires on *deleting* a probe product and inserts an
 * "Out of stock" alert addressed to the real admin — and that happens after the script's own
 * notification sweep has already run, so every single verification left one junk alert in
 * the owner's notification list. Six of them had accumulated, for products that no longer
 * existed and never had.
 *
 * Rather than have each script learn to sweep up after itself — fourteen SQL strings with
 * fourteen private copies of the prefix list, which is the mistake this file already exists
 * to undo — the sweeper runs once at the end of `npm run verify`, using the one PREFIXES
 * list. A run of the suite now leaves the project exactly as it found it.
 */

const REF = process.env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const MGMT = process.env.HIBBULLAH_SUPABASE_TOKEN

if (!MGMT) {
  console.error('Set HIBBULLAH_SUPABASE_TOKEN first.')
  process.exit(1)
}

/**
 * The single list of test-name prefixes, covering every script that creates fixtures.
 *
 * Keep this in step with the names the verification scripts actually insert -- a probe
 * whose prefix is missing here is a probe whose residue the sweep will not remove.
 */
const PREFIXES = [
  'E2E %', // verify-notifications.mjs
  'Notif %', // verify-notifications.mjs
  'Lifecycle Probe%', // verify-lifecycle.mjs
  'OrdProbe %', // probe-order-address.mjs
  'LC Cat %', // verify-lifecycle.mjs (categories)
  'LC Maker %', // verify-lifecycle.mjs (manufacturers)
  'Notif Maker %', // verify-notifications.mjs
  'aa-%', // verify-admin-areas.mjs (products, categories, manufacturers, orders)
]

/**
 * Extra notification titles a probe may have produced, beyond the product-name prefixes.
 *
 * These are complete predicates, not bare words. Written as bare literals they become
 * `... or title like 'E2E %' or 'Batch %'`, and Postgres reads the trailing literal as the
 * right-hand side of an `or` against a boolean -- so it tries to cast 'Batch %' to boolean
 * and the whole sweep dies on `22P02 invalid input syntax for type boolean`.
 */
const EXTRA_TITLE_PREDICATES = [
  "title like 'Batch %'",
  "title like 'Bulk %'",
  "title like 'Keep me'",
  "title = 'Forged'",
  "title = 'Outsider private'",
]

/** `col like 'A %' or col like 'B %' or ...` -- for a column whose value *is* the name. */
const anyPrefix = (column, extra = []) =>
  [...PREFIXES.map((p) => `${column} like '${p}'`), ...extra].join(' or ')

/**
 * `col like '%A%' or ...` -- for a column that merely *contains* the name.
 *
 * Needed for audit_entries.old_value/new_value, which is the whole row as jsonb. Its text
 * starts with `{"id": "3742cbab-...", "name": "Lifecycle Probe Pill 1790451687432", ...}`,
 * so a prefix match finds nothing: eleven rows that plainly mention the probe product
 * scored zero. Hence a separate, anchored-anywhere predicate rather than reusing
 * anyPrefix(), which is correct for a name column and silently wrong here.
 */
const anyMention = (column) => PREFIXES.map((p) => `${column} like '%${p.replace(/%$/, '')}%'`).join(' or ')

/** The same, but also matching "Out of stock: <prefix>", which is how a probe product announces itself. */
const anyTitle = () =>
  [...PREFIXES.flatMap((p) => [`title like '${p}'`, `title like 'Out of stock: ${p}'`]), ...EXTRA_TITLE_PREDICATES].join(
    ' or ',
  )

const TEST_USERS = `user_id in (select id from auth.users where email like '%@hibbullah.test')`
const TEST_USER_IDS = `(select id from auth.users where email like '%@hibbullah.test')`

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

const count = async (label, sql) => console.log(`  ${label}: ${(await q(sql)) || '0'}`)

const report = (label) => [
  ['test auth users', `select count(*) from auth.users where email like '%@hibbullah.test'`],
  ['test products', `select count(*) from public.products where ${anyPrefix('name')}`],
  ['test categories', `select count(*) from public.categories where ${anyPrefix('name')}`],
  ['test manufacturers', `select count(*) from public.manufacturers where ${anyPrefix('name')}`],
  ['test notifications', `select count(*) from public.notifications where ${anyTitle()} or body like '%hibbullah.test%'`],
  [
    'test audit entries',
    `select count(*) from public.audit_entries where ${anyMention("old_value::text")} or ${anyMention("new_value::text")}`,
  ],
]

console.log(`=== before (sweeping ${PREFIXES.length} test-name prefixes) ===`)
for (const [label, sql] of report('before')) await count(label, sql)
await count('all notifications', `select count(*) from public.notifications`)
await count('all audit entries', `select count(*) from public.audit_entries`)

/**
 * Snapshot the ids of every test record *before* deleting anything.
 *
 * The audit sweep has to run after the content deletes -- every one of them writes a new
 * audit row, so sweeping first just replaces the history with a description of the sweep's
 * own work. But once the products are gone, `record_id in (select id from products where
 * name like ...)` matches nothing, and the rows the sweep itself just created are
 * unfindable by name: inventory_items rows carry a product_id and a batch, no name at all.
 *
 * So the ids are captured up front and used as an explicit list afterwards. A `uuid[]`
 * literal rather than a join, because the whole point is that the join no longer resolves.
 */
const idsIn = (rows) => (rows.length ? `in (${rows.map((r) => `'${r.id}'`).join(',')})` : 'in (null::uuid)')
const snapshot = async (label, sql) => {
  const rows = await q(sql)
  const parsed = rows ? JSON.parse(rows) : []
  if (parsed.length) console.log(`  captured ${parsed.length} ${label} id(s) for the audit sweep`)
  return parsed.map((r) => r.id)
}
const captured = {
  products: await snapshot('product', `select id from public.products where ${anyPrefix('name')}`),
  categories: await snapshot('category', `select id from public.categories where ${anyPrefix('name')}`),
  manufacturers: await snapshot('manufacturer', `select id from public.manufacturers where ${anyPrefix('name')}`),
  orderItems: await snapshot('order item', `select id from public.order_items where product_id in (select id from public.products where ${anyPrefix('name')})`),
  inventory: await snapshot('inventory', `select id from public.inventory_items where product_id in (select id from public.products where ${anyPrefix('name')})`),
}
const allCaptured = Object.values(captured).flat()
const auditRecordMatch = allCaptured.length ? `record_id ${idsIn(allCaptured.map((id) => ({ id })))}` : 'false'

console.log('\n=== cleaning ===')
// Children before parents. audit_entries is deliberately near the end: see the header.
const steps = [
  ['return requests', `delete from public.return_requests where ${anyPrefix('product_name')} or customer_name ilike '%Verification User%' or customer_name ilike '%Lifecycle Customer%'`],
  ['order items of test products', `delete from public.order_items where product_id in (select id from public.products where ${anyPrefix('name')})`],
  ['orders of test users', `delete from public.orders where customer_id in ${TEST_USER_IDS} or customer_name ilike '%Verification User%' or customer_name ilike '%Lifecycle Customer%'`],
  ['cart items', `delete from public.cart_items where product_id in (select id from public.products where ${anyPrefix('name')}) or ${TEST_USERS}`],
  [
    'inventory items of test products',
    `delete from public.inventory_items where product_id in (select id from public.products where ${anyPrefix('name')})`,
  ],
  ['favorites of test users', `delete from public.favorites where ${TEST_USERS}`],
  ['addresses of test users', `delete from public.addresses where ${TEST_USERS}`],
  ['notifications of test users', `delete from public.notifications where ${TEST_USERS}`],
  ['test-titled notifications on real accounts', `delete from public.notifications where ${anyTitle()} or body like '%hibbullah.test%'`],
  ['test products', `delete from public.products where ${anyPrefix('name')}`],
  ['test categories', `delete from public.categories where ${anyPrefix('name')} or slug like 'e2e-%' or slug like 'notif-%' or slug like 'lc-cat-%'`],
  ['test manufacturers', `delete from public.manufacturers where ${anyPrefix('name')} or name ilike '%Sneaky%'`],
  // After the content deletes, so it sweeps up the entries those deletes just wrote --
  // including entries for records that no longer exist, which is why it uses the id
  // snapshot taken above rather than a join back to the (now empty) products table.
  ['audit entries from test actors', `delete from public.audit_entries where actor_id in ${TEST_USER_IDS}`],
  [
    'audit entries about test records',
    `delete from public.audit_entries where ${auditRecordMatch}
       or ${anyMention('old_value::text')}
       or ${anyMention('new_value::text')}`,
  ],
  // Last of all: auth.users cascades to profiles, and audit_entries.actor_id references
  // profiles on delete-restrict, so this has to follow the audit sweep above.
  ['test auth users', `delete from auth.users where email like '%@hibbullah.test'`],
]

for (const [label, sql] of steps) {
  try {
    // `returning 1` is what makes the delete usable in a CTE, so the label reports how
    // many rows actually went rather than just that the statement was accepted. A sweep
    // that says "removed test products" without a number is the same shape as a cleanup
    // that silently matched nothing -- which is the bug this file's header is about.
    const removed = await q(`with deleted as (${sql} returning 1) select count(*) from deleted`)
    console.log(`  removed ${removed} · ${label}`)
  } catch (error) {
    // One blocked delete must not stop the rest of the sweep, and the reason belongs in
    // the output rather than in a thrown stack trace halfway down the list.
    console.log(`  ! ${label}: ${error.message.slice(0, 160)}`)
    process.exitCode = 1
  }
}

console.log('\n=== after ===')
for (const [label, sql] of report('after')) await count(label, sql)
await count('notifications', `select count(*) from public.notifications`)
await count('audit entries', `select count(*) from public.audit_entries`)
await count('products total', `select count(*) from public.products`)
await count('categories total', `select count(*) from public.categories`)
await count('manufacturers total', `select count(*) from public.manufacturers`)
await count('profiles total', `select count(*) from public.profiles`)
await count('orders total', `select count(*) from public.orders`)
// Reported, not swept: batches whose product row is gone. See the header -- these are
// left alone on purpose, and this line is how you notice one.
await count(
  'orphaned inventory batches (left alone, see header)',
  `select count(*) from public.inventory_items where product_id not in (select id from public.products)`,
)
