#!/usr/bin/env node
/**
 * Search by medicine name, by brand, and by company -- proved against the live database.
 *
 * WHY THIS IS ITS OWN SUITE
 * `search_products` returned a `manufacturer_name` column and never used it in the
 * predicate. So `search_products('square')` answered with zero rows, on a catalogue whose
 * "Square" range is a real product, and everything about the function looked correct: it
 * was `stable`, `security invoker`, granted to `anon`, indexed, ranked, and it had a
 * `total_count`. The only way to see the hole was to ask the question a customer asks.
 *
 * That is the shape this suite is built around. It does not check that a function exists,
 * that it is granted, or that it returns the right columns -- `verify-stack.mjs` already
 * covers all three. It asks one question four ways, against rows it created, and asks the
 * near-misses too:
 *
 *   1. the company name finds every product that company makes, including the one that
 *      shares no brand and no generic with the others (this is the case that was broken)
 *   2. the brand name finds every product in that brand
 *   3. the generic finds the brand it belongs to -- the "paracetamol -> Napa" case
 *   4. the product name still works, and an exact name still outranks everything else
 *
 * The fixtures are built so that each product can only be reached by one route. If a
 * future change breaks the company path, no other path can accidentally cover for it, which
 * is the property that makes this suite able to fail.
 *
 * It also asserts the `LIKE` escaping. `p_query` is interpolated into a pattern, the
 * publishable key is in the shipped bundle, and PostgREST lets anyone call the RPC, so a
 * term of `%` must find nothing rather than the whole catalogue. The app strips `%`
 * client-side; this proves the database does not depend on that.
 *
 * Usage:
 *   set -a && . ./.env && set +a && node supabase/verify-search-matches.mjs
 */
import { randomUUID } from 'node:crypto'
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

/**
 * Three products, one company, one category.
 *
 * `A` and `B` share a brand and a generic. `C` shares only the company. That is the whole
 * point of the layout: `C` is reachable *only* by the company name, so a search that
 * ignores `manufacturers.name` cannot return it no matter what else it gets right.
 *
 * `A`'s name leads with the strength ("500 mg Zylora") so the brand is a *mid-string* match
 * in its name and a prefix match in its own column. A brand search that only did prefix
 * matching on the product name would miss it.
 *
 * Each fixture gets its own random token, and that is not cosmetic. The first two versions
 * numbered them with a shared timestamp, and the assertions counted result rows. Trigram
 * similarity counts *shared* trigrams, so a shared 13-digit stamp made every product about
 * 0.5 similar to every other, and `stamp + 1` was no better -- twelve of thirteen digits
 * still matched. The brand query therefore also returned the third product, through the
 * fuzzy rung, and "and not the third" failed for a reason that had nothing to do with the
 * code under test.
 *
 * The fix is twofold, and the second half matters more than the first. The tokens are now
 * genuinely unrelated. But the assertions were also wrong: a search has a fuzzy floor, so
 * it may legitimately return extra rows, and what the function actually promises is
 * *ranking* -- the right products come back, and they come back above the noise. So every
 * check below asserts presence and relative order, never an exact count.
 */
const COMPANY = `Zephyr Health Ltd ${stamp}`
const CATEGORY = `Search Probe ${stamp}`
const GENERIC = 'Zylometacin'
const OTHER_GENERIC = 'Quinocillin'
const tagA = randomUUID().slice(0, 8)
const tagB = randomUUID().slice(0, 8)
const tagC = randomUUID().slice(0, 8)
const BRAND = `Zylora ${tagA}`
const OTHER_BRAND = `Quadrum ${tagC}`

const FIXTURES = [
  { key: 'A', name: `500 mg Zylora ${tagA}`, brand: BRAND, generic: GENERIC },
  { key: 'B', name: `Zylora ${tagB} Plus 100 mg`, brand: BRAND, generic: GENERIC },
  { key: 'C', name: `Quadrum ${tagC} 125 mg`, brand: OTHER_BRAND, generic: OTHER_GENERIC },
]

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
  return body
}

/**
 * The RPC as the app calls it: POST with a JSON body, and the *publishable* key, because
 * search is an anonymous read. Nothing here is admin-scoped, so anything that passes here
 * is genuinely reachable by a customer who has not signed in.
 */
