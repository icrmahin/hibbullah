#!/usr/bin/env node
/**
 * Does create_order enforce a delivery address?
 *
 * Four cases, each with its OWN throwaway customer. That isolation is not fussiness:
 * create_order reuses an existing PENDING order for the same customer, so a shared
 * customer makes the second and later calls return the first order's id and every
 * assertion after that measures the wrong row.
 *
 *   1. null address          -- must be refused
 *   2. invented address id   -- must be refused
 *   3. ANOTHER user's address -- must be refused. create_order is SECURITY DEFINER, so it
 *      reads any addresses row regardless of RLS; without an ownership check a customer
 *      can read a stranger's street address by passing its id.
 *   4. own real address      -- must still succeed, with the address text on the order
 *
 * Everything it creates is removed in `finally`.
 */
import { randomUUID } from 'node:crypto'
import { env } from 'node:process'

const PROJECT_REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`
const PUBLISHABLE = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const MGMT = env.HIBBULLAH_SUPABASE_TOKEN

const stamp = Date.now()
const pw = (n) => `Ord-${n}-${stamp}-Aa1!`
const created = { category: null, manufacturer: null, product: null }

let step = 0
let failures = 0
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
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, text: await res.text() }
}

/** A brand new customer with a token, so no earlier order can be reused. */
async function freshCustomer(tag) {
  const email = `ord-${tag}-${randomUUID().slice(0, 8)}@hibbullah.test`
  const password = pw(tag)
  const up = await api('/auth/v1/signup', { method: 'POST', body: { email, password } })
  if (up.status !== 200) throw new Error(`signup ${email}: ${up.text.slice(0, 200)}`)
  const inRes = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })
  const j = JSON.parse(inRes.text)
  if (!j.access_token) throw new Error(`sign-in ${email}: ${inRes.text.slice(0, 200)}`)
  return { email, id: j.user.id, token: j.access_token }
}

async function addAddress(who, { street, city, county, postalCode, label }) {
  const r = await api('/rest/v1/addresses', {
    method: 'POST',
    token: who.token,
    body: { label, street, city, county, postal_code: postalCode, is_default: true, user_id: who.id },
    prefer: 'return=representation',
  })
  const row = JSON.parse(r.text || '[]')[0]
  if (!row) throw new Error(`address insert failed: ${r.status} ${r.text.slice(0, 250)}`)
  return row.id
}

/** Stock the cart, then try to place the order. create_order empties the cart. */
async function attemptOrder(who, addressId) {
  const cart = await api('/rest/v1/cart_items', {
    method: 'POST',
    token: who.token,
    body: { user_id: who.id, product_id: created.product, quantity: 1 },
    prefer: 'return=representation',
  })
  if (cart.status !== 201) throw new Error(`cart insert failed: ${cart.status} ${cart.text.slice(0, 200)}`)
  return api('/rest/v1/rpc/create_order', {
    method: 'POST',
    token: who.token,
    body: { p_customer_id: who.id, p_address_id: addressId },
  })
}

const orderRows = []

try {
  created.category = randomUUID()
  created.manufacturer = randomUUID()
  created.product = randomUUID()
  await admin(
    `insert into public.categories (id, name, slug) values ('${created.category}', 'OrdProbe Cat ${stamp}', 'ordprobe-cat-${stamp}');
     insert into public.manufacturers (id, name) values ('${created.manufacturer}', 'OrdProbe Maker ${stamp}');
     insert into public.products (id, name, brand, generic_name, manufacturer_id, category_id, price, stock, unit, is_active)
     values ('${created.product}', 'OrdProbe Pill ${stamp}', 'OrdProbe', 'probe', '${created.manufacturer}', '${created.category}', 500, 50, 'strip', true);`,
  )
  check(true, `throwaway product in place (${created.product.slice(0, 8)})`)

  // ── case 1: no address at all ─────────────────────────────────────────────────
  const a1 = await freshCustomer('null')
  const r1 = await attemptOrder(a1, null)
  if (r1.status === 200) orderRows.push(JSON.parse(r1.text))
  check(r1.status !== 200, `no delivery address is REFUSED (HTTP ${r1.status})`, r1.text.slice(0, 200))
  if (r1.status === 200) {
    const row = JSON.parse(await admin(`select address from public.orders where id = '${JSON.parse(r1.text)}'`))[0]
    check(false, 'and the order that slipped through was recorded with NO address', `address = ${JSON.stringify(row?.address)}`)
  }

  // ── case 2: an address id belonging to nobody ─────────────────────────────────
  const a2 = await freshCustomer('bogus')
  const r2 = await attemptOrder(a2, randomUUID())
  if (r2.status === 200) orderRows.push(JSON.parse(r2.text))
  check(r2.status !== 200, `an address id that exists nowhere is REFUSED (HTTP ${r2.status})`, r2.text.slice(0, 200))
  if (r2.status === 200) {
    const row = JSON.parse(await admin(`select address from public.orders where id = '${JSON.parse(r2.text)}'`))[0]
    check(false, 'and the order that slipped through was recorded with NO address', `address = ${JSON.stringify(row?.address)}`)
  }

  // ── case 3: another customer's address ───────────────────────────────────────
  const victim = await freshCustomer('victim')
  const victimAddressId = await addAddress(victim, {
    label: 'Victim Home',
    street: '99 CONFIDENTIAL STREET',
    city: 'B City',
    county: 'B County',
    postalCode: '9999',
  })
  const attacker = await freshCustomer('attacker')
  const r3 = await attemptOrder(attacker, victimAddressId)
  if (r3.status === 200) orderRows.push(JSON.parse(r3.text))
  let leaked = null
  if (r3.status === 200) {
    const row = JSON.parse(await admin(`select address from public.orders where id = '${JSON.parse(r3.text)}'`))[0]
    leaked = row?.address ?? null
  }
  check(
    r3.status !== 200 && !String(leaked).includes('CONFIDENTIAL'),
    `ordering to ANOTHER customer's address is REFUSED (HTTP ${r3.status})`,
    r3.status === 200 ? `ACCEPTED. The order now carries: ${JSON.stringify(leaked)}` : r3.text.slice(0, 200),
  )

  // ── case 4: the real thing, which the fix must not break ─────────────────────
  const a4 = await freshCustomer('real')
  const ownAddressId = await addAddress(a4, {
    label: 'Home',
    street: '12 Real Road',
    city: 'Dhaka',
    county: 'Dhaka',
    postalCode: '1205',
  })
  const r4 = await attemptOrder(a4, ownAddressId)
  if (r4.status === 200) orderRows.push(JSON.parse(r4.text))
  check(r4.status === 200, `a customer's own address still places the order (HTTP ${r4.status})`, r4.text.slice(0, 200))
  if (r4.status === 200) {
    const row = JSON.parse(
      await admin(`select address, subtotal, delivery_fee, total, status from public.orders where id = '${JSON.parse(r4.text)}'`),
    )[0]
    check(
      String(row?.address ?? '').includes('12 Real Road'),
      'and the order carries the real address text',
      `address = ${JSON.stringify(row?.address)} · subtotal=${row?.subtotal} · fee=${row?.delivery_fee} · total=${row?.total} · status=${row?.status}`,
    )
  }
} catch (error) {
  console.error(`\nERROR: ${error.message}`)
  process.exitCode = 1
} finally {
  for (const oid of orderRows.filter(Boolean)) {
    try {
      await admin(
        `delete from public.notifications where user_id in (select customer_id from public.orders where id = '${oid}');
         delete from public.audit_entries where record_id = '${oid}';
         delete from public.order_items where order_id = '${oid}';
         delete from public.orders where id = '${oid}';`,
      )
    } catch (e) {
      console.error(`  !! order cleanup ${oid}: ${e.message.slice(0, 140)}`)
    }
  }
  try {
    await admin(
      `delete from public.notifications where user_id in (select id from auth.users where email like 'ord-%@hibbullah.test');
       delete from public.audit_entries where actor_id in (select id from auth.users where email like 'ord-%@hibbullah.test');
       delete from public.cart_items where user_id in (select id from auth.users where email like 'ord-%@hibbullah.test');
       delete from public.audit_entries where record_id in (select id from public.products where name like 'OrdProbe %');
       delete from public.addresses where user_id in (select id from auth.users where email like 'ord-%@hibbullah.test');
       delete from public.inventory_items where product_id = '${created.product}';
       delete from public.products where id = '${created.product}';
       delete from public.categories where id = '${created.category}';
       delete from public.manufacturers where id = '${created.manufacturer}';
       delete from auth.users where email like 'ord-%@hibbullah.test';`,
    )
    console.log(`\nCleaned up ${failures === 0 ? 'everything' : `${failures} assertion(s) failed`}.`)
  } catch (e) {
    console.error(`  !! cleanup failed: ${e.message.slice(0, 200)}`)
  }
}
