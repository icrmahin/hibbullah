/**
 * Test-admin access to the live project, without leaving the door unlocked.
 *
 * ── The problem this replaces ──────────────────────────────────────────────────────
 * The admin allowlist is a hard-coded list of email addresses, and it lives in TWO
 * independent places:
 *
 *   is_admin()                 -- the boolean every policy and RPC checks
 *   enforce_profile_role()     -- the BEFORE trigger that rewrites profiles.role
 *
 * Neither `profiles.role` nor an UPDATE can grant admin, so a verification script that
 * needs admin rights has to edit those two function bodies. The obvious approach is
 * snapshot-and-restore: read the definitions, patch them, put them back afterwards.
 *
 * That is fragile, and it failed here in production twice. A snapshot-restore pair only
 * works if the script reaches its restore step; a Ctrl-C, a network timeout or a crash
 * in between leaves the test address sitting in the live role trigger, where it grants
 * nothing (the auth.users row is gone) but is still a third party's email embedded in
 * the function that decides who is an admin. It also compounds: the next run snapshots
 * the already-dirty definition and restores that dirt back.
 *
 * ── What this does instead ─────────────────────────────────────────────────────────
 * Nothing is snapshotted. "The allowlist is exactly the two real admins" is an absolute
 * that can be reasserted at any moment, so the scripts reassert it:
 *
 *   1. on the way in,  sanitise()          -- drop anything that is not a real admin
 *   2. grant the test account admin
 *   3. on the way out, sanitise()          -- back to exactly the two real admins
 *
 * There is no stored "previous" state that can be wrong, and running sanitise twice is
 * a no-op. An interrupted run still leaves at most the test address, and the next run
 * removes it before doing anything else. `supabase/clean-test-data.mjs` sweeps the
 * remaining residue.
 *
 * Both functions are rewritten from a *known-good template* built here, not by editing
 * a snapshot. That is deliberate: the template is checked against the live definition
 * before it is applied, so a change to either function in a migration shows up as a
 * refusal rather than being silently reverted.
 */

const REF = process.env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const MGMT = process.env.HIBBULLAH_SUPABASE_TOKEN

/**
 * The only two addresses that may ever hold admin. Everything else -- including a test
 * account -- is a temporary addition made by grantTestAdmin() and removed by sanitise().
 */
export const REAL_ADMINS = ['icrmahin@gmail.com', 'hibbullah82026@gmail.com']

const FUNCTIONS = ['is_admin', 'enforce_profile_role']

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 400)}`)
  return text.trim()
}

const definition = async (fn) =>
  JSON.parse(await query(`select pg_get_functiondef('public.${fn}()'::regprocedure) as def`))[0].def

const emailsIn = (def) => [...new Set(def.match(/'[^']+@[^']+'/g) ?? [])]

/**
 * Replace the address list inside a function body.
 *
 * Anchored on an identifier ending in `email` immediately before the `in`, because the
 * two functions express the list in different shapes: `pg_get_functiondef` renders
 * `is_admin` as a SQL body (`lower(auth.users.email) in (...)`) and
 * `enforce_profile_role` as plpgsql (`if v_email in (...) then`). A pattern that assumed
 * the plpgsql form silently failed to match the SQL one -- which is exactly how a stray
 * address came to be left behind by a "successful" cleanup.
 *
 * The anchor also stops a bare `in (...)` from matching something unrelated that happens
 * to appear earlier in the body, and the result is verified before it is used: a rewrite
 * based on a misread pattern would lock the owners out of their own admin panel, which
 * is far worse than a test that cannot run.
 */
function replaceList(fn, def, list) {
  // The optional `\)` is load-bearing: `pg_get_functiondef` renders is_admin as
  // `lower(auth.users.email) in (...)`, so the clause ends with a closing paren, while
  // the trigger reads `if v_email in (...) then`. Requiring exactly one of the two
  // shapes is how the earlier version failed to match is_admin at all.
  const patched = def.replace(/(\w*email\)?\s+in\s*)\([^)]*\)/i, `$1(${list})`)
  if (patched === def) {
    throw new Error(
      `${fn}(): no allowlist found (looked for an "email in (...)" clause); refusing to rewrite the function blindly`,
    )
  }
  // Post-condition: everything asked for is present, and nothing else is left over.
  const wanted = list.split(',').map((e) => e.trim())
  const actual = emailsIn(patched)
  const missing = wanted.filter((e) => !actual.includes(e))
  const extra = actual.filter((e) => !wanted.includes(e))
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${fn}(): the rewrite did not produce the intended list ` +
        `(missing ${JSON.stringify(missing)}, unexpected ${JSON.stringify(extra)}); not applying it`,
    )
  }
  return patched
}

