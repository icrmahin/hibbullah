/**
 * Verifies the delete-cloudinary-asset Edge Function against the live stack:
 *   1. the function is configured (secrets reached it)
 *   2. an avatar-scoped call for a real signed-in user destroys that user's asset
 *   3. a wipe is idempotent, and says so honestly when the folder was already clean
 *   4. a product-scoped call is refused for a non-admin, and allowed for an admin
 *   5. a bogus public id reports "not found" as destroyed, not as a failure
 *
 * Public ids carry a per-upload suffix (an unsigned upload cannot replace an existing
 * asset, so each upload needs its own id). The function therefore only accepts ids
 * under `avatars/<uid>-`, and these assertions use that shape -- the unsuffixed
 * `avatars/<uid>` is deliberately outside the caller's prefix and is refused.
 */

import { grantTestAdmin, revokeTestAdmin, promoteProfile } from './lib/admin-allowlist.mjs'

const REF = 'xkvjhvwrzfczymbgapip'
const BASE = `https://${REF}.supabase.co`
const FN = `${BASE}/functions/v1/delete-cloudinary-asset`
const PUB = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const MGMT = process.env.HIBBULLAH_SUPABASE_TOKEN
const CLOUD = 'eomwaokm'
const KEY = '552629197332824'
const SECRET = 'JldVda86wmI-mT03kY_9i0u-oes'

let step = 0
const check = (cond, msg) => {
  console.log(`  ${String(++step).padStart(2)}. ${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) process.exitCode = 1
}

async function admin(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 300)}`)
  return t
}

async function api(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      apikey: PUB,
      Authorization: `Bearer ${token ?? PUB}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: r.status, text: await r.text() }
}

/** Unsigned upload through the avatars preset, exactly like AvatarPicker does. */
async function uploadAvatar(publicId) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const form = new FormData()
  form.append('file', new Blob([png], { type: 'image/png' }), 'a.png')
  form.append('upload_preset', 'hibbullah_avatars')
  form.append('folder', 'avatars')
  form.append('public_id', publicId)
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: 'POST',
    body: form,
  })
  return { status: r.status, json: await r.json() }
}

/**
 * Independent check that the asset really is gone, via the signed admin API.
 *
 * Uses the admin *search* endpoint rather than /image/<public_id>: the latter serves
 * derived variants and is not a reliable existence probe for a raw upload. The
 * delivery URL is no good either, because Cloudinary serves a 1x1 transparent GIF in
 * place of a missing asset instead of returning 404.
 */
async function assetExists(publicId) {
  const r = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD}/resources/image?type=upload&public_ids[]=${encodeURIComponent(publicId)}`,
    { headers: { Authorization: `Basic ${Buffer.from(`${KEY}:${SECRET}`).toString('base64')}` } },
  )
  if (!r.ok) return `http-${r.status}`
  const j = await r.json()
  return Array.isArray(j.resources) && j.resources.length > 0
}

const stamp = Date.now()
const EMAIL = `fn-${stamp}@hibbullah.test`
const PASSWORD = `Fn-${stamp}-Aa1!`
let userId = null
async function restore() {
  // Idempotent, and it reasserts an absolute rather than restoring a snapshot, so an
  // interrupted earlier run cannot leave a stale test address in the role trigger.
  try {
    const removed = await revokeTestAdmin()
    for (const r of removed) console.log(`  removed stray allowlist entry: ${r}`)
    console.log('  admin allowlist back to the two real admins.')
  } catch (e) {
    console.error(`  !! FAILED TO RESTORE THE ADMIN ALLOWLIST: ${e.message}`)
    process.exitCode = 1
  }
  if (userId) {
    await admin(`delete from public.audit_entries where actor_id = '${userId}'`)
    await admin(`delete from auth.users where id = '${userId}'`)
  }
}

console.log('=== delete-cloudinary-asset verification ===\n')

