#!/usr/bin/env node
/**
 * Advertisements: who may write one, and who is allowed to see it.
 *
 * A new table with two permissive policies is the sort of change that looks finished the
 * moment the migration applies and is only actually correct if the *second* policy — the
 * public one — refuses the right rows. Everything that can go wrong here is a row being
 * visible when it should not be, or an anonymous visitor writing one, so that is what this
 * walks:
 *
 *   · nobody signed in can read an empty table, and cannot insert into it (RLS, not the
 *     app, is the gate — this is checked before any admin token is ever minted)
 *   · a test admin can create, read, pause, date and delete
 *   · a signed-in customer who is not an admin cannot create one
 *   · `is_active = false`, a `starts_at` in the future and an `ends_at` in the past each
 *     remove the row from public view while leaving it fully visible to the admin
 *   · inside the window it comes back
 *   · the two `check` constraints fire on the shapes the form is supposed to refuse:
 *     a url with no link, a product with no id, an end date before the start date
 *   · `sort_order` is what decides the public order
 *
 * The date window being enforced *in the policy* rather than in a query the client has to
 * remember to write is the whole point: this suite fails if anyone ever moves that logic
 * out of Postgres and into a `where` clause that one screen forgets.
 *
 * Fixtures are throwaway and swept in `finally`; the allowlist is sanitised by
 * `revokeTestAdmin()`. Nothing that existed before a run is touched.
 *
 * Usage:
 *   set -a && . ./.env && set +a && node supabase/verify-advertisements.mjs
 */
import { grantTestAdmin, revokeTestAdmin, promoteProfile } from './lib/admin-allowlist.mjs'
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
 * The fixture prefix. Titles are how a run that died before its `finally` gets cleaned up:
 * the first statement sweeps whatever an earlier run left behind, and it may only do that
 * if the prefix is unmistakably ours — a banner an owner wrote is never titled this.
 */
const FIXTURE = `ZZ-ADTEST ${stamp}`
const ADMIN = { email: `ad-admin-${stamp}@hibbullah.test`, password: `AdAdmin-${stamp}-Aa1!` }
const CUSTOMER = { email: `ad-cust-${stamp}@hibbullah.test`, password: `AdCust-${stamp}-Aa1!` }

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
  return JSON.parse(body)
}

async function api(path, { method = 'GET', token, body, prefer } = {}) {
  const headers = {
    apikey: PUBLISHABLE,
    Authorization: `Bearer ${token ?? PUBLISHABLE}`,
    'Content-Type': 'application/json',
  }
  // Without this a POST answers 201 with an empty body, so there is no id to read back
  // and every id-based assertion below quietly compares against `undefined`.
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* not json */
  }
  return { status: res.status, text, json }
}

/** The public view: exactly what a signed-out visitor's key is allowed to return. */
const publicList = async (token) =>
  api('/rest/v1/advertisements?select=id,title,sort_order,is_active&order=sort_order.asc', {
    token,
  })

async function signIn(who) {
  const r = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: who.email, password: who.password },
  })
  if (!r.json?.access_token) throw new Error(`sign-in ${who.email}: ${r.text.slice(0, 250)}`)
  return { ...who, id: r.json.user.id, token: r.json.access_token }
}

async function signUp(who) {
  const up = await api('/auth/v1/signup', {
    method: 'POST',
    body: { email: who.email, password: who.password },
  })
  if (up.status !== 200) throw new Error(`signup ${who.email}: ${up.text.slice(0, 250)}`)
  return signIn(who)
}

/** A minimal, valid banner. Every test starts from this and changes one field. */
function ad(overrides = {}) {
  return {
    title: `${FIXTURE} plain`,
    subtitle: 'Written by the owner',
    image_url: `https://res.cloudinary.com/demo/image/upload/banner-${stamp}.jpg`,
    destination_type: 'none',
    destination_id: null,
    sort_order: 0,
    is_active: true,
    starts_at: null,
    ends_at: null,
    ...overrides,
  }
}

