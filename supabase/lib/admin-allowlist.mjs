/**
 * Test-admin access to the live project, without leaving the door unlocked.
 *
 * ── The problem this replaces ──────────────────────────────────────────────────────
 * The admin allowlist is a list of email addresses that decides who is an administrator.
 * It used to be hard-coded inline in SIX function bodies -- is_admin(), handle_new_user(),
 * sync_profile_on_email_change(), custom_access_token_hook(), enforce_profile_role() and
 * transition_order_status() -- and a verification script needing admin rights had to edit
 * whichever copies it knew about.
 *
 * That failed in production, twice, in two different ways.
 *
 * First: snapshot-and-restore. Read the definitions, patch them, put them back afterwards.
 * A snapshot-restore pair only works if the script reaches its restore step; a Ctrl-C, a
 * timeout or a crash in between leaves the test address sitting in the live role trigger,
 * where it grants nothing (the auth.users row is gone) but is still a third party's email
 * embedded in the function that decides who is an admin. It also compounds: the next run
 * snapshots the already-dirty definition and restores that dirt back.
 *
 * Second, and more quietly: the copies drifted apart from each other and from the tooling.
 * The tooling patched is_admin() and enforce_profile_role(). transition_order_status()
 * carried a sixth inline copy that nobody patched, so a test admin could open the admin
 * panel and then got "Only allowlisted admins can change order status" from every order
 * transition. Because that guard fires *before* the transition rules, the suite's "skipping
 * a step is refused" assertion passed for entirely the wrong reason -- green tests over a
 * feature that was dead. That is the failure mode this module now makes structurally
 * impossible rather than merely unlikely.
 *
 * ── What this does instead ─────────────────────────────────────────────────────────
 * The list lives in exactly one place, `public.is_admin_email(text)`. Everything else asks
 * it. So there is one function to patch, and no second copy to forget.
 *
 * Nothing is snapshotted. "The allowlist is exactly the two real admins" is an absolute
 * that can be reasserted at any moment, so the scripts reassert it:
 *
 *   1. on the way in,  sanitise()   -- reset the owner function to the two real admins
 *   2. grant the test account admin by rewriting that one function
 *   3. on the way out, sanitise()   -- back to exactly the two real admins
 *
 * There is no stored "previous" state that can be wrong, and running sanitise twice is a
 * no-op. An interrupted run still leaves at most the test address, and the next run removes
 * it before doing anything else. `supabase/clean-test-data.mjs` sweeps the rest.
 *
 * Two guards make a mistake loud instead of silent:
 *
 *   - the owner function is rebuilt from a template, but only after its shape is checked, so
 *     a real change to it in a migration refuses rather than being quietly reverted
 *   - every other function is asserted to contain NO email literal at all, so a migration
 *     that re-introduces a second copy fails the test run instead of drifting for weeks
 */

const REF = process.env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const MGMT = process.env.HIBBULLAH_SUPABASE_TOKEN

/**
 * The only two addresses that may ever hold admin. Everything else -- including a test
 * account -- is a temporary addition made by grantTestAdmin() and removed by sanitise().
 */
export const REAL_ADMINS = ['icrmahin@gmail.com', 'hibbullah82026@gmail.com']

/** The one function permitted to hard-code an email address. */
export const OWNER_FUNCTION = 'is_admin_email'

/**
 * Every function that decides admin rights. None of these may contain an email literal;
 * they must call OWNER_FUNCTION. Listed explicitly rather than discovered, so that adding
 * a seventh copy of the decision is a deliberate act someone has to write down.
 */
export const DERIVED_FUNCTIONS = [
  'is_admin',
  'handle_new_user',
  'sync_profile_on_email_change',
  'custom_access_token_hook',
  'enforce_profile_role',
  'transition_order_status',
]

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

/**
 * Every definition of a function name, in pg_proc order.
 *
 * Lookup is by name rather than by `'public.fn()'::regprocedure` because that only resolves
 * when a function takes no arguments, and two of the functions that decide admin rights do
 * take them: custom_access_token_hook(jsonb) and transition_order_status(uuid, text, uuid).
 * With empty parens those throw "function does not exist", which reads exactly like a
 * missing function rather than a bad lookup.
 */
async function definitionsByName(fn) {
  const rows = JSON.parse(
    await query(
      `select pg_get_functiondef(p.oid) as def
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = '${fn}'
       order by p.oid`,
    ),
  )
  return rows.map((r) => r.def)
}