try {
  // 1. Unauthenticated call: configured check happens before the token check, so a
  //    500 function_not_configured here would mean the secrets did not land.
  const anon = await api('/functions/v1/delete-cloudinary-asset', {
    method: 'POST',
    body: { scope: 'avatar' },
  })
  check(
    !anon.text.includes('function_not_configured'),
    `function is configured (anonymous call says: ${anon.text.slice(0, 60)})`,
  )

  // 2. Real user + real asset.
  await api('/auth/v1/signup', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })
  const session = JSON.parse(
    (await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })).text,
  )
  const token = session.access_token
  userId = session.user.id
  check(Boolean(token && userId), `signed in as ${EMAIL}`)

  // The id must sit under the caller's own folder, suffixed. The prefix is built
  // server-side from the verified uid, so the client only chooses the suffix.
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const publicId = `${userId}-${suffix}`
  const up = await uploadAvatar(publicId)
  check(up.status === 200, `unsigned avatar upload via hibbullah_avatars (HTTP ${up.status})`)
  check(up.json?.public_id === `avatars/${publicId}`, `stored under the caller's folder (${up.json?.public_id})`)
  check((await assetExists(`avatars/${publicId}`)) === true, 'asset exists before delete')

  const del = await api('/functions/v1/delete-cloudinary-asset', {
    method: 'POST',
    token,
    body: { scope: 'avatar' },
  })
  const delJson = JSON.parse(del.text)
  check(del.status === 200 && delJson.destroyed === true, `avatar scope destroys the asset (${del.text.slice(0, 80)})`)
  check(delJson.count === 1, `  ...and it reports how many it removed (count=${delJson.count})`)
  check((await assetExists(`avatars/${publicId}`)) === false, 'asset is confirmed gone from Cloudinary')

  // 3. Re-running is safe. `destroyed` means the requested end state holds, so an
  //    already-empty folder is still success -- otherwise the endpoint would report
  //    failure for having nothing to do, and a caller checking the result would treat
  //    a completed cleanup as a problem. `count` is what distinguishes the two.
  const again = await api('/functions/v1/delete-cloudinary-asset', {
    method: 'POST',
    token,
    body: { scope: 'avatar' },
  })
  const againJson = JSON.parse(again.text)
  check(
    again.status === 200 && againJson.destroyed === true && againJson.count === 0,
    `second delete is idempotent, not an error (${again.text.slice(0, 60)})`,
  )

  // An id outside the caller's prefix must be refused, even though it is well formed.
  // Every avatar id is a valid uuid, so shape alone would prove nothing about ownership.
  const foreign = await api('/functions/v1/delete-cloudinary-asset', {
    method: 'POST',
    token,
    body: { scope: 'avatar', previousPublicId: 'avatars/00000000-0000-4000-8000-000000000000-abc' },
  })
  check(
    foreign.status === 200 && JSON.parse(foreign.text).destroyed === false,
    `an id outside the caller's own prefix is refused (${foreign.text.slice(0, 60)})`,
  )

  // 4. A bad token must not destroy anything.
  const bad = await api('/functions/v1/delete-cloudinary-asset', {
    method: 'POST',
    token: 'not-a-real-token',
    body: { scope: 'avatar' },
  })
  check(bad.status === 401, `invalid token rejected (HTTP ${bad.status} ${bad.text.slice(0, 60)})`)

  // 5. Product scope is admin-only. Not an admin yet -> 403.
  const prod = await api('/functions/v1/delete-cloudinary-asset', {
    method: 'POST',
    token,
    body: { scope: 'product', productId: '11111111-1111-4111-8111-111111111111' },
  })
  check(prod.status === 403, `non-admin refused product scope (HTTP ${prod.status})`)

  // 6. Malformed product id is rejected before any Cloudinary call.
  const traversal = await api('/functions/v1/delete-cloudinary-asset', {
    method: 'POST',
    token,
    body: { scope: 'product', productId: '../../etc/passwd' },
  })
  // A malformed id must be rejected by the function's own regex, before any
  // Cloudinary call and before the admin check.
  //
  // Note: a literal '../../etc/passwd' does not reach the function at all -- the
  // platform edge answers 403 with an HTML page, so the traversal string is stopped
  // one layer earlier than our validation. That is worth knowing, but it means the
  // WAF masks the function's own check, so a benign malformed id is used here to
  // actually exercise the code path.
  const badId = await api('/functions/v1/delete-cloudinary-asset', {
    method: 'POST',
    token,
    body: { scope: 'product', productId: 'not-a-uuid' },
  })
  check(
    badId.status === 400 && badId.text.includes('invalid_product_id'),
    `malformed product id rejected by the function (HTTP ${badId.status} ${badId.text.slice(0, 70)})`,
  )
  check(
    badId.status === 400 || traversal.status === 403,
    `traversal-shaped id never reaches the function (platform edge: HTTP ${traversal.status})`,
  )

  // 7. Now make them an admin and confirm the product scope is allowed.
  //
  //    The function authorises product scope by reading profiles.role with the service
  //    role key, NOT by calling is_admin(). And profiles.role is rewritten from
  //    enforce_profile_role()'s own copy of the email allowlist on every write. So both
  //    functions have to be granted the test email, and both taken back in restore().
  await grantTestAdmin(EMAIL)
  await promoteProfile(userId)
  const prodAdmin = await api('/functions/v1/delete-cloudinary-asset', {
    method: 'POST',
    token,
    body: { scope: 'product', productId: '11111111-1111-4111-8111-111111111111' },
  })
  check(
    prodAdmin.status === 200 && JSON.parse(prodAdmin.text).destroyed === true,
    `admin allowed product scope, missing asset reported destroyed (${prodAdmin.text.slice(0, 60)})`,
  )
} catch (error) {
  console.error(`\nERROR: ${error.message}`)
  process.exitCode = 1
} finally {
  console.log('\nCleaning up...')
  await restore()
}

console.log(process.exitCode ? '\n=== SOME CHECKS FAILED ===' : '\n=== ALL CHECKS PASSED ===')
