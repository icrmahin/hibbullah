import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { mapProduct } from "../lib/mappers";
import type { Product } from "../types/product";

const LOCAL_KEY_PREFIX = "@favorites:";

export function isMissingTableError(error: any): boolean {
  return error?.code === "PGRST205" || String(error?.message || "").includes("Could not find the table 'public.favorites'");
}

function localKey(userId: string) {
  return `${LOCAL_KEY_PREFIX}${userId}`;
}

async function getLocalIds(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(localKey(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function setLocalIds(userId: string, ids: string[]) {
  await AsyncStorage.setItem(localKey(userId), JSON.stringify(ids));
}

async function fetchProductsByIds(productIds: string[]): Promise<Product[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await supabase.from("products").select("*").in("id", productIds);
  if (error) throw error;
  const byId = new Map((data || []).map((row: any) => [row.id, mapProduct(row as unknown as Parameters<typeof mapProduct>[0]) as Product]));
  // preserve local order (recent first is stored order)
  return productIds.map((id) => byId.get(id)).filter(Boolean) as Product[];
}

export async function syncLocalFavoritesToRemote(userId: string): Promise<number> {
  const ids = await getLocalIds(userId);
  if (ids.length === 0) return 0;
  // Verify remote exists before attempting sync
  const { error: probeError } = await supabase.from("favorites").select("id").limit(1);
  if (probeError && isMissingTableError(probeError)) return 0;
  if (probeError) throw probeError;
  let synced = 0;
  for (const productId of ids) {
    const { error } = await supabase.from("favorites").insert({ user_id: userId, product_id: productId });
    if (!error) synced++;
    else if (error.code === "23505") synced++; // already exists counts as synced
    else if (isMissingTableError(error)) break;
    else console.warn("[favorites] sync insert failed", productId, error.message);
  }
  if (synced > 0) {
    try {
      await AsyncStorage.removeItem(localKey(userId));
    } catch {}
  }
  return synced;
}

export async function fetchFavorites(userId: string): Promise<Product[]> {
  const { data, error } = await supabase
    .from("favorites")
    .select("created_at, product_id, products(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTableError(error)) {
      // Fallback: local AsyncStorage until migration is applied remotely
      const ids = await getLocalIds(userId);
      return fetchProductsByIds(ids);
    }
    throw error;
  }
  const remote = (data || []).map((row: any) => mapProduct(row.products)).filter(Boolean) as Product[];
  // One-time migration: if local buffer exists, sync in background without blocking UI
  const localIds = await getLocalIds(userId);
  if (localIds.length > 0) {
    syncLocalFavoritesToRemote(userId).catch(() => {});
  }
  return remote;
}

export async function addFavorite(userId: string, productId: string): Promise<void> {
  const { error } = await supabase.from("favorites").insert({ user_id: userId, product_id: productId });
  if (error) {
    if (error.code === "23505") return;
    if (isMissingTableError(error)) {
      const ids = await getLocalIds(userId);
      if (!ids.includes(productId)) {
        ids.unshift(productId);
        await setLocalIds(userId, ids);
      }
      return;
    }
    throw error;
  }
  // Mirror to local for offline resilience, deduplicated
  try {
    const ids = await getLocalIds(userId);
    if (!ids.includes(productId)) {
      ids.unshift(productId);
      await setLocalIds(userId, ids);
    }
  } catch {}
}

export async function removeFavorite(userId: string, productId: string): Promise<void> {
  const { error } = await supabase.from("favorites").delete().eq("user_id", userId).eq("product_id", productId);
  if (error) {
    if (isMissingTableError(error)) {
      const ids = await getLocalIds(userId);
      await setLocalIds(
        userId,
        ids.filter((id) => id !== productId)
      );
      return;
    }
    throw error;
  }
  // keep local mirror in sync when table exists (for devices that used fallback before migration)
  try {
    const ids = await getLocalIds(userId);
    if (ids.includes(productId)) {
      await setLocalIds(
        userId,
        ids.filter((id) => id !== productId)
      );
    }
  } catch {}
}

export async function checkFavorite(userId: string, productId: string): Promise<boolean> {
  const { data, error } = await supabase.from("favorites").select("id").eq("user_id", userId).eq("product_id", productId).maybeSingle();
  if (error) {
    if (isMissingTableError(error)) {
      const ids = await getLocalIds(userId);
      return ids.includes(productId);
    }
    throw error;
  }
  return !!data;
}
