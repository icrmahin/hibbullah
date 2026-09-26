/**
 * The hosted bootstrap and the migrations must not drift.
 *
 * `apply-to-hibbullah-hosted.sql` is what a fresh project is created from, while
 * `migrations/` is what the live project runs. A fix that lands in one and not the other
 * means a rebuilt environment quietly behaves differently from the one being tested, and the
 * difference only shows up much later.
 *
 * ── Why this walks every migration rather than a chosen few ─────────────────────────
 * The first version of this check compared a hand-picked list of objects from the one
 * migration that happened to be most recent. It passed while two later migrations -- the
 * create_order address guards and the single-source admin allowlist -- were entirely absent
 * from the bootstrap, so a rebuilt project would have accepted address-less orders and
 * carried six copies of the admin allowlist again. A check that only looks at what someone
 * remembered to list is a check that will miss the next thing too.
 *
 * So: every `create or replace function` in every migration is compared against the
 * bootstrap, and later migrations win, which is exactly how the migrations compose. A new
 * migration that has not been added to the bootstrap now fails this check with no change
 * here at all.
 *
 * Comparison is on whitespace-normalised SQL with comments stripped, so formatting and
 * comment differences are fine but a changed statement is not.
 */
import { readFileSync, readdirSync } from 'node:fs'

const HOSTED = 'supabase/apply-to-hibbullah-hosted.sql'
const MIGRATIONS_DIR = 'supabase/migrations'

/** Strip comments and collapse whitespace, so only real differences show. */
const norm = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim()

/**
 * Pull `create ... function <name>(...)` bodies out of a SQL string.
 *
 * Scanned rather than matched with a single regex, because the dollar-quote tag is whatever
 * the author wrote -- `$$`, `$fn$`, `$function$` -- and a regex that only knows `$$` silently
 * finds nothing. Not hypothetical: it made every is_admin_email check report "missing" for a
 * function that is present in both files, which is the same class of false negative as the
 * drift this file exists to catch.
 */
function functionBodies(sql) {
  const out = new Map()
  const re = /create\s+or\s+replace\s+function\s+([\w.]+)\s*\(/gi
  for (const m of sql.matchAll(re)) {
    const after = sql.slice(m.index + m[0].length)
    // The body tag is the first dollar-quote after the signature; the argument list and the
    // `returns` / `language` / `security definer` lines contain none.
    const tag = after.match(/\$([a-z_0-9]*)\$/i)
    if (!tag) continue
    const open = `$${tag[1]}$`
    const bodyStart = after.indexOf(open) + open.length
    const bodyEnd = after.indexOf(open, bodyStart)
    if (bodyEnd === -1) continue
    out.set(m[1].toLowerCase(), norm(after.slice(bodyStart, bodyEnd)))
  }
  return out
}

/** Every quoted email address in a SQL string. */
const emailLiterals = (sql) => sql.match(/'[^']+@[^']+'/g) ?? []

/** Pull `create trigger <name>` statements out of a SQL string. */
function triggers(sql) {
  const out = new Map()
  const re = /create\s+trigger\s+([\w]+)[\s\S]*?;/gi
  for (const m of sql.matchAll(re)) out.set(m[1].toLowerCase(), norm(m[0]))
  return out
}

/** Pull `create policy "<name>"` blocks out of a SQL string. */
function policies(sql) {
  const out = new Map()
  const re = /create\s+policy\s+"([^"]+)"([\s\S]*?);/gi
  for (const m of sql.matchAll(re)) out.set(m[1].toLowerCase(), norm(m[2]))
  return out
}

/** Merge definitions from several files; later files win, as migrations do. */
function merged(parts, extract) {
  const out = new Map()
  for (const sql of parts) for (const [k, v] of extract(sql)) out.set(k, v)
  return out
}

const hosted = readFileSync(HOSTED, 'utf8')

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort() // zero-padded timestamps sort lexicographically, which is also chronologically
const migrations = migrationFiles.map((f) => ({ f, sql: readFileSync(`${MIGRATIONS_DIR}/${f}`, 'utf8') }))

let problems = 0
const report = (ok, msg, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (extra) console.log(`        ${extra}`)
  if (!ok) problems += 1
}

console.log(`=== hosted bootstrap vs ${migrationFiles.length} migrations ===\n`)

const hFn = functionBodies(hosted)
const mFn = merged(migrations.map((m) => m.sql), functionBodies)
const missingFn = []
for (const [name, body] of mFn) {
  if (!hFn.has(name)) missingFn.push(name)
  else if (hFn.get(name) !== body) report(false, `function ${name} DIFFERS between the bootstrap and the migrations`)
}
report(missingFn.length === 0, `all ${mFn.size} migrated functions are in the bootstrap${missingFn.length ? ` (missing: ${missingFn.join(', ')})` : ''}`)

