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
 * Strip `//` and block comments from TypeScript, preserving line numbers.
 *
 * Scanned rather than matched, because `auth-callback.tsx` contains the string
 * `"hibbullah://auth-callback"` and a slash-slash replace would cut that line in half —
 * silently dropping the real `color: '#666'` a few characters earlier on it. A checker
 * that loses code to its own comment handling reports a clean file.
 *
 * Newlines are kept so a line index still points at the right source line.
 */
function stripTsComments(src) {
  let out = ''
  let i = 0
  let quote = null
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (quote) {
      if (c === '\\') {
        out += c + (d ?? '')
        i += 2
        continue
      }
      if (c === quote) quote = null
      out += c
      i += 1
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      out += c
      i += 1
      continue
    }
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && d === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        // A block comment's newlines are kept so line indices stay aligned.
        if (src[i] === '\n') out += '\n'
        i += 1
      }
      i += 2
      continue
    }
    out += c
    i += 1
  }
  return out
}

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

// ── search_products must be able to search everything it shows ──────────────────────
// The bug this exists for: `search_products` returned a `manufacturer_name` column, and
// never used it in the predicate. `search_products('square')` answered with zero rows on a
// catalogue with a real Square-branded product, and nothing about the function looked
// wrong -- it was `stable`, granted to `anon`, indexed, ranked, and paginated.
//
// The gap is invisible to every check above because they ask "is this function present and
// do the two files agree?", and it answered both. The property that was actually false is
// narrower and checkable: *every field the function returns is a field the user can search
// on*. A function may return a column without matching it -- a label, a joined name for
// display -- but then the column is promising a search that does not exist.
//
// So: each source the function exposes must appear in the *predicate*, not merely in the
// rank expression. Rank only orders rows the predicate already returned, so a field that
// appears in the CASE and not in the WHERE is decoration -- which is precisely how
// `brand` was already half-wired: present in the ladder, reachable only by fuzzy trigram.
const searchBody = mFn.get('public.search_products') ?? ''
const searchCte = searchBody.slice(searchBody.indexOf('matched as ('), searchBody.indexOf('select mt.id'))
const searchRank = searchCte.slice(0, searchCte.indexOf('end as rank'))
const searchWhere = searchCte.slice(searchCte.lastIndexOf('and ('))

// The column a customer would type, the expression the function must match it on, and the
// modes it must be matchable in. `manufacturer_name` is the one that needs translating: the
// search is against `manufacturers.name`, surfaced to the caller as `manufacturer_name`.
//
// Requiring *both* modes, and not merely "the field appears", is the part that matters.
// Prefix-only is a real bug and it shipped once: a brand is only a prefix of its own column,
// so as soon as the product name leads with something else -- "500 mg Zylora" rather than
// "Zylora 500 mg" -- the term stops matching the name and the brand is only reachable by
// trigram, whose 0.3 threshold silently decides whether it is findable.
const SEARCH_SOURCES = [
  ['name', 'p.name', 'the medicine name', ['prefix', 'contains']],
  ['brand', 'p.brand', 'the brand', ['prefix', 'contains']],
  ['generic_name', 'p.generic_name', 'the generic', ['prefix', 'contains']],
  ['manufacturer_name', 'm.name', 'the company', ['prefix', 'contains']],
  // A description is a paragraph. "The start of it" is not a meaning anyone types, so
  // contains-only is the whole specification here rather than an omission.
  ['description', 'p.description', 'the description', ['contains']],
]

/** Escape an expression for use inside a RegExp — `m.name` must not match `mXname`. */
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The two shapes a matchable field can take in the predicate.
 *
 * Written as patterns rather than `includes` so that reformatting the function — a new line
 * break, a space after a comma — does not silently turn a check into a decoration. It has
 * happened: the check that watches `p.brand` was satisfied by a string match that any
 * whitespace change would have stopped matching while still reading as a pass.
 */
const MATCH_MODE = {
  prefix: (expr) =>
    new RegExp(`lower\\(\\s*${reEsc(expr)}\\s*\\)\\s+like\\s+\\(select\\s+pat\\s+from\\s+term\\)\\s*\\|\\|\\s*'%'`),
  contains: (expr) =>
    new RegExp(`${reEsc(expr)}\\s+ilike\\s+'%'\\s*\\|\\|\\s*\\(select\\s+pat\\s+from\\s+term\\)\\s*\\|\\|\\s*'%'`),
}

const neverMatched = []
for (const [col, expr, why, modes] of SEARCH_SOURCES) {
  for (const mode of modes) {
    if (!MATCH_MODE[mode](expr).test(searchWhere)) neverMatched.push(`${col} ${mode} (${why})`)
  }
}
report(
  neverMatched.length === 0,
  'search_products matches every field it returns, by prefix and by contains — medicine, brand, generic, company, description',
  neverMatched.length
    ? `not matched: ${neverMatched.join(', ')}`
    : SEARCH_SOURCES.map(([col, , , modes]) => `${col} (${modes.join('+')})`).join(', '),
)

// And the same fields, in the same two modes, in the ladder. A field that is matched but has
// no rung is ordered as "everything else", which ties a real brand hit with a coincidental
// description hit and leaves `order by rank, name` to break the tie alphabetically.
//
// Per mode, not per field. The first version of this check asked only whether the field
// appeared in the CASE at all, and the mutation suite proved it decorative: `m.name` has
// three rungs — prefix, contains and trigram — so deleting the prefix one left the field
// "ranked" and the check passed while the ladder it was watching had a hole in it.
//
// `description` is the one deliberate exception: it is matched, and it *is* the `else`. It
// gets no rung of its own because a word from a paragraph is the weakest possible signal
// about what someone meant, and giving it a rung above the fuzzy tier would let it outrank
// a brand the customer actually typed. That intent is asserted on the `else` below rather
// than left to the reader's judgement.
const rungs = [...searchRank.matchAll(/when\s+(.*?)\s+then\s+(\d+)/g)].map(([, test, n]) => ({ test, n: Number(n) }))

const missingRungs = SEARCH_SOURCES.filter(([col]) => col !== 'description').flatMap(([col, expr, , modes]) =>
  modes
    .filter((mode) => !rungs.some((r) => MATCH_MODE[mode](expr).test(r.test)))
    .map((mode) => `${col} ${mode}`),
)
report(
  missingRungs.length === 0,
  'search_products ranks every field it matches, by prefix and by contains, so a brand hit outranks a description hit',
  missingRungs.length ? `no rung of their own: ${missingRungs.join(', ')}` : `${rungs.length} rungs, all matched fields covered`,
)

// The ladder has to be monotone in the order it is written. This is the whole ranking
// contract in one property: SQL evaluates the CASE top to bottom and takes the first match,
// so "exact and prefix beats contains beats fuzzy" is not a statement about intent, it is a
// statement about the numbers not going backwards down the list. A rung inserted in the
// wrong place reads perfectly well in a diff and silently inverts the order.
//
// Non-decreasing, not strictly increasing. Ranks 0 and 0 are a deliberate tie: an empty
// query and an exact name match are the same kind of certainty, and there is no reason to
// order one above the other.
const isMonotonic = rungs.every((r, i) => i === 0 || r.n >= rungs[i - 1].n)
report(
  isMonotonic,
  'the ranking ladder never goes backwards, so a more precise match cannot rank below a vaguer one',
  isMonotonic ? rungs.map((r) => r.n).join(' <= ') : `rungs as written: ${rungs.map((r) => r.n).join(', ')}`,
)