const definition = async (fn) => {
  const defs = await definitionsByName(fn)
  if (defs.length === 0) throw new Error(`public.${fn}() does not exist`)
  // An overload here would mean the scan below silently only covers one of two paths that
  // can grant admin, so refuse rather than pick.
  if (defs.length > 1) {
    throw new Error(`public.${fn}() has ${defs.length} definitions; refusing to guess which one governs admin rights`)
  }
  return defs[0]
}

export const emailsIn = (def) => [...new Set(def.match(/'[^']+@[^']+'/g) ?? [])]

/** The canonical body of the owner function, for a given list. */
const ownerSql = (list) => `create or replace function public.${OWNER_FUNCTION}(p_email text)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $fn$
  select lower(coalesce(p_email, '')) in (${list})
$fn$`

/**
 * Guard against silently reverting a legitimate change to the one function we rebuild.
 *
 * If a migration adds a condition, changes the signature or renames the parameter, writing
 * the template back would quietly undo that work. So the shape is checked first and the
 * caller is told to look, rather than being allowed to clobber.
 */
function assertOwnerShapeIntact(def) {
  const expectations = [
    /lower\s*\(\s*coalesce\s*\(/i, // null-safe, case-insensitive
    /\bin\s*\(/i, // an actual list, not a single equality
    /language\s+sql/i,
    /security\s+definer/i,
  ]
  const missing = expectations.filter((re) => !re.test(def))
  if (missing.length > 0) {
    throw new Error(
      `${OWNER_FUNCTION}() no longer matches the expected shape (missing ${missing.map(String).join(', ')}). ` +
        'The template would revert a real change -- update this module, do not force it.',
    )
  }
}

/**
 * Assert that no function other than the owner has a hard-coded address in it.
 *
 * This is the invariant that would have caught the sixth copy on the day it was written.
 * It is checked on every sanitise() rather than only in the test suite, because the thing
 * it protects is a live role decision, and a test nobody runs is not a guard.
 *
 * Returns the offenders as `[{ function, emails }]`; empty means the invariant holds.
 */
export async function findHardcodedAllowlists() {
  const offenders = []
  for (const fn of DERIVED_FUNCTIONS) {
    for (const def of await definitionsByName(fn)) {
      const emails = emailsIn(def)
      if (emails.length > 0) offenders.push({ function: fn, emails })
    }
  }
  return offenders
}

/**
 * Reduce the allowlist to exactly the real admins, and prove nothing else holds a copy.
 * Idempotent.
 *
 * Returns the stray addresses it removed, so a caller can report them rather than silently
 * repairing something it did not know was broken.
 */
export async function sanitise() {
  if (!MGMT) throw new Error('Set HIBBULLAH_SUPABASE_TOKEN first.')
  const list = REAL_ADMINS.map((e) => `'${e}'`).join(', ')
  const removed = []

  const def = await definition(OWNER_FUNCTION)
  assertOwnerShapeIntact(def)

  const strays = emailsIn(def).filter((e) => !REAL_ADMINS.includes(e.replace(/'/g, '')))
  if (strays.length > 0) {
    // Both real admins must be present before anything is rewritten, or a typo here would
    // lock the owners out of their own admin panel.
    for (const email of REAL_ADMINS) {
      if (!def.includes(email)) throw new Error(`${email} missing from ${OWNER_FUNCTION}(); refusing to rewrite`)
    }
    await query(ownerSql(list))
    removed.push(...strays.map((e) => `${OWNER_FUNCTION}(): ${e}`))
  }

  // Now the structural check. If a migration has re-introduced a second copy somewhere,
  // say so loudly -- and say which function, because "somewhere" is not actionable.
  const offenders = await findHardcodedAllowlists()
  if (offenders.length > 0) {
    const detail = offenders.map((o) => `${o.function}() contains ${o.emails.join(', ')}`).join('; ')
    throw new Error(
      `The admin allowlist is duplicated outside ${OWNER_FUNCTION}(). ${detail}. ` +
        'A second copy is how the owners get locked out of their own admin panel, and how a ' +
        'test suite reports success over a broken feature. Point those functions at ' +
        `${OWNER_FUNCTION}() -- do not patch them here.`,
    )
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
  if (!email || !email.includes('@')) throw new Error(`grantTestAdmin: ${email} does not look like an email`)
  const list = [...REAL_ADMINS, email].map((e) => `'${e}'`).join(', ')
  await sanitise()
  await query(ownerSql(list))
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