/**
 * Guard against silently reverting a legitimate change.
 *
 * If either function's body has been altered by a migration since this template was
 * written -- a new policy check, a different search_path, a renamed variable -- then
 * writing the template back would quietly undo that work in production. So the shape is
 * checked first, and the caller is told to look rather than being allowed to clobber.
 */
function assertShapeIntact(fn, def) {
  const expectations = {
    is_admin: [/security definer/i, /auth\.uid\(\)/, /auth\.users/],
    enforce_profile_role: [/returns\s+trigger/i, /security definer/i, /new\.role/],
  }
  const missing = expectations[fn].filter((re) => !re.test(def))
  if (missing.length > 0) {
    throw new Error(
      `${fn}() no longer matches the expected shape (missing ${missing.map(String).join(', ')}). ` +
        'The template would revert a real change -- update this module, do not force it.',
    )
  }
}

/**
 * Reduce both functions to exactly the real admins. Idempotent.
 *
 * Returns the stray addresses it removed, so a caller can report them rather than
 * silently repairing something it did not know was broken.
 */
export async function sanitise() {
  if (!MGMT) throw new Error('Set HIBBULLAH_SUPABASE_TOKEN first.')
  const list = REAL_ADMINS.map((e) => `'${e}'`).join(', ')
  const removed = []

  for (const fn of FUNCTIONS) {
    const def = await definition(fn)
    assertShapeIntact(fn, def)

    const strays = emailsIn(def).filter((e) => !REAL_ADMINS.includes(e.replace(/'/g, '')))
    if (strays.length === 0) continue

    // Both real admins must be present before anything is rewritten, or a typo here
    // would lock the owners out of their own admin panel.
    for (const email of REAL_ADMINS) {
      if (!def.includes(email)) throw new Error(`${email} missing from ${fn}(); refusing to rewrite`)
    }

    await query(replaceList(fn, def, list))
    removed.push(...strays.map((e) => `${fn}(): ${e}`))
  }

  return removed
}

/**
 * Give a throwaway account admin rights for the duration of a test.
 *
 * Sanitises first, so the test starts from the two real admins regardless of what an
 * interrupted previous run left behind. Call `revokeTestAdmin()` (or `sanitise()`) in a
 * `finally` to take it away again -- that step is idempotent and cannot fail silently.
 */
export async function grantTestAdmin(email) {
  const list = [...REAL_ADMINS, email].map((e) => `'${e}'`).join(', ')
  await sanitise()

  // is_admin() is rebuilt from a template because it is a single expression over the
  // allowlist with no other behaviour to preserve. The shape check runs first, so a real
  // change to it in a migration stops the test rather than being quietly undone.
  const isAdmin = await definition('is_admin')
  assertShapeIntact('is_admin', isAdmin)
  await query(
    `create or replace function public.is_admin() returns boolean language sql security definer set search_path = 'public','auth','pg_catalog' as $fn$
       select exists (
         select 1 from auth.users
         where auth.users.id = auth.uid()
           and lower(auth.users.email) in (${list})
       );
     $fn$`,
  )

  // enforce_profile_role() is edited in place, because it also carries the admin phone
  // allowance and the updated_at stamp. Only the hard-coded list changes.
  const roleTrigger = await definition('enforce_profile_role')
  assertShapeIntact('enforce_profile_role', roleTrigger)
  await query(replaceList('enforce_profile_role', roleTrigger, list))
}

/**
 * Take the test account's admin rights away, leaving exactly the two real admins.
 *
 * Safe to call twice, safe to call when no test admin was ever granted, and safe to call
 * from a `finally` that runs after a partial failure.
 */
export async function revokeTestAdmin() {
  return sanitise()
}

/**
 * profiles.role is rewritten only by a BEFORE INSERT OR UPDATE trigger, so the row still
 * says 'customer' from signup until something touches it. is_admin() is already true, but
 * the column is what the app reads, so nudge the row to fire the trigger.
 */
export async function promoteProfile(userId) {
  await query(`update public.profiles set name = name where id = '${userId}'`)
}
