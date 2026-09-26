/**
 * The admin allowlist, checked against the live database rather than a copy of it.
 *
 * `admin-allowlist.test.mjs` proves the rewriting logic works, offline. This proves the
 * thing that logic is protecting still holds in production: that the list of addresses
 * which may hold admin exists in exactly one place.
 *
 * The failure this exists to catch is not hypothetical. The list used to be hard-coded
 * inline in six function bodies, and the verification tooling only knew about two of them.
 * A test admin could therefore open the admin panel and then got "Only allowlisted admins
 * can change order status" from every order transition -- and because that guard fires
 * before the transition rules, the suite's "skipping a step is refused" assertion passed
 * while every legitimate transition was also being refused. Green tests, dead feature.
 *
 * So: one function owns the list, and this fails if any other function grows a copy.
 *
 * Usage:
 *   set -a && . ./.env && set +a && node supabase/verify-allowlist-live.mjs
 */
import { env } from 'node:process'
import { REAL_ADMINS, OWNER_FUNCTION, DERIVED_FUNCTIONS, findHardcodedAllowlists, sanitise, grantTestAdmin, revokeTestAdmin } from './lib/admin-allowlist.mjs'

const PROJECT_REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`
const PUBLISHABLE = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const MGMT = env.HIBBULLAH_SUPABASE_TOKEN

if (!MGMT) {
  console.error('Set HIBBULLAH_SUPABASE_TOKEN first.')
  process.exit(1)
}

let problems = 0
const report = (ok, msg, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (extra) console.log(`        ${extra}`)
  if (!ok) problems += 1
}

const stamp = Date.now()
const TEST_ADMIN = { email: `alw-${stamp}@hibbullah.test`, password: `AllowW-${stamp}-Aa1!` }

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

/**
 * Sign in, and create the account on first use.
 *
 * Separate from `signIn` because the re-sign-in after a grant needs a *fresh* token --
 * custom_access_token_hook bakes the role into the JWT when it is minted, so a token
 * issued before grantTestAdmin() is not an admin token. Calling signup twice would be
 * rejected with `user_already_exists`, which looks like a different failure entirely.
 */
async function signIn(who) {
  const inRes = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: who.email, password: who.password } })
  const json = JSON.parse(inRes.text)
  if (!json.access_token) throw new Error(`sign-in: ${inRes.text.slice(0, 250)}`)
  return { ...who, id: json.user.id, token: json.access_token }
}

async function signUp(who) {
  const up = await api('/auth/v1/signup', { method: 'POST', body: { email: who.email, password: who.password } })
  if (up.status !== 200) throw new Error(`signup: ${up.text.slice(0, 250)}`)
  return signIn(who)
}

console.log('=== admin allowlist: one owner, live ===\n')

try {
  // ── the structural invariant ─────────────────────────────────────────────────────
  const offenders = await findHardcodedAllowlists()
  report(
    offenders.length === 0,
    `no function other than ${OWNER_FUNCTION}() hard-codes an address`,
    offenders.length ? offenders.map((o) => `${o.function}: ${o.emails.join(', ')}`).join('; ') : `${DERIVED_FUNCTIONS.length} delegating functions checked`,
  )

  // ── the list is exactly the two real admins, and no leftovers ────────────────────
  const removed = await sanitise()
  report(removed.length === 0, `the live list is already exactly the two real admins`, removed.length ? `removed: ${removed.join(', ')}` : REAL_ADMINS.join(', '))

  // ── granting a test admin actually works, end to end ────────────────────────────
  // is_admin() reads auth.users, so this proves the owner function is reachable from the
  // role that decides everything -- not merely present in the catalogue.
  const before = await signUp(TEST_ADMIN)
  const profileBefore = JSON.parse((await api(`/rest/v1/profiles?id=eq.${before.id}&select=role`, { token: before.token })).text)
  report(profileBefore[0]?.role === 'customer', 'a new account starts as a customer', JSON.stringify(profileBefore[0]))

  await grantTestAdmin(TEST_ADMIN.email)
  // Fresh token: the custom access token hook bakes the role in at mint time.
  const after = await signIn(TEST_ADMIN)
  const profileAfter = JSON.parse((await api(`/rest/v1/profiles?id=eq.${after.id}&select=role`, { token: after.token })).text)
  report(profileAfter[0]?.role === 'customer', 'adding the address alone does not rewrite the stored role', `profiles.role=${profileAfter[0]?.role}`)

  // The decisive check: transition_order_status() is the RPC that carried the sixth copy
  // of the list, and it is the one that refused a legitimately-granted admin before. It
  // refuses here only because there is no such order, so the *reason* matters.
  const probe = await api('/rest/v1/rpc/transition_order_status', {
    method: 'POST',
    token: after.token,
    body: { p_order_id: '00000000-0000-0000-0000-000000000000', p_new_status: 'CONFIRMED', p_admin_id: after.id },
  })
  const body = probe.text ?? ''
  report(
    probe.status >= 400 && body.includes('Order not found'),
    'a granted admin now passes the allowlist guard and is refused only for the missing order',
    `HTTP ${probe.status} ${body.slice(0, 160)}`,
  )
} catch (error) {
  console.error(`\nERROR: ${error.message}`)
  problems += 1
} finally {
  try {
    await revokeTestAdmin()
    console.log('\n  allowlist restored to the two real admins.')
  } catch (e) {
    console.error(`  !! restore failed: ${e.message}`)
    problems += 1
  }
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `delete from auth.users where email = '${TEST_ADMIN.email}'` }),
    })
    if (!res.ok) throw new Error((await res.text()).slice(0, 200))
    console.log('  test account removed.')
  } catch (e) {
    console.error(`  !! test account cleanup failed: ${e.message}`)
  }
}

console.log(problems === 0 ? '\n=== ONE SOURCE, VERIFIED ===' : `\n=== ${problems} PROBLEM(S) ===`)
process.exitCode = problems === 0 ? 0 : 1