async function search(query, extra = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_products`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE,
      Authorization: `Bearer ${PUBLISHABLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_query: query, p_limit: 50, ...extra }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`search_products(${JSON.stringify(query)}): HTTP ${res.status} ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

/**
 * Fixture identity, keyed by the fixture's own name.
 *
 * Keyed by a map rather than parsed out of the name: the first version took the last
 * space-separated token, which was the timestamp, so all three products reported the same
 * key and eight assertions failed while the database was right. Deriving identity from a
 * substring of a string the test also controls is the same mistake wearing a different hat.
 */
const keyByName = new Map(FIXTURES.map((f) => [f.name, f.key]))

/** The fixture key at each position, in the order the database returned them, e.g. "CBA". */
const keysOf = (rows) => rows.map((r) => keyByName.get(r.name) ?? `?${r.name}`).join('')

/** Is this fixture anywhere in the result? */
const has = (rows, key) => rows.some((r) => keyByName.get(r.name) === key)

/** Where this fixture sits, or -1 if it is absent. Two absent fixtures tie; -1 < -1 is false. */
const rankOf = (rows, key) => rows.findIndex((r) => keyByName.get(r.name) === key)

/** Every listed key is present, whatever else came back. */
const hasAll = (rows, ...keys) => keys.every((k) => has(rows, k))

/** The name of the row at position `i`, or `--` if the result set is shorter. */
const nameAt = (rows, i) => rows[i]?.name ?? '--'

// ── fixtures ──────────────────────────────────────────────────────────────────────

head('fixtures')

await admin(
  `insert into public.categories (name, slug) values ('${CATEGORY}', 'search-probe-${stamp}');
   insert into public.manufacturers (name) values ('${COMPANY}');
   insert into public.products (name, brand, generic_name, description, price, stock, unit, category_id, manufacturer_id)
   select p.name, p.brand, p.generic, 'A deliberately unremarkable description for the search probe.', 100, 25, 'pack', c.id, m.id
   from (values
     ('${FIXTURES[0].name}', '${FIXTURES[0].brand}', '${FIXTURES[0].generic}'),
     ('${FIXTURES[1].name}', '${FIXTURES[1].brand}', '${FIXTURES[1].generic}'),
     ('${FIXTURES[2].name}', '${FIXTURES[2].brand}', '${FIXTURES[2].generic}')
   ) as p(name, brand, generic)
   cross join public.categories c
   cross join public.manufacturers m
   where c.slug = 'search-probe-${stamp}' and m.name = '${COMPANY}';`,
)

try {
  // Precondition, one assertion per fixture: each is findable by its own exact name, which
  // is the one path that cannot be broken by anything tested below.
  for (const f of FIXTURES) {
    const found = await search(f.name)
    check(
      found.length >= 1 && found[0].name === f.name,
      `fixture ${f.key} is visible to an anonymous search, and ranks first, on its own name`,
      `got ${found.length} row(s), first: ${nameAt(found, 0)}`,
    )
  }
} catch (e) {
  console.error(`  !! could not read the fixtures back: ${e.message.slice(0, 300)}`)
  failures += 1
  process.exitCode = 1
}

try {
  // ── 1. the company name ───────────────────────────────────────────────────────────

  head('1. the company name — the case that was broken')

  const byCompany = await search(COMPANY)
  check(
    hasAll(byCompany, 'A', 'B', 'C'),
    'searching the full company name returns all three of its products',
    `got ${byCompany.length} row(s): ${keysOf(byCompany) || '(none)'}`,
  )
  check(
    has(byCompany, 'C'),
    '…including C, which shares no brand and no generic with the other two',
    'C is reachable only by manufacturers.name, so this is the whole test',
  )

  // A prefix of the company, which is what a customer actually types: "square", not
  // "Square Pharmaceuticals PLC". A contains-only implementation would pass the test above
  // and fail this one, which is why both are here.
  const byCompanyPrefix = await search('Zephyr')
  check(
    hasAll(byCompanyPrefix, 'A', 'B', 'C'),
    'a prefix of the company name ("Zephyr") also returns all three',
    `got ${byCompanyPrefix.length} row(s): ${keysOf(byCompanyPrefix) || '(none)'}`,
  )

  // ── 2. the brand ─────────────────────────────────────────────────────────────────

  head('2. the brand — every product in the brand')

  const byBrand = await search(BRAND)
  check(
    hasAll(byBrand, 'A', 'B'),
    'searching the brand returns both of its products',
    `got ${byBrand.length} row(s): ${keysOf(byBrand) || '(none)'}`,
  )
  check(
    // Not "C is absent" -- a search has a fuzzy floor and may legitimately return C. What
    // must hold is that the brand's own products come back *above* it.
    !has(byBrand, 'C') || (rankOf(byBrand, 'A') < rankOf(byBrand, 'C') && rankOf(byBrand, 'B') < rankOf(byBrand, 'C')),
    'the brand’s own products rank above any other product that only matched fuzzily',
    `order: ${keysOf(byBrand) || '(none)'}`,
  )
  check(
    byBrand.length > 0 && /Zephyr Health Ltd/.test(byBrand[0].manufacturer_name),
    'the brand hit carries its company name, so the card can be attributed',
    byBrand[0]?.manufacturer_name,
  )
  check(
    // Both products sit on the same rung -- brand prefix -- so the order between them is
    // the tiebreak the function promises: `order by rank, name, id`. "500 mg Zylora ..."
    // sorts before "Zylora ... Plus", so A must come first. Asserting it is what makes the
    // ordering a stated property rather than whatever the planner happened to emit.
    rankOf(byBrand, 'A') >= 0 && rankOf(byBrand, 'A') < rankOf(byBrand, 'B'),
    'two products in the same brand come back in name order, so the list does not shuffle',
    `order: ${keysOf(byBrand)}`,
  )

  // ── 3. the generic ───────────────────────────────────────────────────────────────

  head('3. the generic — "paracetamol" should reach the brand it belongs to')

  const byGeneric = await search(GENERIC)
  check(
    hasAll(byGeneric, 'A', 'B'),
    'searching the generic returns the two products that share it',
    `got ${byGeneric.length} row(s): ${keysOf(byGeneric) || '(none)'}`,
  )
  check(
    // Both hit the same rung (generic prefix), so the order between them is the tiebreak
    // the function promises: `order by rank, name, id`. "500 mg Zylora ..." sorts before
    // "Zylora ... Plus" because '5' precedes 'Z', so A must come first. Asserting it is what
    // makes the ordering a stated property rather than whatever the planner happened to emit.
    nameAt(byGeneric, 0) === FIXTURES[0].name,
    'products tied on rank come back in name order, so paging is stable',
    `first row: ${nameAt(byGeneric, 0)}`,
  )

  // ── 4. the medicine name, and the ordering that is supposed to be predictable ─────

  head('4. the medicine name still works, and still outranks everything')

  const byName = await search(FIXTURES[1].name)
  check(
    byName.length >= 1 && byName[0].name === FIXTURES[1].name,
    'an exact product name ranks that product first',
    `first row: ${nameAt(byName, 0)}`,
  )

  // The bare brand token, which is the term a customer actually types. It is a *prefix* of
  // B's name ("Zylora <tagB> Plus...") and *mid-string* in A's ("500 mg Zylora <tagA>").
  //
  // This is the case the rewrite fixed and the one the old function could not serve: A's
  // brand column holds the full `Zylora <tagA>`, so a search for the bare "Zylora" does not
  // prefix-match it, and `brand % term` only fires on near-misses. A is reachable *only*
  // because name-contains is now in the predicate. And the ordering here is the ladder
  // working: B on name-prefix (1), A on brand-contains (5).
  const shared = await search('Zylora')
  check(
    hasAll(shared, 'A', 'B'),
    'a bare brand token returns every product in the brand, strengths and all',
    `got ${shared.length} row(s): ${keysOf(shared) || '(none)'}`,
  )
  check(
    has(shared, 'A'),
    'a brand is found when it is mid-string in the product name, not just a prefix of it',
    `A: ${has(shared, 'A') ? 'present' : 'ABSENT'}`,
  )
  check(
    rankOf(shared, 'B') < rankOf(shared, 'A'),
    'the product whose *name* starts with the term outranks the one that only matches on brand',
    `order: ${keysOf(shared)}`,
  )

  // ── 5. the LIKE escaping ─────────────────────────────────────────────────────────

  head('5. a term cannot become a wildcard')

  // The publishable key ships in the bundle. Anyone with it can POST to this RPC, so the
  // database — not the app's own sanitiser — is what has to make `%` a literal.
  const wildcard = await search('%')
  check(
    wildcard.length === 0,
    'p_query = "%" matches nothing rather than the whole catalogue',
    `got ${wildcard.length} row(s)`,
  )

  const underscore = await search('_')
  check(
    underscore.length === 0,
    'p_query = "_" matches nothing (it is a LIKE single-character wildcard)',
    `got ${underscore.length} row(s)`,
  )

  // `_` is a LIKE single-character wildcard, so unescaped `Zy_ora` is a valid pattern for
  // "Zylora" and would return it. Escaped, it is a literal underscore and matches nothing.
  // The bare `_` case above cannot tell the two apart -- a one-character term never reaches
  // a trigram index either -- so this is the assertion that actually proves the escape.
  const literal = await search('Zy_ora')
  check(
    literal.length === 0,
    'a term whose _ is a LIKE wildcard still matches nothing — unescaped it would find "Zylora"',
    `got ${literal.length} row(s)`,
  )
} finally {
  head('cleanup')
  try {
    await admin(
      `delete from public.products where manufacturer_id in (select id from public.manufacturers where name = '${COMPANY}');
       delete from public.manufacturers where name = '${COMPANY}';
       delete from public.categories where slug = 'search-probe-${stamp}';`,
    )
    const left = await search('Zephyr')
    check(left.length === 0, 'the fixtures are gone', `${left.length} row(s) still match "Zephyr"`)
  } catch (e) {
    console.error(`  !! cleanup failed: ${e.message.slice(0, 300)}`)
    failures += 1
    process.exitCode = 1
  }
}

console.log(
  failures === 0
    ? `\n=== search matches the medicine name, the brand and the company ===`
    : `\n=== ${failures} SEARCH FAILURE(S) ===`,
)
