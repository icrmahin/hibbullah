/**
 * The real profile-picture lifecycle, end to end against the live stack.
 *
 * This is the exact flow the user reported as broken, plus the case that was hiding
 * behind the visible error: replacing a picture with a *different* one and proving
 * the new bytes are actually served and the old asset is actually reclaimed.
 */

import { deflateSync } from 'node:zlib'

const REF = 'xkvjhvwrzfczymbgapip'
const BASE = `https://${REF}.supabase.co`
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

// A real PNG of a solid colour, so "did the bytes change" is actually measurable.
function solidPng(red, green, blue) {
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, red, green, blue]))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const RED = solidPng(255, 0, 0)
const GREEN = solidPng(0, 255, 0)

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

/** Mirrors uploadToCloudinary: unsigned, no overwrite, unique public id. */
async function uploadAvatar(uid, buf) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const publicId = `${uid}-${suffix}`
  const form = new FormData()
  form.append('file', new Blob([buf], { type: 'image/png' }), 'a.png')
  form.append('upload_preset', 'hibbullah_avatars')
  form.append('folder', 'avatars')
  form.append('public_id', publicId)
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, {
    method: 'POST',
    body: form,
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, public_id: j.public_id, version: j.version, error: j.error?.message }
}

/** publicIdFromUrl, as the app derives it. */
function publicIdFromUrl(url) {
  const m = url.match(/\/image\/upload\/(?:v\d+\/)?([^?#]+)/i)
  return m?.[1] ? decodeURIComponent(m[1].split('?')[0]) : null
}

/** Fetch the delivered bytes and fingerprint them. */
async function fingerprint(url) {
  const r = await fetch(url)
  if (!r.ok) return `http-${r.status}`
  const b = Buffer.from(await r.arrayBuffer())
  return b.subarray(0, 4096).toString('hex')
}

async function countAssets(prefix) {
  // `type=upload` is mandatory: without it Cloudinary answers 400 and this helper
  // returns [], which would make every "nothing left behind" assertion pass vacuously.
  const r = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD}/resources/image?type=upload&prefix=${encodeURIComponent(prefix)}&max_results=100`,
    { headers: { Authorization: `Basic ${Buffer.from(`${KEY}:${SECRET}`).toString('base64')}` } },
  )
  if (!r.ok) throw new Error(`list ${prefix} -> HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  return j.resources?.map((x) => x.public_id) ?? []
}

const stamp = Date.now()
const EMAIL = `pic-${stamp}@hibbullah.test`
const PASSWORD = `Pic-${stamp}-Aa1!`
let userId = null
let otherUserId = null

console.log('=== profile picture lifecycle ===\n')
try {
  await api('/auth/v1/signup', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })
  const s = JSON.parse(
    (await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })).text,
  )
  const token = s.access_token
  userId = s.user.id
  check(Boolean(token && userId), `signed in as ${EMAIL}`)

  // 1. First upload — the case the user reported as erroring.
  const up1 = await uploadAvatar(userId, RED)
  check(up1.status === 200, `first avatar upload succeeds without \`overwrite\` (HTTP ${up1.status} ${up1.error ?? ''})`)
  check(up1.public_id.startsWith(`avatars/${userId}-`), `unique public id under the caller's folder (${up1.public_id})`)

  const url1 = `https://res.cloudinary.com/${CLOUD}/image/upload/${up1.public_id}?v=${Date.now()}`
  await api(`/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    token,
    body: { avatar_url: url1 },
  })
  const stored1 = JSON.parse(
    (await api(`/rest/v1/profiles?select=avatar_url&id=eq.${userId}`, { token })).text,
  )[0]
  check(stored1?.avatar_url === url1, 'avatar_url saved to the profile row')
  const fp1 = await fingerprint(url1)
  check(fp1.startsWith('89504e47'), 'the stored URL serves a real PNG')

  // 2. Replace with a genuinely different image. This is the case that was silently
  //    broken: same stable public id, no overwrite -> old bytes kept being served.
  const up2 = await uploadAvatar(userId, GREEN)
  check(up2.status === 200, `replacement upload succeeds (HTTP ${up2.status})`)
  check(up2.public_id !== up1.public_id, 'replacement got a different public id')
  check(up2.version !== up1.version, `a new asset version was created (${up1.version} -> ${up2.version})`)

  const url2 = `https://res.cloudinary.com/${CLOUD}/image/upload/${up2.public_id}?v=${Date.now()}`
  const fp2 = await fingerprint(url2)
  check(fp2 !== fp1, 'the replacement URL serves DIFFERENT bytes (the old bug served stale)')

  // The old asset must be reclaimed by passing the previous public id.
  const before = await countAssets(`avatars/${userId}`)
  check(before.length === 2, `both assets exist before cleanup (${before.length})`)

  const prevId = publicIdFromUrl(url1)
  check(prevId === up1.public_id, `publicIdFromUrl extracts the id the app will send (${prevId})`)

  const del = await api('/functions/v1/delete-cloudinary-asset', {
    method: 'POST',
    token,
    body: { scope: 'avatar', previousPublicId: prevId },
  })
  check(del.status === 200 && JSON.parse(del.text).destroyed === true, `previous asset destroyed (${del.text.slice(0, 60)})`)

  const after = await countAssets(`avatars/${userId}`)
  check(after.length === 1 && after[0] === up2.public_id, `only the current asset remains (${after.join(', ')})`)

  // 3. Another user's avatar must survive an attempt to delete it. This is the hole a
  //    UUID-shaped regex would leave open: every avatar id is a valid UUID, so shape
  //    alone proves nothing. The asset is checked afterwards, not just the response --
  //    a function could answer "refused" and still have destroyed the file.
  const otherEmail = `pic2-${stamp}@hibbullah.test`
  const otherPassword = `Pic-${stamp}-Bb2!`
  await api('/auth/v1/signup', {
    method: 'POST',
    body: { email: otherEmail, password: otherPassword },
  })
  const otherSession = JSON.parse(
    (await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: otherEmail, password: otherPassword },
    })).text,
  )
  otherUserId = otherSession.user.id
  const otherUp = await uploadAvatar(otherUserId, RED)
  check(otherUp.status === 200, `second user signed up and uploaded (${otherUserId})`)

  const foreign = await api('/functions/v1/delete-cloudinary-asset', {
    method: 'POST',
    token,
    body: { scope: 'avatar', previousPublicId: otherUp.public_id },
  })
  check(
    foreign.status === 200 && JSON.parse(foreign.text).destroyed === false,
    `another user's avatar id is refused (${foreign.text.slice(0, 60)})`,
  )
  check(
    (await countAssets(`avatars/${otherUserId}`)).includes(otherUp.public_id),
    "the other user's avatar file still exists after the refused request",
  )

  // A whole-folder wipe aimed at someone else must not reach them either. The prefix is
  // built from the caller's uid, so this can only ever clear the caller's own folder.
  const foreignWipe = await api('/functions/v1/delete-cloudinary-asset', {
    method: 'POST',
    token,
    body: { scope: 'avatar', previousPublicId: `avatars/${otherUserId}-sneaky` },
  })
  check(
    JSON.parse(foreignWipe.text).destroyed === false,
    'a foreign id inside a wipe-shaped request is still refused',
  )

  // 4. Removing the picture clears the caller's whole folder, so nothing is orphaned.
  const wipe = await api('/functions/v1/delete-cloudinary-asset', {
    method: 'POST',
    token,
    body: { scope: 'avatar' },
  })
  const wipeJson = JSON.parse(wipe.text)
  check(
    wipe.status === 200 && wipeJson.destroyed === true,
    `removing the picture wipes the folder (${wipe.text.slice(0, 70)})`,
  )
  check(wipeJson.count === 1, `the wipe found the one live asset, not zero (count=${wipeJson.count})`)
  check((await countAssets(`avatars/${userId}`)).length === 0, 'no avatar assets left in Cloudinary')
} catch (e) {
  console.error(`\nERROR: ${e.message}`)
  process.exitCode = 1
} finally {
  for (const id of [userId, otherUserId]) {
    if (!id) continue
    await admin(`delete from public.audit_entries where actor_id = '${id}'`)
    await admin(`delete from auth.users where id = '${id}'`)
    // Leave nothing behind in Cloudinary either, even on a failed run.
    const list = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD}/resources/image?type=upload&prefix=${encodeURIComponent(`avatars/${id}`)}&max_results=100`,
      { headers: { Authorization: `Basic ${Buffer.from(`${KEY}:${SECRET}`).toString('base64')}` } },
    ).then((r) => r.json())
    for (const r of list.resources ?? []) {
      await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/destroy`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${KEY}:${SECRET}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ public_id: r.public_id }),
      })
    }
  }
  console.log('\nCleaned up.')
}

console.log(process.exitCode ? '\n=== SOME CHECKS FAILED ===' : '\n=== ALL CHECKS PASSED ===')