const hTr = triggers(hosted)
const mTr = merged(migrations.map((m) => m.sql), triggers)
const missingTr = [...mTr.keys()].filter((n) => !hTr.has(n))
const differingTr = [...mTr.keys()].filter((n) => hTr.has(n) && hTr.get(n) !== mTr.get(n))
for (const n of differingTr) report(false, `trigger ${n} DIFFERS between the bootstrap and the migrations`)
report(missingTr.length === 0, `all ${mTr.size} migrated triggers are in the bootstrap${missingTr.length ? ` (missing: ${missingTr.join(', ')})` : ''}`)

const hPo = policies(hosted)
const mPo = merged(migrations.map((m) => m.sql), policies)
const missingPo = [...mPo.keys()].filter((n) => !hPo.has(n))
const differingPo = [...mPo.keys()].filter((n) => hPo.has(n) && hPo.get(n) !== mPo.get(n))
for (const n of differingPo) report(false, `policy "${n}" DIFFERS between the bootstrap and the migrations`)
report(missingPo.length === 0, `all ${mPo.size} migrated policies are in the bootstrap${missingPo.length ? ` (missing: ${missingPo.join(', ')})` : ''}`)

// ── the allowlist must exist in exactly one place, in both files ────────────────────
// A single-source refactor that only half-landed is the exact drift this file exists to
// catch, so the invariant is asserted on the file text rather than trusted.
for (const [label, sql] of [
  ['bootstrap', hosted],
  ['migrations', migrations.map((m) => m.sql).join('\n')],
]) {
  const bodies = functionBodies(sql)
  const owner = bodies.get('public.is_admin_email')
  report(Boolean(owner), `${label}: the admin allowlist has an owner function (is_admin_email)`)

  // Exactly one function may hold an address: the owner. A second copy is how an admin
  // ends up promoted in some code paths and demoted in others. This is checked per function
  // body rather than with a proximity regex over the file, because "an address appears
  // within N characters of enforce_profile_role" is true of the *owner definition itself*
  // sitting nearby in the same file -- which reads as a failure that is not one.
  const holders = [...bodies.entries()].filter(([, body]) => emailLiterals(body).length > 0).map(([name]) => name)
  report(
    holders.length === 1 && holders[0] === 'public.is_admin_email',
    `${label}: exactly one function holds an address, and it is is_admin_email`,
    holders.length ? `found in: ${holders.join(', ')}` : '',
  )
}

