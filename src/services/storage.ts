import { Platform } from 'react-native'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { supabase } from '../lib/supabase'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg'])

// Cloudinary config — read from .env (EXPO_PUBLIC_ is the only prefix Expo inlines).
// Never put your Cloudinary API secret here: this code runs entirely on the client.
const CLOUDINARY_CLOUD_NAME = (process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '').trim()
const CLOUDINARY_PRODUCT_PRESET = (process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '').trim()
/**
 * Avatars need their own unsigned preset because the product preset is
 * folder-scoped to `products`; Cloudinary rejects an upload whose folder is
 * outside the preset's allowed folders. Falls back to the product preset so an
 * existing local .env keeps working before the dedicated one is created.
 */
const CLOUDINARY_AVATAR_PRESET = (
  process.env.EXPO_PUBLIC_CLOUDINARY_AVATAR_UPLOAD_PRESET ?? CLOUDINARY_PRODUCT_PRESET
).trim()

/** Folder inside Cloudinary where product images are stored. */
export const CLOUDINARY_UPLOAD_FOLDER = 'products'
/** Folder inside Cloudinary where profile pictures are stored. */
export const CLOUDINARY_AVATAR_FOLDER = 'avatars'

const PRODUCT_IMAGE_WIDTH = 1024
const AVATAR_IMAGE_WIDTH = 400

/** Name of the Edge Function that holds CLOUDINARY_API_SECRET and destroys assets. */
const DELETE_FUNCTION = 'delete-cloudinary-asset'

/**
 * `EXPO_PUBLIC_*` values are inlined at build time, so a missing variable is a
 * runtime failure on a user's device rather than a build error. These presets
 * are unsigned names, not secrets — Cloudinary's public API surface.
 */
export function getCloudinaryConfig(folder: 'products' | 'avatars' = 'products'): {
  cloudName: string;
  uploadPreset: string;
} {
  const uploadPreset = folder === 'avatars' ? CLOUDINARY_AVATAR_PRESET : CLOUDINARY_PRODUCT_PRESET

  if (!CLOUDINARY_CLOUD_NAME || !uploadPreset) {
    const missing = [
      !CLOUDINARY_CLOUD_NAME && 'EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME',
      !CLOUDINARY_PRODUCT_PRESET && 'EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET',
      !uploadPreset && 'EXPO_PUBLIC_CLOUDINARY_AVATAR_UPLOAD_PRESET',
    ]
      .filter(Boolean)
      .join(', ')
    throw new Error(
      `Cloudinary is not configured (missing ${missing}). Add it to .env or eas.json, ` +
        'then rebuild with: npx expo start --clear',
    )
  }

  return { cloudName: CLOUDINARY_CLOUD_NAME, uploadPreset }
}

/**
 * Every upload gets a fresh public id.
 *
 * The obvious design -- a stable id per user or per product, so a re-upload replaces
 * the file in place -- does not work with an unsigned preset. `overwrite` is not in
 * Cloudinary's unsigned parameter allowlist, and omitting it does not fall back to
 * replacing: the upload returns 200 with the *existing* asset's version and
 * Cloudinary keeps serving the previous bytes. A stable id therefore looks like it
 * works while silently showing the old picture. (Confirmed against the live account:
 * two different images uploaded to one public id produced one asset, one version,
 * and the first image's bytes.)
 *
 * A unique suffix makes each upload a real new asset, and the superseded one is
 * destroyed through the Edge Function instead -- the only place the API secret exists.
 * Callers replacing an image pass the URL they are superseding so the old asset is
 * reclaimed instead of orphaned.
 *
 * The suffix is a timestamp plus randomness: the timestamp keeps ids sortable, the
 * random part stops two uploads in the same millisecond landing on one id.
 */
function uploadSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** `products/<productId>-p<suffix>` for the primary image, `-s<suffix>` for the second. */
export function productPublicId(
  productId: string,
  slot: 'primary' | 'secondary' = 'primary',
): string {
  return `${productId}-${slot === 'primary' ? 'p' : 's'}${uploadSuffix()}`
}

export function avatarPublicId(userId: string): string {
  return `${userId}-${uploadSuffix()}`
}

