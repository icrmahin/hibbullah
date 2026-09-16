import { getSupabase } from "./supabase";

const PRODUCT_BUCKET = "products";

/** Resolve a storage path or full URL to a usable image URI. */
export async function getProductImageUrl(path?: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Upload a product image to Supabase Storage. Returns the storage path. */
export async function uploadProductImage(
  productId: string,
  file: ArrayBuffer,
  contentType = "image/webp",
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Storage is not configured. Set EXPO_PUBLIC_SUPABASE_URL and ANON key.");
  }

  const path = `${productId}.webp`;
  const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, file, {
    contentType,
    upsert: true,
  });

  if (error) throw error;
  return path;
}

/**
 * Upload a named variant image (primary or secondary) for a product.
 * Storage path: `{productId}-{variant}.webp`
 */
export async function uploadProductVariantImage(
  productId: string,
  variant: "primary" | "secondary",
  file: ArrayBuffer,
  contentType = "image/webp",
): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Storage is not configured. Set EXPO_PUBLIC_SUPABASE_URL and ANON key.");
  }

  const path = `${productId}-${variant}.webp`;
  const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, file, {
    contentType,
    upsert: true,
  });

  if (error) throw error;
  return path;
}

/** Delete a named variant image from Supabase Storage. */
export async function deleteProductVariantImage(
  productId: string,
  variant: "primary" | "secondary",
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const path = `${productId}-${variant}.webp`;
  await supabase.storage.from(PRODUCT_BUCKET).remove([path]);
}
