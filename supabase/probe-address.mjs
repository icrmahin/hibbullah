#!/usr/bin/env node
/**
 * Reproduce the address-adding bug against the live project, through the exact path the
 * app uses: a real signed-in customer JWT, and the exact body `toDbAddress()` builds.
 *
 * Deliberately NOT a hand-written PostgREST call -- last time a probe "proved" the app
 * was fine when the app was broken, because the probe had omitted `user_id`. Everything
 * here mirrors src/services/addresses.ts field for field.
 */
import { env } from 'node:process'

const PROJECT_REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`
const PUBLISHABLE = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const MGMT = env.HIBBULLAH_SUPABASE_TOKEN

const stamp = Date.now()
const EMAIL = `addrprobe-${stamp}@hibbullah.test`
const PASSWORD = `AddrProbe-${stamp}-Aa1!`

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

async function api(path, { method = 'GET', token, body, prefer } = {}) {
  const headers = {
    apikey: PUBLISHABLE,
    Authorization: `Bearer ${token ?? PUBLISHABLE}`,
    'Content-Type': 'application/json',
  }
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, text: await res.text() }
}

const stampOut = (n, pad = 2) => String(n).padStart(pad, '0')
let step = 0
const check = (cond, m, extra = '') =>
  console.log(`  ${stampOut(++step)}. ${cond ? 'PASS' : 'FAIL'}  ${m}${extra ? `\n        ${extra}` : ''}`)

let userId = null
try {
  // ── sign up a throwaway customer, exactly as the app does ──────────────────────
  const signUp = await api('/auth/v1/signup', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  })
  check(signUp.status === 200, `signed up ${EMAIL} (HTTP ${signUp.status})`, signUp.text.slice(0, 300))
  if (signUp.status !== 200) process.exit(1)

  const signIn = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  })
  const session = JSON.parse(signIn.text)
  const token = session.access_token
  userId = session.user?.id
  check(Boolean(token), `signed in, got a user JWT (${userId})`, signIn.text.slice(0, 200))
  if (!token) process.exit(1)

  // Does the signup trigger have created the profile? RLS on addresses does not need
  // it, but it is the first place a broken trigger would show.
  const profile = await api('/rest/v1/profiles?select=id,role', { token })
  console.log(`        profile row: ${profile.text.slice(0, 200)}`)

  // ── the exact body src/services/addresses.ts:toDbAddress() builds ──────────────
  // Only the keys the Address type declares, plus user_id. Nothing invented.
  const formInput = {
    street: 'House 12, Road 5, Dhanmondi',
    city: 'Dhaka',
    county: 'Dhaka',
    postalCode: '1205',
    label: 'Home',
    isDefault: false,
  }
  const body = {
    label: formInput.label.trim() || 'Home',
    street: formInput.street.trim(),
    city: formInput.city.trim(),
    county: formInput.county.trim(),
    postal_code: formInput.postalCode.trim(),
    is_default: formInput.isDefault,
    user_id: userId,
  }
  console.log(`\n  posting exactly what the app posts:\n  ${JSON.stringify(body)}\n`)

  const insert = await api('/rest/v1/addresses', { method: 'POST', token, body, prefer: 'return=representation' })
  check(insert.status === 201, `POST /rest/v1/addresses succeeded (HTTP ${insert.status})`, insert.text.slice(0, 400))

  // ── does the app's own read-back see it? ───────────────────────────────────────
  const list = await api(`/rest/v1/addresses?select=*&user_id=eq.${userId}`, { token })
  const rows = JSON.parse(list.text || '[]')
  check(Array.isArray(rows) && rows.length === 1, `the address is readable back (${rows.length} row)`, list.text.slice(0, 300))

  // ── the phone-format trigger, if addresses has one ────────────────────────────
  const cols = JSON.parse(await admin(`select column_name from information_schema.columns where table_schema='public' and table_name='addresses'`))
  const names = cols.map((c) => c.column_name)
  console.log(`        addresses columns: ${names.join(', ')}`)

  // ── what does create_order do with an address? ────────────────────────────────
  const orderDef = JSON.parse(await admin(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_order'`))[0]?.d || ''
  console.log(`\n  create_order body (first 40 lines):`)
  console.log(orderDef.split('\n').slice(0, 40).map((l) => '        ' + l).join('\n'))

  // ── constraints on addresses that could reject a legitimate insert ────────────
  console.log(`\n  checks/constraints on addresses:`)
  console.log(
    (
      await admin(
        `select con.conname, pg_get_constraintdef(con.oid) def from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
         where n.nspname='public' and rel.relname='addresses' and con.contype in ('c','f','u')`,
      )
    )
      .trim()
      .split('\n')
      .map((l) => '        ' + l)
      .join('\n'),
  )
} catch (error) {
  console.error(`\nERROR: ${error.message}`)
  process.exitCode = 1
} finally {
  if (userId) {
    try {
      await admin(`delete from public.audit_entries where actor_id = '${userId}'`)
      await admin(`delete from public.notifications where user_id = '${userId}'`)
      await admin(`delete from public.addresses where user_id = '${userId}'`)
      await admin(`delete from public.carts where user_id = '${userId}'`)
      await admin(`delete from auth.users where id = '${userId}'`)
      console.log(`\nCleaned up ${EMAIL}`)
    } catch (e) {
      console.error(`  !! cleanup failed: ${e.message}`)
    }
  }
}
