// Deletes Cloudinary assets.
//
// The app can upload to Cloudinary with an unsigned preset, but `destroy` requires
// CLOUDINARY_API_SECRET, and that secret must never ship inside a client bundle. This
// function is the only place the secret lives, and the only place a client is allowed
// to ask for an asset to be removed.
//
// It never deletes a public id on the caller's word. Every target must start with a
// prefix the server builds itself -- `avatars/<the caller's own uid>` or
// `products/<a product id the caller is proven to administer>` -- and the remainder
// must look like the suffix this app generates. A well-formed id belonging to someone
// else is refused, because a UUID pattern alone would happily accept it.
//
// ── Why uploads use a fresh public id every time ──────────────────────────────────
// An unsigned upload cannot overwrite. `overwrite` is not in Cloudinary's unsigned
// parameter allowlist, and omitting it does not fall back to replacing the asset: the
// upload succeeds, returns the *existing* asset's version, and Cloudinary keeps serving
// the previous bytes. A stable `avatars/<uid>` public id therefore looks like it works
// while silently showing a stale picture. (Verified against the live account: two
// different images uploaded to one public id produced one asset, one version, and the
// first image's bytes.)
//
// So each upload gets a unique suffix and the superseded asset is deleted here instead,
// which is why `previousPublicId` is accepted -- but only after ownership is proven.
//
// Request:
//   { scope: 'avatar' }
//   { scope: 'avatar', previousPublicId?: string }   // replace: drop just the old one
//   { scope: 'product', productId: string }
//   { scope: 'product', productId: string, previousPublicId?: string }
// Response:
//   { destroyed: boolean, count?: number, reason?: string }

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CLOUDINARY_CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME') ?? ''
const CLOUDINARY_API_KEY = Deno.env.get('CLOUDINARY_API_KEY') ?? ''
const CLOUDINARY_API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET') ?? ''

const AVATAR_FOLDER = 'avatars'
const PRODUCT_FOLDER = 'products'

const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UUID = new RegExp(`^${UUID_SOURCE}$`, 'i')

/** The suffix `uploadSuffix()` in the app appends to a public id. */
const SUFFIX = /^[A-Za-z0-9_-]+$/

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function authHeader(): string {
  return `Basic ${btoa(`${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}`)}`
}

/**
 * The only public id this function will ever destroy under `prefix`.
 *
 * `prefix` comes from server-side facts (the verified uid, or a product id already
 * checked against the caller's admin role), never from the request body, so this is
 * the ownership check: the id must be inside the caller's own folder *and* carry
 * nothing but the generated suffix. Testing the shape with a UUID regex instead would
 * let a client destroy any user's file, since every one of them is a valid UUID.
 */
function isOwned(publicId: unknown, prefix: string): publicId is string {
  if (typeof publicId !== 'string' || !publicId.startsWith(prefix)) return false
  const suffix = publicId.slice(prefix.length)
  return suffix.length > 0 && SUFFIX.test(suffix)
}

/** Cloudinary's `destroy` API, authenticated with the API secret. */
async function destroyAsset(publicId: string): Promise<boolean> {
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`,
    {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        public_id: publicId,
        timestamp: String(Math.floor(Date.now() / 1000)),
      }),
    },
  )

  if (!response.ok) return false
  const data = (await response.json().catch(() => null)) as { result?: string } | null
  // "ok" means removed and "not found" means there was nothing to remove. Both leave
  // the file gone, which is the outcome the caller wanted, so neither is an error.
  return data?.result === 'ok' || data?.result === 'not found'
}

/**
 * Every asset this function is allowed to touch under `prefix`, for the case where a
 * picture is *removed* rather than replaced and the superseded ids are not known.
 *
 * `type=upload` is required: Cloudinary answers 400 "Missing required parameter - type"
 * without it. That failure mode matters, because an error swallowed into an empty list
 * would report a clean wipe having destroyed nothing while the files stayed put. So the
 * failure is returned rather than defaulted.
 */
async function listOwned(
  prefix: string,
): Promise<{ ok: true; ids: string[] } | { ok: false; status: number }> {
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/image` +
      `?type=upload&prefix=${encodeURIComponent(prefix)}&max_results=100`,
    { headers: { Authorization: authHeader() } },
  )

  if (!response.ok) return { ok: false, status: response.status }
  const data = (await response.json().catch(() => null)) as
    | { resources?: { public_id?: string }[] }
    | null

  // The ids come from Cloudinary, but they are the thing being deleted, so each one is
  // re-checked against the caller's prefix before it is destroyed.
  return {
    ok: true,
    ids: (data?.resources ?? [])
      .map((r) => r.public_id ?? '')
      .filter((id) => isOwned(id, prefix)),
  }
}