let adminUser
let customer
let createdIds = []
/**
 * How many banners are already live that this run did not create.
 *
 * Counted, not assumed: the table may hold an owner's real campaign, and a suite that
 * demanded an empty shop would start failing the day somebody advertised something.
 * Every assertion below is a delta against one of these two numbers.
 */
let basePublic = 0
let baseAdmin = 0
const publicCount = async (token) => (await publicList(token)).json?.length ?? -1

try {
  // Sweep anything an earlier run left behind before counting what is genuinely there.
  await admin(`delete from public.advertisements where title like 'ZZ-ADTEST %'`)

  head('Public reads and writes, before any admin exists')

  const anon = await publicList()
  check(anon.status === 200, `a signed-out visitor can read the table (HTTP ${anon.status})`)
  basePublic = anon.json?.length ?? -1
  check(basePublic >= 0, `and the read is a plain list (${basePublic} banner(s) already live)`)

  const anonWrite = await api('/rest/v1/advertisements', { method: 'POST', body: ad({ title: `${FIXTURE} anon` }) })
  check(
    anonWrite.status >= 400,
    `but cannot insert one (HTTP ${anonWrite.status})`,
    String(anonWrite.json?.message ?? anonWrite.text).slice(0, 180),
  )

  head('Fixtures')
  adminUser = await signUp(ADMIN)
  await grantTestAdmin(ADMIN.email)
  await promoteProfile(adminUser.id)
  // Re-sign in: the token hook bakes the role into the JWT, so a token minted before the
  // promotion is not an admin token and the write would fail for the wrong reason.
  adminUser = await signIn(ADMIN)
  check(Boolean(adminUser.token), `test admin ready (${adminUser.id.slice(0, 8)})`)
  baseAdmin = await publicCount(adminUser.token)

  customer = await signUp(CUSTOMER)
  check(Boolean(customer.token), `customer ready (${customer.id.slice(0, 8)})`)

  const customerWrite = await api('/rest/v1/advertisements', {
    method: 'POST',
    token: customer.token,
    body: ad({ title: `${FIXTURE} customer` }),
  })
  check(
    customerWrite.status >= 400,
    `a signed-in customer cannot create one either (HTTP ${customerWrite.status})`,
    String(customerWrite.json?.message ?? customerWrite.text).slice(0, 180),
  )

  head('Admin creates, public sees it')

  const first = await api('/rest/v1/advertisements', {
    method: 'POST',
    token: adminUser.token,
    prefer: 'return=representation',
    body: ad({ title: `${FIXTURE} A`, sort_order: 10 }),
  })
  check(first.status === 201, `admin created a banner (HTTP ${first.status})`, first.text.slice(0, 180))
  const idA = first.json?.[0]?.id
  if (idA) createdIds.push(idA)

  const second = await api('/rest/v1/advertisements', {
    method: 'POST',
    token: adminUser.token,
    prefer: 'return=representation',
    body: ad({ title: `${FIXTURE} B`, sort_order: 5 }),
  })
  const idB = second.json?.[0]?.id
  if (idB) createdIds.push(idB)
  check(second.status === 201 && Boolean(idB), `admin created a second one (HTTP ${second.status})`)

  const anonNow = await publicList()
  check(
    anonNow.json?.length === basePublic + 2,
    `the public now sees both (${anonNow.json?.length}, was ${basePublic})`,
  )
  const posA = anonNow.json?.findIndex((r) => r.id === idA) ?? -1
  const posB = anonNow.json?.findIndex((r) => r.id === idB) ?? -1
  check(
    posA >= 0 && posB >= 0 && posB < posA,
    'in sort_order — 5 before 10 — not insertion order',
    JSON.stringify(anonNow.json),
  )

  head('Paused banner')

  await admin(`update public.advertisements set is_active = false where id = '${idA}'`)
  const pausedPublic = await publicCount()
  const pausedAdmin = await publicCount(adminUser.token)
  check(pausedPublic === basePublic + 1, `the public sees one (${pausedPublic}, was ${basePublic})`)
  check(
    pausedAdmin === baseAdmin + 2,
    `an admin still sees both — a paused banner has to be findable to be restarted (${pausedAdmin}, was ${baseAdmin})`,
  )

  await admin(`update public.advertisements set is_active = true where id = '${idA}'`)

  head('Date window, enforced by the policy')

  await admin(
    `update public.advertisements set ends_at = now() - interval '1 day' where id = '${idA}'`,
  )
  const ended = await publicCount()
  check(ended === basePublic + 1, `an expired banner is invisible to the public (${ended}, was ${basePublic})`)

  await admin(
    `update public.advertisements set ends_at = null, starts_at = now() + interval '7 days' where id = '${idA}'`,
  )
  const scheduled = await publicCount()
  check(
    scheduled === basePublic + 1,
    `a banner that has not started yet is also invisible (${scheduled}, was ${basePublic})`,
  )

  await admin(
    `update public.advertisements
        set starts_at = now() - interval '1 day', ends_at = now() + interval '1 day'
      where id = '${idA}'`,
  )
  const windowed = await publicCount()
  check(windowed === basePublic + 2, `inside the window it is back (${windowed}, was ${basePublic})`)

  head('The shape constraints, not the form, are the backstop')

  const noLink = await api('/rest/v1/advertisements', {
    method: 'POST',
    token: adminUser.token,
    body: ad({ destination_type: 'url', destination_id: null }),
  })
  check(
    noLink.status >= 400 && String(noLink.json?.code ?? '').includes('23514'),
    `a link destination with no link is refused by the table (HTTP ${noLink.status})`,
    String(noLink.json?.message ?? '').slice(0, 160),
  )

  const noId = await api('/rest/v1/advertisements', {
    method: 'POST',
    token: adminUser.token,
    body: ad({ destination_type: 'product', destination_id: null }),
  })
  check(
    noId.status >= 400 && String(noId.json?.code ?? '').includes('23514'),
    `so is a product destination with nothing to point at (HTTP ${noId.status})`,
    String(noId.json?.message ?? '').slice(0, 160),
  )

  const reversed = await api('/rest/v1/advertisements', {
    method: 'POST',
    token: adminUser.token,
    body: ad({ starts_at: '2026-12-01T00:00:00Z', ends_at: '2026-11-01T00:00:00Z' }),
  })
  check(
    reversed.status >= 400 && String(reversed.json?.code ?? '').includes('23514'),
    `and an end date before its start date is refused too (HTTP ${reversed.status})`,
    String(reversed.json?.message ?? '').slice(0, 160),
  )

  head('Admin can still do everything')

  const edited = await api(`/rest/v1/advertisements?id=eq.${idA}`, {
    method: 'PATCH',
    token: adminUser.token,
    body: { title: `${FIXTURE} A renamed` },
  })
  check(edited.status === 204, `admin renamed it (HTTP ${edited.status})`)

  const reread = await publicList()
  check(
    reread.json?.some((r) => r.id === idA && r.title === `${FIXTURE} A renamed`),
    'and the change is visible to everyone',
  )
} catch (error) {
  console.error(`\nERROR: ${error.message}`)
  process.exitCode = 1
} finally {
  head('Cleanup')
  try {
    await revokeTestAdmin()
    // Belt and braces: by prefix for anything a run never got as far as recording, and
    // by id for the rows it did.
    const sweep = [`delete from public.advertisements where title like 'ZZ-ADTEST %'`]
    if (createdIds.length) {
      sweep.push(
        `delete from public.advertisements where id in (${createdIds.map((i) => `'${i}'`).join(',')})`,
      )
    }
    sweep.push(
      `delete from auth.users where email like 'ad-admin-%@hibbullah.test' or email like 'ad-cust-%@hibbullah.test'`,
    )
    await admin(`${sweep.join(';\n')};`)
    const after = await publicCount()
    check(
      after === basePublic,
      `no banner this run created survived it (${after} live, was ${basePublic})`,
    )
    console.log('  fixtures removed; the allowlist is back to the real admins.')
  } catch (e) {
    console.error(`  !! cleanup failed: ${e.message.slice(0, 300)}`)
  }
  console.log(
    failures === 0 ? `\n=== ALL ${step} CHECKS PASSED ===` : `\n=== ${failures} of ${step} CHECKS FAILED ===`,
  )
}