// The floor has to be a real rung, and the highest one, or a description match and a fuzzy
// name match would tie and fall through to alphabetical order.
const elseRank = Number(searchRank.match(/else\s+(\d+)/)?.[1])
report(
  Number.isFinite(elseRank) && rungs.every((r) => r.n < elseRank),
  'the description fallback is the weakest rung, so it can never outrank a real name match',
  `rungs 0-${elseRank}, description at ${elseRank}`,
)

// The term is interpolated into a `like` pattern, and the RPC is reachable with the
// publishable key that ships in the bundle. So every `like` must interpolate the *escaped*
// copy of the term, and the raw copy is only ever handed to the trigram operator, which
// takes a literal string and has no metacharacters. Asserted as "no `like` reads the raw
// term" because that is the shape a regression takes: someone adds a new rung and reaches
// for the shorter name.
const rawLike = /like\s+\(select\s+v\s+from\s+term\)/.test(searchWhere)
const escapedLike = /like\s+\(select\s+pat\s+from\s+term\)/.test(searchWhere)
report(
  !rawLike && escapedLike,
  'search_products interpolates only the LIKE-escaped term into its patterns',
  rawLike
    ? 'a `like` reads the raw term, so a caller-supplied % or _ would act as a wildcard'
    : `${(searchWhere.match(/like \(select pat from term\)/g) ?? []).length} escaped pattern(s), raw term reserved for the trigram operator`,
)

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

// ── the delivery fee is a rule implemented twice, and it must agree ──────────────────
// `create_order` decides what the customer is actually charged; the app only *shows* a
// figure. If the two implementations drift, the customer is quoted one total and charged
// another, and nothing anywhere reports an error — the order simply looks wrong when it
// arrives. So the rates, the qualifying district, and the fact that create_order delegates
// to the rule rather than hard-coding a number are all checked here.
//
// The check reads the LAST `create_order` definition, not every one. The bootstrap
// deliberately carries all six historical definitions so a rebuild replays the same
// sequence, and the previous version of this check globbed all of them — which meant it
// kept passing off six superseded copies that hard-code the old flat rate while the live
// function had already moved on. A check that validates dead code is worse than no check,
// because it reports green.
const FEE_MIGRATION = `${MIGRATIONS_DIR}/20260927040000_district_delivery_fee.sql`
const feeSql = readFileSync(FEE_MIGRATION, 'utf8')
const configTs = readFileSync('src/constants/config.ts', 'utf8')
const districtsTs = readFileSync('src/constants/districts.ts', 'utf8')
const feeUtilTs = readFileSync('src/utils/deliveryFee.ts', 'utf8')

/** The single numeric literal inside one of the constant functions. */
const sqlNumber = (name) =>
  Number(
    feeSql.match(new RegExp(`function\\s+public\\.${name}\\s*\\(\\s*\\)[^$]*\\$\\$?\\w*\\$?\\s*select\\s*([\\d.]+)`, 'i'))?.[1],
  )
/** The single quoted literal inside one of the constant functions. */
const sqlText = (name) =>
  feeSql.match(new RegExp(`function\\s+public\\.${name}\\s*\\(\\s*\\)[^$]*\\$\\$?\\w*\\$?\\s*select\\s*'([^']+)'`, 'i'))?.[1]

const sqlInside = sqlNumber('inside_dhaka_delivery_fee')
const sqlOutside = sqlNumber('outside_dhaka_delivery_fee')
const sqlZone = sqlText('inside_dhaka_district')
const tsInside = Number(configTs.match(/insideDhaka\s*:\s*([\d.]+)/)?.[1])
const tsOutside = Number(configTs.match(/outsideDhaka\s*:\s*([\d.]+)/)?.[1])
const tsZone = districtsTs.match(/INSIDE_DHAKA_DISTRICT\s*=\s*"([^"]+)"/)?.[1]

report(
  Number.isFinite(sqlInside) && sqlInside === tsInside && sqlInside === 80,
  `the inside-Dhaka rate agrees: SQL ${sqlInside} = config.deliveryFees.insideDhaka ${tsInside} = 80`,
)
report(
  Number.isFinite(sqlOutside) && sqlOutside === tsOutside && sqlOutside === 150,
  `the outside-Dhaka rate agrees: SQL ${sqlOutside} = config.deliveryFees.outsideDhaka ${tsOutside} = 150`,
)
report(
  Boolean(sqlZone) && sqlZone === tsZone && sqlZone === 'Dhaka',
  `the qualifying district agrees: SQL '${sqlZone}' = INSIDE_DHAKA_DISTRICT '${tsZone}' = 'Dhaka'`,
)
report(
  sqlInside < sqlOutside,
  `the reduced rate is genuinely lower (${sqlInside} < ${sqlOutside})`,
)

// The zone district has to actually exist in the picker, or no customer could ever select
// the district that earns the reduced rate and the cheap tier would be unreachable.
const districtRows = [
  ...districtsTs.matchAll(/\{\s*name:\s*"([^"]+)",\s*bn:\s*"([^"]+)",\s*division:\s*"([^"]+)"/g),
].map((m) => ({ name: m[1], bn: m[2], division: m[3] }))
report(
  districtRows.length === 64,
  `the district picker holds all 64 districts · found ${districtRows.length}`,
)
report(
  new Set(districtRows.map((d) => d.name)).size === districtRows.length,
  'no duplicate district names in the picker',
)
report(
  districtRows.every((d) => d.bn.trim().length > 0),
  'every district carries a Bangla name, so it is findable in either language',
)
report(
  districtRows.some((d) => d.name === sqlZone),
  `'${sqlZone}' is selectable in the district picker`,
)
// Parsed out of the source rather than hard-coded here, so this file cannot be the reason
// the list is wrong -- a check that repeats the value it is verifying proves nothing.
const perDivision = districtRows.reduce((acc, d) => ({ ...acc, [d.division]: (acc[d.division] ?? 0) + 1 }), {})
report(
  Object.values(perDivision).reduce((a, b) => a + b, 0) === 64 && Object.keys(perDivision).length === 8,
  `the 64 districts span 8 divisions · ${JSON.stringify(perDivision)}`,
)