/**
 * Destroy everything this caller owns under `prefix`.
 *
 * `destroyed` means "the requested end state now holds" -- nothing of the caller's is
 * left -- so it is true whether files were removed or the folder was already clean.
 * `count` is how many were actually removed by this call, which is what tells the two
 * apart. Reporting `destroyed: false` for an already-empty folder would contradict the
 * single-asset path, where Cloudinary's "not found" is explicitly treated as success,
 * and would make the endpoint non-idempotent for a caller that checks the result.
 */
async function clearPrefix(prefix: string): Promise<Response> {
  const listed = await listOwned(prefix)
  if (!listed.ok) {
    // Never reported as a clean wipe. Swallowing a listing failure into an empty list
    // would claim success having destroyed nothing, leaving the files in place while
    // the caller believes they are gone.
    return json({ destroyed: false, reason: 'list_failed', status: listed.status }, 502)
  }
  await Promise.all(listed.ids.map((id) => destroyAsset(id)))
  return json({ destroyed: true, count: listed.ids.length })
}

/** Destroy one asset, but only if the server-derived prefix says it is the caller's. */
async function destroyOwned(
  publicId: unknown,
  prefix: string,
): Promise<{ destroyed: boolean }> {
  if (!isOwned(publicId, prefix)) return { destroyed: false }
  return { destroyed: await destroyAsset(publicId) }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return json({ destroyed: false, reason: 'function_not_configured' }, 500)
  }

  const auth = request.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) {
    return json({ destroyed: false, reason: 'missing_token' }, 401)
  }

  // Verify the caller with the anon key so the uid comes from a validated token.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: auth } } },
  )

  const { data: userData, error: userError } = await userClient.auth.getUser()
  const userId = userData?.user?.id
  if (userError || !userId) {
    return json({ destroyed: false, reason: 'invalid_token' }, 401)
  }

  let payload: { scope?: string; productId?: string; previousPublicId?: string }
  try {
    payload = await request.json()
  } catch {
    return json({ destroyed: false, reason: 'invalid_body' }, 400)
  }

  if (payload.scope === 'avatar') {
    const prefix = `${AVATAR_FOLDER}/${userId}-`
    if (payload.previousPublicId) {
      return json(await destroyOwned(payload.previousPublicId, prefix))
    }
    return await clearPrefix(prefix)
  }

  if (payload.scope === 'product') {
    const productId = payload.productId
    if (!productId || !UUID.test(productId)) {
      return json({ destroyed: false, reason: 'invalid_product_id' }, 400)
    }

    // Product deletion is an admin action. Checked here with the service role, since the
    // caller's own session only sees products, not the roles behind them.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (profile?.role !== 'admin') {
      return json({ destroyed: false, reason: 'not_authorized' }, 403)
    }

    const prefix = `${PRODUCT_FOLDER}/${productId}-`
    if (payload.previousPublicId) {
      return json(await destroyOwned(payload.previousPublicId, prefix))
    }
    return await clearPrefix(prefix)
  }

  return json({ destroyed: false, reason: 'unknown_scope' }, 400)
})
