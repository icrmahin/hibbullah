#!/usr/bin/env node
/**
 * Does the audit log's `profiles(name)` embed actually resolve, as a real admin?
 *
 * Two ways this can fail without ever showing up in a unit test:
 *   - PostgREST does not detect the relationship and answers 400 "Could not find a
 *     relationship between audit_entries and profiles"
 *   - the embed resolves, but RLS on profiles filters the embedded row to null, so the
 *     screen silently falls back to the uuid it was meant to stop showing
 *
 * The first audit row is written by a real admin action, so it has a non-null actor_id and
 * a resolvable name. The rest are trigger-written with a null actor_id, which must render
 * as "System" rather than an empty line.
 */
import { grantTestAdmin, revokeTestAdmin, promoteProfile } from './lib/admin-allowlist.mjs'
import { env } from 'node:process'

const PROJECT_REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`
const PUBLISHABLE = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const MGMT = env.HIBBULLAH_SUPABASE_TOKEN

const stamp = Date.now()
const EMAIL = `auditprobe-${stamp}@hibbullah.test`
const PASSWORD = `AuditProbe-${stamp}-Aa1!`

let step = 0
let failures = 0
const check = (cond, m, extra = '') => {
  console.log(`  ${String(++step).padStart(2)}. ${cond ? 'PASS' : 'FAIL'}  ${m}`)
  if (extra) console.log(`        ${extra}`)
  if (!cond) {
    failures += 1
    process.exitCode = 1
  }
}

async function admin(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`admin SQL failed: HTTP ${res.status} ${body.slice(0, 400)}`)
  return body
}

async function api(path, { method = 'GET', token, body, prefer } = {}) {
  const headers = {
    apikey: PUBLISHABLE,
    Authorization: `Bearer ${token ?? PUBLISHABLE}`,
    'Content-Type': 'application/json',
  }
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${SUPABASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, text: await res.text() }
}

let userId = null
try {
  const up = await api('/auth/v1/signup', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })
  if (up.status !== 200) throw new Error(`signup: ${up.text.slice(0, 200)}`)
  await grantTestAdmin(EMAIL)
  const inRes = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })
  const token = JSON.parse(inRes.text).access_token
  if (!token) throw new Error(`sign-in: ${inRes.text.slice(0, 200)}`)
  userId = JSON.parse(inRes.text).user.id
  await promoteProfile(userId)
  check(true, `signed in as an admin (${userId.slice(0, 8)})`)

  // A row with a real actor, so the name has something to resolve to.
  await admin(
    `insert into public.audit_entries (actor_id, action, record_type, record_id)
     values ('${userId}', 'UPDATE', 'profiles', null)`,
  )
  check(true, 'wrote an audit row with a non-null actor_id')

  // The exact query src/services/audit.ts now sends.
  const q = await api('/rest/v1/audit_entries?select=%2A%2Cprofiles%28name%29&order=timestamp.desc&limit=20', { token })
  check(q.status === 200, `the audit query with the profiles embed returns 200 (HTTP ${q.status})`, q.text.slice(0, 300))
  if (q.status === 200) {
    const rows = JSON.parse(q.text || '[]')
    const withActor = rows.find((r) => r.actor_id === userId)
    check(Boolean(withActor), 'the row with a real actor is visible to this admin')
    check(
      Boolean(withActor?.profiles?.name),
      'RLS does not filter the embedded profile away',
      `embedded profiles = ${JSON.stringify(withActor?.profiles)}`,
    )
    const systemRows = rows.filter((r) => !r.actor_id)
    check(systemRows.every((r) => r.profiles === null), 'trigger rows (null actor) carry no embedded profile, as expected', `${systemRows.length} such rows`)
  }

  // The old query, for the record: it 400s, which is what the console was showing.
  const old = await api('/rest/v1/audit_entries?select=id%2Caction%2Cactor%2Crecord_type%2Ctimestamp&limit=10', { token })
  check(old.status === 400, `the removed dashboard query is genuinely the 400 (HTTP ${old.status})`, old.text.slice(0, 160))
} catch (error) {
  console.error(`\nERROR: ${error.message}`)
  process.exitCode = 1
} finally {
  try {
    await revokeTestAdmin()
    console.log('  admin allowlist back to the two real admins.')
  } catch (e) {
    console.error(`  !! allowlist restore failed: ${e.message}`)
  }
  if (userId) {
    try {
      await admin(
        `delete from public.audit_entries where actor_id = '${userId}';
         delete from public.notifications where user_id = '${userId}';
         delete from auth.users where id = '${userId}';`,
      )
      console.log(`\nCleaned up ${EMAIL} and its audit rows.`)
    } catch (e) {
      console.error(`  !! cleanup failed: ${e.message.slice(0, 200)}`)
    }
  }
}