// The live create_order must compute the fee, not carry a literal. Matched against a
// comment-stripped copy: the migration explains the old `coalesce(v_existing_delivery_fee,
// ...)` expression in prose precisely because it was the bug, and a raw-text search finds
// that explanation and concludes the bug is still there.
const liveCreateOrder = feeSql.slice(feeSql.indexOf('create or replace function public.create_order'))
const liveCode = liveCreateOrder.replace(/--[^\n]*/g, '')
report(
  /v_delivery_fee\s*:=\s*public\.delivery_fee_for_district\s*\(/.test(liveCode),
  'create_order prices delivery by calling delivery_fee_for_district',
)
report(
  !/v_delivery_fee\s+numeric\s*:=\s*\d/.test(liveCode),
  'create_order no longer hard-codes a delivery fee literal',
)
// Repricing on the append path. Carrying the old fee forward is invisible until a customer
// switches address zones mid-order, at which point they are charged a rate they were never
// quoted and nothing in the app reports it.
report(
  /coalesce\s*\(\s*v_existing_delivery_fee\s*,/.test(liveCode) === false,
  'the append path reprices instead of carrying the old fee forward',
)
report(
  /set\s+subtotal\s*=\s*v_subtotal\s*,\s*delivery_fee\s*=\s*v_delivery_fee/.test(liveCode),
  'the append path writes the recomputed fee onto the order row',
)
// The default must be the higher rate, so an unrecognised district cannot undercharge.
const feeRule = feeSql.slice(
  feeSql.indexOf('create or replace function public.delivery_fee_for_district'),
  feeSql.indexOf('comment on function public.delivery_fee_for_district'),
)
report(
  /else\s+public\.outside_dhaka_delivery_fee\s*\(\s*\)/.test(feeRule) &&
    /coalesce\s*\(\s*p_district\s*,\s*''\s*\)/.test(feeRule),
  'an unrecognised or missing district falls to the standard rate, never the reduced one',
)

// The client-side helper must read the config rather than embed its own numbers, or adding
// a third zone would silently update one side only.
report(
  /deliveryFees\.insideDhaka/.test(feeUtilTs) &&
    /deliveryFees\.outsideDhaka/.test(feeUtilTs) &&
    !/\b(?:80|150)\b/.test(feeUtilTs.replace(/^\s*\*.*$/gm, '')),
  'src/utils/deliveryFee.ts reads both rates from config instead of embedding them',
)
// The checkout total is what the customer commits to, so it must be priced from the chosen
// address rather than reused from the cart page, which has no address to price from.
const checkoutTs = readFileSync('src/app/(customer)/checkout.tsx', 'utf8')
report(
  /deliveryFeeForDistrict\(selectedAddress\?\.county\)/.test(checkoutTs),
  'checkout prices the delivery fee from the selected address district',
)
report(
  !/formatCurrency\(summary\.deliveryFee\)/.test(checkoutTs),
  'checkout does not show the cart page\'s address-free delivery figure',
)

// ── SECURITY DEFINER functions must not be reachable by a logged-out visitor ─────────
//
// Postgres grants EXECUTE to PUBLIC on a new function by default, so every SECURITY
// DEFINER function created without an explicit GRANT was callable by `anon` — including
// the project's public publishable key, which ships inside the web bundle. A definer
// function runs as its owner and so ignores the RLS on the tables underneath, which made
// the inherited grant a way straight past those policies. Five were exploitable that way
// and all five were confirmed against the live database: the customer list (every name,
// email, phone and lifetime spend), a single customer's stats, stock destruction,
// notification injection into a real account, and an admin-email oracle.
//
// The check is on the migration text, not on a live connection, so it runs in CI and in a
// fresh checkout with no credentials. It is deliberately narrow — asserting "every definer
// function has a guard" would fail on the trigger functions, which cannot be called over
// PostgREST at all, and a check that is permanently red gets ignored.
//
// Two things are asserted instead, because together they are what actually closes the
// hole: a function that reads protected tables must check is_admin() in its body, and a
// helper that no screen calls directly must have had EXECUTE revoked.
const LOCKDOWN_MIGRATION = `${MIGRATIONS_DIR}/20260928010000_secdef_grants_and_guards.sql`
const REPORTS_MIGRATION = `${MIGRATIONS_DIR}/20260928020000_reports_and_customer_spend.sql`

// Functions a screen calls directly, which therefore need an in-body authorisation check
// rather than a revoked grant. Named here instead of derived from the code so that adding
// a screen is a deliberate act: the failure mode of deriving it is a new RPC quietly
// arriving without a guard, which is the bug this section exists to prevent.
const DIRECTLY_CALLED = [
  'public.get_customers_with_stats',
  'public.get_customer_stats',
  'public.get_reports',
  'public.create_order',
  'public.validate_return',
]

// Functions that are only ever reached from inside another definer function or from a
// trigger, and so must be unreachable directly. Owners keep EXECUTE implicitly, which is
// what lets the revoke be total.
const INTERNAL_ONLY = [
  'public.deduct_inventory_fifo',
  'public.notify_user',
  'public.is_admin_email',
  'public.rls_auto_enable',
  // Added with the profit/restock migration. `restock_order_lines` is the sharpest of
  // them: reachable by anybody who can guess an order id, it would put stock back into a
  // batch. It is only ever meant to be called from inside transition_order_status and from
  // the return trigger.
  'public.restock_order_lines',
  'public.approve_return_stock',
  'public.profit_since',
  // Added with the push migration: the only reader of the push-token registry. It runs
  // from a trigger on notifications, so any direct call would be an attempt to read which
  // devices belong to a user whose notifications the caller cannot even write.
  'public.push_notification_to_devices',
]

// The LAST definition of each function across the migration set, for the same reason the
// delivery-fee checks above read only the last create_order: the bootstrap replays every
// historical definition, and globbing all of them would validate superseded copies.
const latestBodies = (() => {
  const out = new Map()
  for (const m of migrations) for (const [k, v] of functionBodies(m.sql)) out.set(k, v)
  return out
})()

/**
 * The migration that last defines each function, as a position in the migration sequence.
 *
 * A revoke is tied to a *signature*, and Postgres treats a function that gained an argument
 * as a different function entirely. So what a revoke has to do is cover a definition that
 * is not newer than itself — a revoke left behind by an earlier signature does not apply to
 * the one that replaced it. Searching every migration's text at once cannot express that,
 * and the mutation suite is what proved it: dropping the `deduct_inventory_fifo` revoke
 * from the lockdown migration still left a passing check, because a later migration
 * happened to contain one for the newer signature.
 *
 * So the rule is ordering, not sameness: a revoke counts only from the defining migration
 * onwards. That is what makes `deduct_inventory_fifo(uuid, integer, uuid)` — created with
 * a third argument while only `(uuid, integer)` had ever been revoked — fail.
 *
 * Note what this does *not* do: it does not parse argument lists, so a revoke in a later
 * file would satisfy a function redefined with a different signature in between. Comparing
 * signatures exactly is possible but brittle — Postgres drops `default` values from
 * identity arguments while the definition text keeps them, so a legitimate `default null`
 * would read as a mismatch. The authoritative per-signature proof is the live grants, which
 * `verify-profit-and-restock.mjs` exercises from anon, from a customer and from an admin.
 *
 * The bootstrap is deliberately excluded: it replays every migration, so it would satisfy
 * any revoke from any function.
 */
const definingIndex = (() => {
  const out = new Map()
  migrations.forEach((m, i) => {
    for (const k of functionBodies(m.sql).keys()) out.set(k, i)
  })
  return out
})()

/** Every migration's text, for the grant assertions below. */
const allMigrationSql = migrations.map((m) => m.sql).join('\n')

for (const fn of DIRECTLY_CALLED) {
  const body = latestBodies.get(fn) ?? ''
  report(
    /if\s+not\s+public\.is_admin\(\)\s+then|if\s+auth\.uid\(\)\s+is\s+distinct\s+from\s+p_customer_id\s+then/.test(
      body,
    ),
    `${fn} authorises its caller in-body (is_admin or own-customer)`,
  )
}

for (const fn of INTERNAL_ONLY) {
  const ident = fn.replace('public.', '')
  // Matched loosely on the name and argument list so the check does not break if an
  // argument gains a default; what it must prove is that a revoke exists and names all
  // three of public/anon/authenticated.
  //
  // Scoped to the defining migration and everything after it, not to the concatenation of
  // all of them. `revoke ... from public` is not enough either, because Supabase's default
  // privileges grant EXECUTE to `authenticated` on every new function at CREATE time — so
  // revoking from PUBLIC alone leaves every signed-in customer able to call it, which is
  // how `restock_order_lines` would have become a way to add stock to any batch.
  //
  // The revokes are read out of the migration text rather than the catalog because this
  // file is a static check that runs with no database credentials.
  // `verify-profit-and-restock.mjs` asserts the same property against the live grants, from
  // anon, a customer and an admin, which is what proves the statement here took effect.
  // A function no migration ever redefines — `rls_auto_enable` is the only one — comes from
  // the bootstrap, and every migration runs after the bootstrap. So the search starts at the
  // first migration and the label says where the definition actually lives, rather than
  // reporting a function that plainly exists as "defined in no migration at all".
  const definedByMigration = definingIndex.has(fn)
  const from = definingIndex.get(fn) ?? 0
  const definedIn = definedByMigration ? migrations[from].f : 'apply-to-hibbullah-hosted.sql (the bootstrap)'
  const pattern = new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${ident}\\s*\\([^)]*\\)[^;]*;`, 'i')
  let cover = null
  for (let i = from; i < migrations.length && !cover; i++) {
    const hit = migrations[i].sql.match(pattern)?.[0]
    if (hit && /from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(hit)) cover = migrations[i].f
  }
  report(
    cover !== null,
    `${fn} is revoked from public, anon and authenticated, in or after the migration that defines it`,
    cover
      ? `defined in ${definedIn}, revoked in ${cover}`
      : `defined in ${definedIn} and never revoked in or after it`,
  )
}

// is_admin is the deliberate exception and must stay executable, because the RLS policies
// on twenty-four tables evaluate it for role `public`. Revoking it would turn every
// anonymous read of products or categories into a permission error rather than an empty
// result, so its openness is load-bearing and is asserted as such.
const isAdminBody = latestBodies.get('public.is_admin') ?? ''
report(
  /auth\.users/.test(isAdminBody) && /is_admin_email/.test(isAdminBody),
  'is_admin is the single admin predicate, delegating to is_admin_email',
)
// is_admin() IS revoked from PUBLIC, in three historical migrations and deliberately: RLS
// policies evaluate as the invoking role, so leaving it open to PUBLIC would expose the
// admin allowlist to a logged-out visitor. `anon` and `authenticated` keep EXECUTE
// explicitly, which is what the twenty-four public policies need — proven live, since
// anonymous reads of products and categories still work.
//
// So the assertion is about the *role* grants, not the absence of a revoke. This is also
// where the first version of this check was wrong twice over: it forbade any revoke
// mentioning is_admin, which the migrations legitimately contain, and its subject was
// ambiguous anyway, because `is_admin()` and `is_admin_email()` differ by one underscore.
const isAdminRevokes = (allMigrationSql.match(/revoke\s+[^;]*?on\s+function\s+public\.is_admin\s*\(\s*\)[^;]*;/gi) ?? [])
report(
  isAdminRevokes.every((r) => /from\s+public\b/i.test(r) && !/from[^;]*\banon\b/i.test(r)),
  'is_admin is never revoked from anon, which the public RLS policies require',
  isAdminRevokes.length ? isAdminRevokes[0].replace(/\s+/g, ' ').slice(0, 110) : 'no revoke of is_admin found',
)

// The lockdown and report RPCs must also be in the bootstrap, or a rebuilt project comes
// up without the guards. The generic "all migrated functions are in the bootstrap" check
// above already covers membership; what is added here is that the *bootstrap* copy is not
// an older, unguarded body — that is the specific way a rebuild would silently lose this.
// The lockdown and report RPCs must also be in the bootstrap, or a rebuilt project comes
// up without the guards. The generic "all migrated functions are in the bootstrap" check
// above already covers membership; what is added here is that the *bootstrap* copy is not
// an older, unguarded body — that is the specific way a rebuild would silently lose this.
//
// Each function is checked only in the files that should define it. get_reports does not
// exist until the reports migration, so expecting it in the lockdown migration would fail
// for a reason that has nothing to do with the property being asserted.
for (const [file, label, expected] of [
  [HOSTED, 'bootstrap', ['public.get_customers_with_stats', 'public.get_reports']],
  [LOCKDOWN_MIGRATION, 'lockdown migration', ['public.get_customers_with_stats', 'public.get_customer_stats', 'public.create_order', 'public.validate_return']],
  [REPORTS_MIGRATION, 'reports migration', ['public.get_reports', 'public.get_customers_with_stats']],
]) {
  const bodies = functionBodies(readFileSync(file, 'utf8'))
  for (const fn of expected) {
    const body = bodies.get(fn)
    report(
      Boolean(body) && /is_admin\(\)|is\s+distinct\s+from\s+p_customer_id/.test(body),
      `${label}: ${fn} is present and authorised in-body`,
    )
  }
}

// The app must ask for its reports through the aggregating RPC rather than reading the
// tables, which is what the RPC exists to stop. Asserted because the regression is
// invisible in review — a `.from('products').select(...)` in a service file reads as
// perfectly ordinary code, and the 4,000-product cost only shows up in production.
const reportsTs = readFileSync('src/services/reports.ts', 'utf8')
report(
  /rpc\(\s*'get_reports'/.test(reportsTs) && !/\.from\('/.test(reportsTs),
  'src/services/reports.ts aggregates through get_reports instead of reading tables',
)
report(
  /config\.lowStockThreshold/.test(reportsTs) && /config\.expiryWarningDays/.test(reportsTs),
  'src/services/reports.ts takes its thresholds from config rather than hard-coding them',
)
// The two windows the app uses for the same question. They were 90 days in the reports
// screen and config.expiryWarningDays (60) everywhere else, so the reports screen and the
// expiry screen disagreed about what "expiring soon" meant.
const expiryScreen = readFileSync('src/app/(admin)/inventory/expiry.tsx', 'utf8')
report(
  !/\b90\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(expiryScreen),
  'the expiry screen no longer hard-codes a 90-day window',
)
report(
  /config\.expiryWarningDays/.test(expiryScreen),
  'the expiry screen reads config.expiryWarningDays',
)

// ── the audit log has to be able to show what changed ──────────────────────────────
//
// `audit_entries` carries `old_value` and `new_value`, the mapper turns them into strings,
// and the type declares the fields -- and the screen rendered none of them, so every entry
// read as "UPDATE · order_items, System, 22:13:10". The data was arriving; only the display
// was missing, which is why nothing about the log looked broken.
//
// These assert the diffing holds up on the shapes the database actually produces, rather
// than merely that the file parses. A change that made it render nothing would be invisible
// in review, because the code still type-checks and the screen still compiles.
const auditDiffTs = readFileSync('src/utils/auditDiff.ts', 'utf8')
const auditScreenTs = readFileSync('src/app/(admin)/audit/index.tsx', 'utf8')
const auditMapperTs = readFileSync('src/lib/mappers.ts', 'utf8')

for (const [why, re] of [
  ['renders a value that is present', /if \(value === null \|\| value === undefined\) return null/],
  ['never returns an empty string for a value it has', /return json\.length > 60/],
  ['compares rendered values so 120 and "120" are not a change', /render\(a\) === render\(b\)/],
  ['parses defensively, so a malformed blob costs detail not the screen', /catch \{\s*return \{\}/],
  ['excludes the row primary key', /IGNORED = new Set\(\['id'\]\)/],
]) {
  report(re.test(auditDiffTs), `src/utils/auditDiff.ts ${why}`)
}

// Matched on the *call*, not on the word appearing anywhere in the file. The first version
// of this matched bare `AuditChange`, which is still present as the component's own
// definition — so deleting the one line that renders it left the check green while the
// screen went back to showing nothing but the action. A guard has to point at the thing it
// is guarding, and the definition of a component is not its use.
report(
  /<AuditChange\s+entry=\{entry\}\s*\/>/.test(auditScreenTs),
  'the audit screen renders the changed fields, not just the action',
)
report(
  /diffAuditValues\(\s*entry\.oldValue\s*,\s*entry\.newValue\s*\)/.test(auditScreenTs),
  'the audit screen diffs the values the mapper actually populated',
)
// The cap must be honest: a card that silently drops fields claims to show the change
// while hiding part of it.
report(
  /hidden\s*>\s*0/.test(auditScreenTs),
  'the audit screen says when it is not showing every changed field',
)
// Both the read and the write are asserted. Matching only the column name passed even when
// the mapper had stopped carrying the values, because the type declaration that documents
// them still named both columns — so the check was satisfied by a comment.
const auditMapperBody = auditMapperTs.slice(auditMapperTs.indexOf('export function mapAuditEntry'))
report(
  /row\.old_value/.test(auditMapperBody) && /row\.new_value/.test(auditMapperBody),
  'mapAuditEntry reads old_value and new_value off the row',
)
// Asserted as "the assigned value derives from the row", not "the key appears". The key is
// present in a mutation that assigns `undefined` to it, which is precisely the regression
// this is here to catch -- a screen that silently loses every diff it used to show.
const derives = (field) => new RegExp(`${field}:\\s*[^,\\n]*${field.replace('Value', '_value')}`)
report(
  derives('oldValue').test(auditMapperBody) && derives('newValue').test(auditMapperBody),
  'mapAuditEntry derives the entry values from the row rather than hard-coding them',
)

// ── a write that changed nothing must not report success ─────────────────────────────
//
// PostgREST answers an UPDATE or DELETE matching no rows with the same 204 as one that
// matched, and supabase-js turns that into a resolved promise with no error. A service
// that only checks `if (error) throw` therefore reports success for a write that changed
// nothing -- indistinguishable from a real one.
//
// This is not theoretical. The admin returns screen approves a return by PATCHing on the
// id behind an `using: is_admin()` policy, so a declined write answers a cheerful 204; and
// the address delete behind the bin button, one of the two bugs reported as "does not
// work", reported success while leaving the address in place.
//
// The four functions below name a single row, where zero affected means the row is gone or
// not the caller's. Bulk writes are deliberately excluded: `clearAllNotifications`
// matching nothing is the outcome the user asked for, and a guard that flagged it would be
// a bug rather than a safety net.
for (const [file, fn] of [
  ['src/services/returns.ts', 'updateReturnStatus'],
  ['src/services/addresses.ts', 'deleteAddress'],
  ['src/services/addresses.ts', 'setDefaultAddress'],
  ['src/services/notifications.ts', 'markNotificationAsRead'],
]) {
  const src = readFileSync(file, 'utf8')
  const start = src.indexOf(`export async function ${fn}(`)
  const body = start === -1 ? '' : src.slice(start, src.indexOf('\n}', start))
  report(
    start !== -1 && /\.select\(/.test(body) && /requireAffected\(/.test(body),
    `${file} ${fn} checks that its write reached a row`,
    start === -1 ? 'the function was not found' : /\.select\(/.test(body) ? 'no requireAffected() call' : 'no .select(), so the write cannot be verified',
  )
}

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

// ── Earning is profit, and stock comes back ─────────────────────────────────────────
//
// Both of these shipped broken in a way that nothing reported. The dashboard's "Earning"
// card was answered by a JavaScript fallback because the RPC's own guard read a JWT claim
// this project has never had, so it raised for every caller; the fallback counted cancelled
// orders as sales and filled a missing cost price in as `unit_price * 0.8`. And cancelling
// an order never returned the deducted units to `inventory_items`, so the stock was gone
// from the shop for good. Approving a return did nothing at all.
//
// Each assertion below names one of those specific defects, because the general statement
// ("the dashboard should be right") is not something a static check can say anything about.
const PROFIT_MIGRATION = `${MIGRATIONS_DIR}/20260930010000_real_profit_and_stock_restore.sql`
const profitSql = readFileSync(PROFIT_MIGRATION, 'utf8')
const profitBodies = functionBodies(profitSql)
const dashboardBody = latestBodies.get('public.get_admin_dashboard_sales') ?? ''
const profitSinceBody = latestBodies.get('public.profit_since') ?? ''
const transitionBody = latestBodies.get('public.transition_order_status') ?? ''
// Comment-stripped copies. The prose in these files quotes the old broken expressions on
// purpose -- `unit_price * 0.8` is named in the comment explaining that it was removed --
// so a raw search finds the explanation and concludes the bug is still there, which is the
// same trap the delivery-fee checks above call out.
const adminTs = readFileSync('src/services/admin.ts', 'utf8').replace(/^\s*\/\*[\s\S]*?\*\//gm, '').replace(/\/\/[^\n]*/g, '')
const returnsTs = readFileSync('src/services/returns.ts', 'utf8')
const errorsTs = readFileSync('src/lib/errors.ts', 'utf8')

// The guard that made the whole thing invisible: it refused every caller, admin included,
// so the fallback was the only thing that ever answered. `auth.jwt() ->> 'role'` is a claim
// this project has no mechanism to produce — the access-token hook is disabled and the hook
// function writes `app_role`, not `role` — so the comparison was always true.
report(
  /if\s+not\s+public\.is_admin\(\)\s+then/.test(dashboardBody),
  'get_admin_dashboard_sales guards on the admin allowlist',
)
report(
  !/auth\.jwt\(\)\s*->>\s*'role'/.test(dashboardBody),
  'get_admin_dashboard_sales no longer reads a role claim the project has never had',
  dashboardBody.match(/auth\.jwt\(\)[^\n]*/)?.[0] ?? '',
)
// Profit counts delivered orders and nothing else. A PENDING order has not been sold, so
// cancelling needs no reversal — the order was never in the figure to begin with.
for (const [label, body] of [
  ['get_admin_dashboard_sales', dashboardBody],
  ['profit_since', profitSinceBody],
]) {
  report(
    /status\s*=\s*'DELIVERED'/.test(body),
    `${label} counts DELIVERED orders only`,
  )
  report(
    !/status\s*<>?\s*'CANCELLED'|status\s*!=\s*'CANCELLED'/.test(body),
    `${label} does not merely exclude CANCELLED and count everything else as sales`,
  )
  // The fabricated margin. `coalesce(cost_price, unit_price * 0.8)` invents a 20% margin for
  // any product the owner has not priced the cost of, and reports it as earnings.
  report(
    !/0\.8/.test(body),
    `${label} never invents a cost price`,
    body.match(/[^\n]*0\.8[^\n]*/)?.[0]?.trim().slice(0, 90) ?? '',
  )
  report(
    /cost_price\s+is\s+not\s+null/.test(body) || /profit_since/.test(body),
    `${label} requires a real cost price and reports the ones that are missing`,
  )
}
// `unpricedItems` is rendered as "N products have no cost price set", and it was
// `count(*) filter (where p.cost_price is null)` — a count of order *lines*. One product
// sold three times inside the window reported as three products, and the card's link went
// to a catalog that could not possibly hold three of them. `unpricedQty` stays a line sum,
// because there the quantity is the point; only the product count is deduplicated.
report(
  /count\(\s*distinct\s+p\.id\s*\)\s+filter/i.test(profitSinceBody),
  'the unpriced figure counts products, not order lines, so the number matches the noun in front of it',
  profitSinceBody
    .split('\n')
    .find((l) => /count\(/.test(l) && /cost_price is null/.test(l))
    ?.trim()
    .slice(0, 80) ?? '',
)
// An approved return comes off at its approval date, so approving one today reduces
// today's figure rather than rewriting last month's.
report(
  /approved_at\s*>=\s*p_since/.test(profitSinceBody) && /approved_at/.test(profitSinceBody),
  'profit_since dates its reversals by when the return was approved',
)

// The same rule on the client, which is where it was still being broken.
//
// The database was fixed first and the client was missed. `createProduct` computed
// `Math.round(price * 0.8 * 100) / 100` for any product whose cost box was left empty, on
// the reasonable-sounding grounds that pharmacies run on a 20% margin. So the unpriced
// products the migration was built to *exclude and name* were being handed a fabricated
// cost at the RPC boundary, and `profit_since` then summed that invention as earnings —
// correctly, from a number no one ever paid. The dashboard check passed the whole time,
// because the dashboard check is about the SQL.
//
// This is the shape of the hole rather than a one-off: the cost that reaches the database
// has to be the number the owner typed, or nothing. Any arithmetic on the way there is an
// invention, whatever the factor.
const productsService = stripTsComments(readFileSync('src/services/products.ts', 'utf8'))
const inventedCosts = [
  ...productsService.matchAll(/\bcost_?price\b\s*[:=][^\n;]*/gi),
]
  .map((m) => m[0])
  .filter((line) => /(?:price\s*[*+\-/]\s*[\d.]|[*+\-/]\s*[\d.]\s*)/.test(line))
report(
  inventedCosts.length === 0,
  'createProduct sends the cost the owner typed, or none — it never derives one from the price',
  inventedCosts.length ? inventedCosts[0].trim().slice(0, 90) : 'the 20% margin is gone from the client too',
)

// The same rule in the copy — the form's own hint — is checked with the other UI guards,
// further down, because it is a statement about the UI and not about this service.

// The allocation table is what makes a cancel an undo rather than a guess: without it the
// only possible restock is "some batch", which is how stock gets invented.
report(
  /create\s+table\s+if\s+not\s+exists\s+public\.order_item_allocations/.test(profitSql),
  'the migration creates the order-line → batch allocation table',
)
report(
  /restocked_quantity\s+<\s*(a\.)?quantity/.test(profitBodies.get('public.restock_order_lines') ?? ''),
  'restock_order_lines stops at what the line actually took',
)
report(
  /if\s+v_alloc_rows\s*>\s*0\s+then/.test(profitBodies.get('public.restock_order_lines') ?? ''),
  'restock_order_lines only falls back to another batch when the line has no allocation at all',
)
// A cancelled order is the case the shopkeeper reported: the stock must come back.
report(
  /if\s+p_new_status\s*=\s*'CANCELLED'\s+then/.test(transitionBody) &&
    /restock_order_lines/.test(transitionBody),
  'transition_order_status restocks when an order is cancelled',
)
report(
  /create\s+trigger\s+trg_return_restock/.test(profitSql),
  'approving a return is wired to restock the stock',
)
report(
  /old\.status\s+is\s+distinct\s+from\s+'APPROVED'/.test(profitBodies.get('public.trg_return_restock') ?? ''),
  'the return trigger fires only on the crossing to APPROVED, so approving twice is harmless',
)
// The client must not re-introduce the fallback. This is the assertion that matters most,
// because the fallback was not wrong by accident — it was wrong in two specific ways that
// each looked defensible on the page.
report(
  !/unit\s*\*\s*0\.8/.test(adminTs),
  'the dashboard service contains no client-side profit guess',
  adminTs.match(/[^\n]*0\.8[^\n]*/)?.[0]?.trim().slice(0, 90) ?? '',
)
report(
  !/from\('order_items'\)/.test(adminTs),
  'the dashboard service does not re-aggregate order_items, which is how cancelled orders counted as sales',
)
report(
  /if\s*\(error\)\s*throw\s+supabaseErrorToAppError\(error\)/.test(adminTs),
  'the dashboard service reports an aggregate failure instead of substituting its own number',
)
// The app has to name the order line, or approving a return still restores nothing.
//
// Matched on the `it.` form specifically, not on either variable name. `createReturnRequest`
// and `createReturnRequests` both write `order_item_id`, and accepting `input` as well let
// the single-item function satisfy the check on its own — the mutation suite caught a broken
// bulk path passing because a sibling function still had the right shape. The bulk function
// is the one the order screen calls, so it is the one worth asserting.
report(
  /order_item_id:\s*it\.orderItemId/.test(returnsTs),
  'a filed return names the order line it belongs to',
)
report(
  /orderItemId:\s*it\.id/.test(readFileSync('src/app/(customer)/order/[orderId].tsx', 'utf8')),
  'the order screen passes the line id the customer selected',
)
// A database `raise` is a stated refusal, not a crash. Without this branch every deliberate
// refusal — "Cart is empty", "Delivery address is required" — reached the user as
// "An unexpected error occurred", which reads as an app bug rather than as the rule firing.
//
// Matched as the whole branch rather than as two separate tokens. Looking for `P0001` and
// `AppErrorType.VALIDATION` anywhere in the file passed even with the branch deleted: the
// explanation above it names the SQLSTATE, and the `message.includes('validation')` branch
// above that already returns VALIDATION. Two loose checks are worse than one tight one,
// because they report confidence without having tested anything.
report(
  /if \(error\?\.code === 'P0001'[\s\S]{0,400}?AppErrorType\.VALIDATION/.test(errorsTs),
  'supabaseErrorToAppError classifies a Postgres raise as a validation refusal',
)

// ── one corner radius scale across the whole UI ─────────────────────────────────────
//
// Out of scope for a file about SQL, and here because it is the same kind of guarantee:
// two things in the codebase that are supposed to be the same thing, drifting apart, with
// nothing failing when they do.
//
// 85 call sites had a hard-coded `borderRadius`, across 14 different values, ten of which
// were not on the scale. Most of the damage was `width / 2` written out longhand -- a 36×36
// button at 18, a 28×28 tile at 14, a 30×30 button at 15 -- so a circle was a magic number
// and sat next to a card that was also `16` while meaning something completely different.
// The two complaints that started it ("some are so high they look like capsules, some so low
// they look razor sharp") were both true of the same style name in two files.
//
// The ESLint rule `hibbullah/radius-token` is the enforcement. This assertion is here so
// the property is checked by the same command that checks everything else, and so it fails
// with the file and line rather than only as a lint error someone can skip.
//
// `src/constants/sizes.ts` is excluded: it is the scale.
const UI_FILES = (() => {
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name) && p !== 'src/constants/sizes.ts') out.push(p)
    }
  }
  walk('src')
  return out.sort()
})()

const hardCodedRadii = []
for (const file of UI_FILES) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      // Only the shorthand is banned. `borderTopLeftRadius` and friends are not part of the
      // scale and there are none of them, so matching them would be a check about a thing
      // that does not exist rather than a check about this one.
      if (/\bborderRadius:\s*[0-9]/.test(line)) hardCodedRadii.push(`${file}:${i + 1}`)
    })
}
report(
  hardCodedRadii.length === 0,
  'no screen hard-codes a border radius — every corner comes from the radius scale',
  hardCodedRadii.length ? `${hardCodedRadii.length} site(s): ${hardCodedRadii.slice(0, 4).join(', ')}` : `${UI_FILES.length} files`,
)

// Copy that promises a behaviour is a separate kind of thing to check, and this one had
// already gone wrong.
//
// The product form carried this hint for the whole life of the app:
//
//   "Leave cost empty to auto-set price×0.8"
//
// It was never wrong as a description of the behaviour of the day — `createProduct` really
// did fill in `price * 0.8`. It outlived it. The database was changed in this same work to
// stop guessing that margin and to exclude unpriced products from the earnings figure, and
// the hint went on instructing the shop to rely on the guess. A check on the arithmetic
// cannot see it, because a string is not an arithmetic: this is a promise about what the app
// does, and promises outlive implementations. So it is checked as one.
const marginPromises = []
for (const file of UI_FILES) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (/auto-?set|auto-?fill|automatically/i.test(line) && /0\.8|20%|margin|cost/i.test(line)) {
        marginPromises.push(`${file}:${i + 1} promises an automatic cost price`)
      }
    })
}
report(
  marginPromises.length === 0,
  'no screen promises the owner an automatic cost price — an unpriced product stays unpriced and gets listed',
  marginPromises.length ? marginPromises.slice(0, 3).join(' | ') : `${UI_FILES.length} files`,
)

// ── one grid, and it is two cards wide on a phone ─────────────────────────────────────
//
// The requirement is simple and the app had eight answers to it. "Two product cards per
// row on any phone, more as the screen grows" was stated once and implemented seven times:
// `COLUMNS` said `xs: 1, sm: 1`; five screens copied `isMobile ? 1 : isTablet ? 2 : columns`
// over the top of it; the admin catalog used `isDesktop`; and the home page and the
// favourites screen each divided the screen width by two themselves, with the same
// expression, in two files. The copies had already drifted — two capped the result at
// three, three did not — so the catalogue and the search grid disagreed about tablets and
// the admin's own product list was one-up on the handset the owner was holding.
//
// `useResponsive` is now the only statement of the policy, and it has two because product
// cards and order rows genuinely want different minimum widths. These checks exist so a
// fourth copy cannot appear.
const responsiveCode = stripTsComments(readFileSync('src/hooks/useResponsive.ts', 'utf8'))

// Checked against the real values, not the existence of a constant. `PRODUCT_COLUMNS` was
// `xs: 1, sm: 1` for the whole life of this file and satisfied every check that only asked
// whether the map was there.
const phoneColumns = responsiveCode.match(/PRODUCT_COLUMNS\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? ''
const phoneCols = Object.fromEntries(
  [...phoneColumns.matchAll(/\b(xs|sm|md|lg|xl|xxl):\s*(\d+)/g)].map(([, k, v]) => [k, Number(v)]),
)
report(
  phoneCols.xs === 2 && phoneCols.sm === 2,
  'the product grid is two cards wide on every phone width',
  `xs: ${phoneCols.xs}, sm: ${phoneCols.sm} — and the count only grows from there: ${[phoneCols.md, phoneCols.lg, phoneCols.xl, phoneCols.xxl].join(', ')}`,
)
report(
  // Growing is a direction, not a value: each breakpoint must be at least the one below it.
  ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'].every((k, i, all) => i === 0 || phoneCols[k] >= phoneCols[all[i - 1]]),
  'the product grid never loses a column as the screen gets wider',
  ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'].map((k) => `${k}: ${phoneCols[k]}`).join(', '),
)

const listColsBlock = responsiveCode.match(/LIST_COLUMNS\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? ''
const listCols = Object.fromEntries(
  [...listColsBlock.matchAll(/\b(xs|sm|md|lg|xl|xxl):\s*(\d+)/g)].map(([, k, v]) => [k, Number(v)]),
)
report(
  // The reason `listColumns` exists at all: forcing an order row — a status, a date, an
  // item count and a total — into 170px to match the product grid would make it unreadable.
  listCols.xs === 1 && listCols.sm === 1,
  'an order or customer row stays one-up on a phone, because it is not a product card',
  `xs: ${listCols.xs}, sm: ${listCols.sm} — up to ${Math.max(...Object.values(listCols))} on a desktop`,
)

const gridCopies = []
for (const file of UI_FILES) {
  const code = stripTsComments(readFileSync(file, 'utf8'))
  code.split('\n').forEach((line, i) => {
    // The expression, verbatim, that five screens used to carry.
    if (/\bisMobile\s*\?\s*1\s*:/.test(line)) gridCopies.push(`${file}:${i + 1} re-derives the column count`)
    // A literal column count, which is the same policy in a shorter form.
    const n = line.match(/numColumns=\{(\d+)\}/)
    if (n) gridCopies.push(`${file}:${i + 1} hard-codes ${n[1]} column(s)`)
    // The screen-width division, which home and favourites each wrote out longhand.
    if (/\(\s*width\s*-\s*spacing\.[a-z]+\s*\*\s*2\s*-/.test(line)) gridCopies.push(`${file}:${i + 1} divides the screen width itself`)
  })
}
report(
  gridCopies.length === 0,
  'every grid takes its column count from useResponsive — no screen holds its own',
  gridCopies.length ? gridCopies.slice(0, 4).join(' | ') : `${UI_FILES.length} files`,
)

// …and every screen that draws a product card actually has a grid.
//
// The two checks above both ask whether a screen that *has* a column policy gets it from the
// hook. Neither asks whether the screen has a policy at all, and the answer was no twice.
// `products/category/[categoryId].tsx` and `products/manufacturer/[manufacturerId].tsx`
// each rendered a `ProductCard` from a `FlashList` with no `numColumns` prop, which
// defaults to 1 — so those two routes showed one full-width card per row while the catalog
// next to them showed two. They were missed in the first pass because the search for
// duplication looked for copies of the policy and these had none to copy.
//
// The general form of the bug is a screen added later, or a screen that was never in the
// list, quietly inheriting a library default. So the check is per-screen and by presence:
// any file that renders a product card must place it in a grid the hook drives.
const ungridded = []
for (const file of UI_FILES) {
  const code = stripTsComments(readFileSync(file, 'utf8'))
  if (!/<ProductCard\b/.test(code)) continue
  // A `numColumns` from the hook, or a measured card width — the two shapes the app draws
  // a card grid in. A horizontal scroller is a legitimate third and is named here so that
  // adding one is a deliberate act rather than something this check has to be argued out of.
  if (/numColumns=\{columns\}/.test(code)) continue
  if (/useResponsive\(\)/.test(code) && /\bcardWidth\b/.test(code)) continue
  ungridded.push(`${file.split('/').pop()} (${/<FlashList/.test(code) ? 'FlashList, no numColumns' : 'no grid found'})`)
}
report(
  ungridded.length === 0,
  'every screen that draws a product card puts it in a two-up grid — none is left on a library default',
  ungridded.length ? ungridded.join(' | ') : 'catalog, search, favourites, home, category, manufacturer, admin',
)

// The page margin, as opposed to the column count.
//
// These were uniform in the wrong respect: the catalog and the search screen each gave a
// card 4px of container padding plus the 4px on the cell, so the *gutter* was a tidy 8px at
// every column count — and the *page margin* was 8px, where the home page, the favourites
// screen and every non-list screen used 16. Same card, half the margin, depending which
// screen it was on. It is the kind of difference that is invisible alone and obvious in a
// screenshot of two screens side by side.
// FlashList v2 has no `columnWrapperStyle`, so the gutter has to come from padding on the
// cells, and the container's share is the page margin. `spacing.md` on the container plus
// `spacing.sm` on the cell is `spacing.lg`, the margin everything else uses.
//
// The check names the two files rather than sweeping up every `numColumns`, because the
// admin catalog is genuinely a different case: it sits inside a `ResponsiveContainer` that
// already owns the page margin, and stacks its own on top, so it lands at 20px rather than
// 16. That one is a known outstanding item in `docs/TODO.md`, and a check that quietly
// included it would have had to either fail on a state we are not fixing here, or pass by
// not looking — which is the failure mode this file exists to prevent. If the admin margin
// is brought in line, add `src/app/(admin)/products/index.tsx` to `CUSTOMER_GRIDS`.
const CUSTOMER_GRIDS = ['src/app/(customer)/(tabs)/products.tsx', 'src/app/(customer)/search.tsx']
const edgeMargins = CUSTOMER_GRIDS.map((file) => {
  const code = stripTsComments(readFileSync(file, 'utf8'))
  const container = code.match(/content:\s*\{[^}]*paddingHorizontal:\s*(spacing\.\w+)/)?.[1] ?? 'none'
  const cell = code.match(/gridItem:\s*\{[^}]*paddingHorizontal:\s*(spacing\.\w+)/)?.[1] ?? 'none'
  return {
    file: file.split('/').pop(),
    ok: container === 'spacing.md' && cell === 'spacing.sm',
    detail: `${container} + ${cell}`,
  }
})
report(
  edgeMargins.every((e) => e.ok),
  'the customer product grids share one page margin — container and cell padding add up to spacing.lg',
  edgeMargins.map((e) => `${e.file}: ${e.detail}${e.ok ? '' : ' ✗'}`).join(' | '),
)

// ── one palette, and a shadow that actually casts one ───────────────────────────────
//
// The dark theme had three defects that no test and no screenshot would have caught,
// because each of them was invisible in the one situation anyone looks at a mockup: a
// light desktop, with a screenshot, taken once.
//
// 1. `buildShadows` took the palette and named the parameter `_colors`. Every shadow was
//    a hard-coded `rgba(0,0,0,0.04..0.10)`, and a black shadow at 4% on a `#0A0C0B` page
//    casts nothing — there is no darker neighbour. So dark mode had no working elevation
//    at all: every card, sheet and header was held off the page by its border hairline
//    alone. The fix is the accent glow, and the check is that the shadow module actually
//    reads the palette.
//
// 2. `dark` was inferred in places by `colors.background === "#111A17"` — a colour
//    compared to a hex literal. Retune the background and every one of those comparisons
//    silently becomes false with no error anywhere. `resolvedTheme` is the answer, and the
//    check is that no screen compares a colour to a hex again.
//
// 3. Six files carried their own hex literals, including `#1A2420` — a dark-mode surface —
//    as the placeholder behind a product photo in *both* themes, so light mode showed a
//    near-black rectangle behind every product with no picture.
const shadowsTs = readFileSync('src/constants/shadows.ts', 'utf8')
const shadowsCode = stripTsComments(shadowsTs)

// ── 1. the accent glow ────────────────────────────────────────────────────────────
//
// Both checks below were written for the dark-mode elevation work and both now assert
// something the flat redesign deliberately undid. They are kept in rewritten form, because
// what they were really policing is still true — a token that documents an intent nothing
// implements is a bug — and it is worth knowing where the flat design put that token.
//
// 1a. The glow has to be *in the shadow*, not merely defined in the palette. `glow` and
//     `glowStrong` were added to `darkUtil` with zero readers, which is the exact failure
//     `onStatus` and `accentMuted` were deleted for. Flat mode has no shadow to put a glow
//     in, so the check has changed shape: it now asserts the glow is not quietly *dropped*
//     from the palette. `useShadows()` returns `none` for all seven steps, so a token left
//     defined with nothing reading it is the same defect the original check existed to
//     catch, one layer up.
const glowStillDefined = /glow(Strong)?\s*:/.test(readFileSync('src/constants/darkColors.ts', 'utf8'))
report(
  glowStillDefined && !/colors\.glow(Strong)?\b/.test(shadowsCode),
  'the accent glow is retained in the palette and, being flat, correctly unread by the shadow hook',
  'flat surfaces separate by lightness; a glow token with no reader is the state this catches',
)

// 1b. The original signature was `buildShadows(_colors)`: the parameter was there, named, and
//     unused, which is why every shadow was a hard-coded black and dark mode had no
//     elevation. The property worth keeping is not "the glow is cast" but "no parameter is
//     accepted and ignored" — that is what `_colors` was, and it is how a whole class of
//     dead-theme bug starts.
//
//     So the check is now inverted to match reality: `buildShadows` takes no palette
//     parameter at all, and the check fails if one reappears without being read. Asserting
//     "every parameter is used" would be satisfied by a hook that takes zero parameters
//     vacuously, which is not evidence of anything — so the test is that the parameter list
//     is empty *because* there is nothing left to vary, and that the seven steps are all
//     the same flat value.
// The step table is the `return { … }` inside `buildShadows`, matched to its own closing
// brace. Anchoring on `\n\}` would miss it — the object is indented, so the line is `\n  };`.
const shadowSteps = shadowsCode.split(/function buildShadows\([^)]*\)/)[1]?.match(/return \{([\s\S]*?)\n\s*\};/)?.[1] ?? ''
const declaredParams = (shadowsCode.match(/function buildShadows\(([^)]*)\)/)?.[1] ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean)
const flatValues = [...shadowSteps.matchAll(/boxShadow:\s*(\w+|"[^"]*")/g)].map((m) => m[1])
report(
  declaredParams.length === 0 &&
    flatValues.length === 7 &&
    new Set(flatValues).size === 1,
  'buildShadows declares no parameter and returns one flat value for all seven steps',
  'a parameter that is accepted and ignored is how a dead-theme bug starts; a hook that ' +
    'varies nothing should not accept a palette',
)

const hexLiterals = []
const themeSniffs = []
for (const file of UI_FILES) {
  if (file.startsWith('src/constants/')) continue
  // Comments are stripped first, and this is why the two checks below cannot simply look
  // for `#` in the raw source. The explanations written next to these very fixes quote the
  // old hex values — `#111A17`, `#1A2420`, `#3D4A46` — so a naive scan reported the
  // documentation of the bug as the bug. A check that fires on its own comments is a check
  // nobody will keep running.
  const code = stripTsComments(readFileSync(file, 'utf8'))
  code.split('\n').forEach((line, i) => {
    // `#fff` is the one literal with a legitimate reason to stay inline: a token for
    // full white would be a token whose name is longer than its value.
    const m = line.match(/#[0-9A-Fa-f]{3,8}\b/g)
    if (m && !m.every((h) => /^#(?:fff|FFF|ffffff|FFFFFF)$/.test(h))) {
      hexLiterals.push(`${file}:${i + 1} ${line.trim().slice(0, 60)}`)
    }
    // A colour compared to a hex — the exact expression that failed silently when the
    // dark background was retuned from `#111A17` to `#0A0C0B`.
    if (/colors\.[a-zA-Z]+\s*===?\s*["']#[0-9A-Fa-f]{3,8}["']/.test(line)) {
      themeSniffs.push(`${file}:${i + 1} ${line.trim().slice(0, 60)}`)
    }
  })
}
report(
  hexLiterals.length === 0,
  'no screen hard-codes a colour — every value comes from the palette',
  hexLiterals.length ? `${hexLiterals.length}: ${hexLiterals.slice(0, 3).join(' | ')}` : `${UI_FILES.length} files`,
)
report(
  themeSniffs.length === 0,
  'no screen infers the theme by comparing a colour to a hex — use resolvedTheme',
  themeSniffs.length ? `${themeSniffs.length}: ${themeSniffs.slice(0, 3).join(' | ')}` : `${UI_FILES.length} files`,
)

console.log(problems === 0 ? '\n=== IN SYNC ===' : `\n=== ${problems} DIFFERENCE(S) ===`)
process.exitCode = problems === 0 ? 0 : 1