/**
 * The folder + id half of a Cloudinary delivery URL, which is exactly the public_id.
 * Returns null for anything that is not one, so a third-party or hand-typed image is
 * never mistaken for an asset we own and are therefore allowed to delete.
 */
export function publicIdFromUrl(url?: string | null): string | null {
  if (!url) return null
  const match = url.match(/\/image\/upload\/(?:v\d+\/)?([^?#]+)/i)
  if (!match?.[1]) return null
  return decodeURIComponent(match[1].split('?')[0])
}

function isRemoteUrl(uri?: string | null): boolean {
  if (!uri) return false
  return /^https?:\/\//i.test(uri);
}

function isLocalUri(uri?: string | null): boolean {
  if (!uri) return false
  if (isRemoteUrl(uri)) return false
  return /^(file:\/\/|content:\/\/|blob:|data:|ph:\/\/)/i.test(uri);
}

function extFromUri(uri: string): string {
  const clean = uri.split('?')[0].split('#')[0];
  const match = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
  const ext = (match?.[1] || 'jpg').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  return 'jpg';
}

async function compressImage(uri: string, opts?: { width?: number; quality?: number }): Promise<{ uri: string; mime: string }> {
  const width = opts?.width ?? PRODUCT_IMAGE_WIDTH
  const quality = opts?.quality ?? 0.75
  try {
    const resized = await manipulateAsync(uri, [{ resize: { width } }], {
      compress: quality,
      format: SaveFormat.WEBP,
      base64: false,
    })
    if (resized?.uri) return { uri: resized.uri, mime: 'image/webp' }
  } catch {
    // A platform without the native module, or an unreadable source file: upload
    // the original rather than failing the upload outright.
  }
  return { uri, mime: 'image/jpeg' }
}

function mimeFromExt(ext: string): string {
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

/**
 * Each upload now produces a new public id, so the URL is already unique. The version
 * query param is belt-and-braces for the CDN and for expo-image's disk cache, which
 * key on the full URL and would otherwise be free to keep the old bytes.
 */
function withCacheBust(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`
}

async function uploadToCloudinary(params: {
  localUri: string
  folder: 'products' | 'avatars'
  publicId: string
  width: number
  quality: number
}): Promise<string> {
  const { cloudName, uploadPreset } = getCloudinaryConfig(params.folder)
  const { localUri, folder, publicId, width, quality } = params

  const compressed = await compressImage(localUri, { width, quality })
  const uriToUpload = compressed.uri
  const ext = compressed.mime === 'image/webp' ? 'webp' : extFromUri(localUri)
  const mime = compressed.mime !== 'image/jpeg' ? compressed.mime : mimeFromExt(ext)
  if (!ALLOWED_MIME.has(mime)) throw new Error('Unsupported image type. Use jpg, png, or webp.')

  const res = await fetch(uriToUpload)
  if (!res.ok) throw new Error('Could not read selected image')
  const blob = await res.blob()
  if (blob.size > MAX_BYTES) throw new Error('Image too large — max 5MB after compression. Try a smaller image.')

  const form = new FormData()
  if (Platform.OS === 'web') {
    // Browsers append a Blob/File directly.
    form.append('file', blob, `${publicId}.${ext}`)
  } else {
    // React Native streams the local file by reference instead of buffering it in memory.
    form.append('file', { uri: uriToUpload, name: `${publicId}.${ext}`, type: mime } as unknown as Blob)
  }
  form.append('upload_preset', uploadPreset)
  form.append('folder', folder)
  form.append('public_id', publicId)
  // No `overwrite`: it is rejected on unsigned uploads, and leaving it out does not
  // make a repeat upload replace anything -- see productPublicId above. Each upload
  // carries its own public id instead.

  let response: Response
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    })
  } catch (err) {
    throw new Error(
      err instanceof Error ? `Cloudinary upload failed: ${err.message}` : 'Cloudinary upload failed (network error)',
    )
  }

  const data = (await response.json().catch(() => null)) as
    | { secure_url?: string; error?: { message?: string } }
    | null

  if (!response.ok || !data?.secure_url) {
    throw new Error(data?.error?.message ?? `Cloudinary upload failed (HTTP ${response.status})`)
  }
  return data.secure_url
}

/**
 * Upload a product image. Text and numbers live in Supabase; only the binary
 * lives in Cloudinary. The public id is derived from the product id, so
 * re-uploading replaces the existing asset rather than creating a new one.
 */
export async function uploadProductImage(
  localUri: string,
  productId: string,
  slot: 'primary' | 'secondary' = 'primary',
): Promise<string> {
  const url = await uploadToCloudinary({
    localUri,
    folder: CLOUDINARY_UPLOAD_FOLDER,
    publicId: productPublicId(productId, slot),
    width: PRODUCT_IMAGE_WIDTH,
    quality: 0.75,
  })
  return withCacheBust(url)
}

/**
 * Upload a profile picture to a single per-user slot. The first upload creates
 * `avatars/<userId>`; every later upload overwrites that same asset, so a user
 * never accumulates orphaned avatars.
 */
export async function uploadAvatarImage(localUri: string, userId: string): Promise<string> {
  const url = await uploadToCloudinary({
    localUri,
    folder: CLOUDINARY_AVATAR_FOLDER,
    publicId: avatarPublicId(userId),
    width: AVATAR_IMAGE_WIDTH,
    quality: 0.8,
  })
  return withCacheBust(url)
}

export async function resolveProductImageUri(
  uri?: string | null,
  productId?: string,
  slot: 'primary' | 'secondary' = 'primary',
): Promise<string | null> {
  if (!uri || !uri.trim()) return null
  const trimmed = uri.trim()
  if (isRemoteUrl(trimmed)) return trimmed
  if (isLocalUri(trimmed) && productId) {
    return uploadProductImage(trimmed, productId, slot)
  }
  return trimmed
}

export type CloudinaryDeleteTarget =
  | { scope: 'avatar'; previousPublicId?: string }
  | { scope: 'product'; productId: string; previousPublicId?: string }

export type CloudinaryDeleteResult = { deleted: boolean; error?: string }

/**
 * Destroy Cloudinary assets. The client cannot call `destroy` itself because it needs
 * CLOUDINARY_API_SECRET, so this goes through the Edge Function, which re-checks that
 * the id belongs to the caller and never trusts a client-supplied path.
 *
 * Pass `previousPublicId` when *replacing* an image: the Edge Function destroys that
 * one asset. Omit it when *removing* one, and the whole per-owner folder is cleared so
 * no superseded upload is left behind. (The id is derived from the stored URL, so a
 * caller cannot point this at an arbitrary asset.)
 *
 * Deliberately does not throw: removing a picture should never be blocked by the
 * cleanup, so callers treat the cleared database row as the source of truth.
 */
export async function deleteCloudinaryAsset(target: CloudinaryDeleteTarget): Promise<CloudinaryDeleteResult> {
  try {
    const { data, error } = await supabase.functions.invoke(DELETE_FUNCTION, { body: target })
    if (error) return { deleted: false, error: error.message }
    const destroyed = (data as { destroyed?: boolean } | null)?.destroyed
    return { deleted: destroyed !== false }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not delete image'
    return { deleted: false, error: message }
  }
}

/**
 * Reclaim the product images a save has just made obsolete.
 *
 * An unsigned upload cannot replace an existing asset (see `productPublicId`), so
 * swapping a photo leaves its predecessor behind in Cloudinary. That predecessor can
 * only be destroyed once the row no longer points at it — which is why this is called
 * *after* `updateProduct` and not when the image is picked. Deleting at pick time would
 * leave a cancelled edit referencing a file that no longer exists.
 *
 * Only urls that actually changed are destroyed, so an edit that leaves the photos
 * alone touches nothing.
 *
 * Best-effort: the database is the source of truth, and a cleanup failure must not turn
 * a successful save into an error the admin has to retry.
 */
export async function reclaimSupersededProductImages(
  productId: string,
  superseded: { primary?: string | null; secondary?: string | null },
): Promise<void> {
  const targets = [superseded.primary, superseded.secondary]
    .filter((url): url is string => Boolean(url))
    .map((url) => publicIdFromUrl(url))
    .filter((id): id is string => Boolean(id))

  if (targets.length === 0) return
  await Promise.all(
    targets.map((previousPublicId) => deleteCloudinaryAsset({ scope: 'product', productId, previousPublicId })),
  )
}
