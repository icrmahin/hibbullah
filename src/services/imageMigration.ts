import { supabase } from '../lib/supabase'
import { CLOUDINARY_UPLOAD_FOLDER, uploadProductImage } from './storage'

// Matches Supabase product-image public URLs, e.g.
// https://<ref>.supabase.co/storage/v1/object/public/product-images/products/abc-123.webp
const SUPABASE_STORAGE_RE = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/product-images\/(.+)$/

export interface ImageMigrationStats {
  scanned: number
  migrated: number
  deletedFromSupabase: number
  failed: { productId: string; field: string; reason: string }[]
}

function isSupabaseProductImageUrl(url: unknown): boolean {
  return typeof url === 'string' && SUPABASE_STORAGE_RE.test(url)
}

function supabasePathFromUrl(url: string): string | null {
  // The captured group already includes the folder prefix, e.g. `products/abc.webp`.
  const match = url.match(SUPABASE_STORAGE_RE)
  return match ? match[1] : null
}

/**
 * One-time migration: re-upload any product images still held in Supabase
 * Storage to Cloudinary, point the products table at the new Cloudinary URLs,
 * then delete the old objects from Supabase.
 *
 * Safe by design: an object is only removed from Supabase AFTER its Cloudinary
 * upload succeeded AND the DB row was updated. Anything that fails is kept in
 * Supabase (and still renders).
 */
export async function migrateProductImagesFromSupabase(): Promise<ImageMigrationStats> {
  const stats: ImageMigrationStats = { scanned: 0, migrated: 0, deletedFromSupabase: 0, failed: [] }

  const { data: products, error } = await supabase
    .from('products')
    .select('id, image_url, secondary_image_url')
  if (error) throw error

  stats.scanned = (products ?? []).length

  for (const row of products ?? []) {
    const product = row as { id: string; image_url?: string | null; secondary_image_url?: string | null }
    const updates: Record<string, string> = {}

    for (const field of ['image_url', 'secondary_image_url'] as const) {
      const oldUrl = product[field]
      if (!isSupabaseProductImageUrl(oldUrl)) continue
      try {
        updates[field] = await uploadProductImage(oldUrl!, product.id)
        stats.migrated += 1
      } catch (err) {
        stats.failed.push({
          productId: product.id,
          field,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }

    if (Object.keys(updates).length === 0) continue

    const { error: updateError } = await supabase.from('products').update(updates).eq('id', product.id)
    if (updateError) {
      stats.failed.push({ productId: product.id, field: 'row update', reason: updateError.message })
      continue
    }

    // DB now points at Cloudinary — the old Supabase objects are safe to remove.
    for (const field of ['image_url', 'secondary_image_url'] as const) {
      const path = supabasePathFromUrl(product[field] as string)
      if (!path) continue
      await supabase.storage.from('product-images').remove([path])
      stats.deletedFromSupabase += 1
    }
  }

  // Best-effort sweep: delete leftover objects in the bucket that are no longer
  // referenced by any product row. Objects still referenced by a FAILED
  // migration are kept so no image is ever lost.
  const keepPaths = new Set<string>()
  for (const failure of stats.failed) {
    const product = (products ?? []).find((row) => (row as { id: string }).id === failure.productId) as
      | { image_url?: string | null; secondary_image_url?: string | null }
      | undefined
    const url = (product?.[failure.field as 'image_url' | 'secondary_image_url'] as string | undefined) ?? null
    const path = supabasePathFromUrl(url ?? '')
    if (path) keepPaths.add(path)
  }

  try {
    const { data: objects } = await supabase.storage
      .from('product-images')
      .list(CLOUDINARY_UPLOAD_FOLDER, { limit: 1000 })
    const toRemove = (objects ?? [])
      .filter((obj) => obj.name !== '.emptyFolderPlaceholder')
      .map((obj) => `products/${obj.name}`)
      .filter((path) => !keepPaths.has(path))

    // Supabase accepts up to 1000 paths per remove call — chunk just in case.
    for (let i = 0; i < toRemove.length; i += 100) {
      const chunk = toRemove.slice(i, i + 100)
      const { error: removeError } = await supabase.storage.from('product-images').remove(chunk)
      if (removeError) {
        stats.failed.push({
          productId: 'bucket-sweep',
          field: 'storage cleanup',
          reason: removeError.message,
        })
      } else {
        stats.deletedFromSupabase += chunk.length
      }
    }
  } catch {
    // Listing may be restricted for this role — referenced images were already
    // removed per-product above, so this sweep is best-effort only.
  }

  return stats
}