// ── the caps the app depends on ────────────────────────────────────────────────────
const appLimits = readFileSync('src/constants/limits.ts', 'utf8')
const auditCap = Number(appLimits.match(/AUDIT_LOG_LIMIT\s*=\s*(\d+)/)?.[1])
const notifCap = Number(appLimits.match(/NOTIFICATION_LIMIT\s*=\s*(\d+)/)?.[1])
const limitsMigration = readFileSync(`${MIGRATIONS_DIR}/20260926170000_notifications_and_audit_limits.sql`, 'utf8')
report(
  /order by timestamp desc, id desc\s*\n\s*offset 20\b/.test(limitsMigration),
  `audit trim is offset 20 and the app asks for ${auditCap}`,
)
report(
  /order by created_at desc, id desc\s*\n\s*offset 50\b/.test(limitsMigration),
  `notification trim is offset 50 and the app asks for ${notifCap}`,
)
report(
  /delete from public\.audit_entries\s*\nwhere id in \(\s*\n\s*select id from public\.audit_entries order by timestamp desc, id desc offset 20/.test(
    limitsMigration,
  ),
  'the backfill of the audit cap also uses 20',
)

// ── the delivery fee is a literal in two places that must agree ─────────────────────
// create_order hard-codes `v_delivery_fee numeric := 150` and the checkout summary computes
// it in TypeScript. If they drift, the customer is shown one total and charged another, and
// nothing anywhere reports an error -- the order simply looks wrong at delivery time.
const feeInSql = [...hosted.matchAll(/v_delivery_fee\s+numeric\s*:=\s*([\d.]+)/g)].map((m) => Number(m[1]))
const configTs = readFileSync('src/constants/config.ts', 'utf8')
const feeInTs = Number(configTs.match(/deliveryFee\s*:\s*([\d.]+)/)?.[1])
report(
  feeInSql.length > 0 && feeInSql.every((f) => f === feeInTs),
  `the delivery fee agrees: SQL ${[...new Set(feeInSql)].join('/')} vs config.deliveryFee ${feeInTs}`,
)

// ── the guards the live project relies on ──────────────────────────────────────────
const ORDER_MIGRATION = `${MIGRATIONS_DIR}/20260927010000_create_order_require_own_address.sql`
for (const [file, label] of [
  [HOSTED, 'bootstrap'],
  [ORDER_MIGRATION, 'migration'],
]) {
  const sql = readFileSync(file, 'utf8')
  const createOrder = functionBodies(sql).get('public.create_order')
  report(Boolean(createOrder), `${label}: create_order is present`)
  const guards = [
    ['refuses a null address', /raise exception 'Delivery address is required'/i, false],
    ['refuses an unknown address', /raise exception 'Delivery address not found'/i, false],
    ['looks the address up by owner', /where id = p_address_id and user_id = p_customer_id/i, false],
    [
      'no longer coerces a missing address to an empty string',
      /if v_address_text is null then\s*v_address_text := ''/i,
      true,
    ],
  ]
  for (const [why, re, negate] of guards) {
    const matched = re.test(createOrder ?? '')
    report(negate ? !matched : matched, `${label}: create_order ${why}`)
  }
}

const ALLOWLIST_MIGRATION = `${MIGRATIONS_DIR}/20260927020000_admin_allowlist_single_source_and_return_rls.sql`
for (const [file, label] of [
  [HOSTED, 'bootstrap'],
  [ALLOWLIST_MIGRATION, 'migration'],
]) {
  const sql = readFileSync(file, 'utf8')
  const policy = policies(sql).get('customers can create returns')
  report(Boolean(policy), `${label}: the return INSERT policy is present`)
  report(
    /o\.customer_id = return_requests\.customer_id/.test(policy ?? ''),
    `${label}: and it requires the order to belong to the customer filing it`,
  )
  report(
    /o\.status = 'DELIVERED'/.test(policy ?? ''),
    `${label}: and requires the order to be delivered`,
  )
  for (const fn of [
    'public.is_admin',
    'public.handle_new_user',
    'public.sync_profile_on_email_change',
    'public.custom_access_token_hook',
    'public.enforce_profile_role',
  ]) {
    const body = functionBodies(sql).get(fn)
    report(
      Boolean(body) && /is_admin_email\s*\(/.test(body),
      `${label}: ${fn} delegates its admin decision to is_admin_email`,
    )
  }
}

// ── the client-side allowlist must match the database ──────────────────────────────
//
// The single-source refactor collapsed six *database* copies into one. It did not remove
// the client copy, and that is the more dangerous half: AuthProvider.tsx keeps an
// ADMIN_EMAILS set that it consults whenever the is_admin() RPC is unreachable, and
// UnifiedAuth.tsx keeps another for the sign-in copy. The RPC is authoritative, so a drift
// between these and is_admin_email() is invisible on a healthy network -- the app behaves
// perfectly -- and then locks a real administrator out on precisely the request where the
// RPC fails.
//
// It is also silent in the direction that matters most: adding an administrator to the
// database and forgetting the client does not look like a bug, it looks like the new
// administrator not existing.
//
// So all three lists are compared here, as a set, against the migration that owns them.
const dbAdmins = emailLiterals(
  functionBodies(readFileSync(`${MIGRATIONS_DIR}/20260927030000_add_third_admin.sql`, 'utf8')).get(
    'public.is_admin_email',
  ) ?? '',
)
  .map((e) => e.replace(/'/g, ''))
  .sort()
const same = (a) => a.join('|') === dbAdmins.join('|')

for (const file of ['src/providers/AuthProvider.tsx', 'src/components/auth/UnifiedAuth.tsx']) {
  const set = readFileSync(file, 'utf8').match(/ADMIN_EMAILS\s*=\s*new Set\(\[([\s\S]*?)\]/)
  const client = (set?.[1].match(/['"][^'"]+@[^'"]+['"]/g) ?? []).map((e) => e.replace(/['"]/g, '')).sort()
  report(same(client), `${file} ADMIN_EMAILS matches the database`, `client: ${client.join(', ') || '(not found)'} · db: ${dbAdmins.join(', ') || '(not found)'}`)
}

// Scoped to the array literal, not the whole file. Scanning the module for email-looking
// text also matches its own regex source -- `/'[^']+@[^']+'/g` -- which shows up as the
// nonsense address "]+@[^" and makes a correct list look wrong.
const toolingAdmins = (
  readFileSync('supabase/lib/admin-allowlist.mjs', 'utf8').match(/REAL_ADMINS\s*=\s*\[([\s\S]*?)\]/)?.[1] ??
    ''
)
  .match(/'[^']+@[^']+'/g)
  ?.map((e) => e.replace(/'/g, ''))
  .sort() ?? []
report(
  same(toolingAdmins),
  'the test tooling REAL_ADMINS matches the database',
  // Stale here does not merely fail a test: sanitise() rebuilds is_admin_email() from
  // REAL_ADMINS, so a mismatch deletes a real administrator the next time any probe runs.
  `tooling: ${toolingAdmins.join(', ') || '(not found)'} · db: ${dbAdmins.join(', ') || '(not found)'}`,
)

report(dbAdmins.length === 3, `the allowlist holds exactly 3 administrators`, dbAdmins.join(', '))

console.log(problems === 0 ? '\n=== IN SYNC ===' : `\n=== ${problems} DIFFERENCE(S) ===`)
process.exitCode = problems === 0 ? 0 : 1
