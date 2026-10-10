/* eslint-disable react-hooks/set-state-in-effect -- data fetching and derived state sync require setState inside effects */
import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import type { Product } from "../types/product";
import { fetchFavorites, addFavorite, removeFavorite, syncLocalFavoritesToRemote, isMissingTableError } from "../services/favorites";

/**
 * Errors the favorites flow expects and handles gracefully — missing table
 * (migration not yet pushed), RLS/permission denials, and network/abort failures.
 * Only truly unexpected errors should surface as a console warning.
 */
function isExpectedFavoritesError(e: any): boolean {
  if (isMissingTableError(e)) return true;
  const code = e?.code ?? "";
  const msg = String(e?.message ?? "");
  // RLS / permission errors
  if (code === "42501" || /permission denied|row-level|violates row-level/i.test(msg)) return true;
  // Network / abort errors
  if (/network|fetch failed|aborted|timeout|ECONNRESET|ENOTFOUND/i.test(msg)) return true;
  return false;
}

type FavoritesContextValue = {
  items: Product[];
  ids: Set<string>;
  loading: boolean;
  isFavorite: (productId: string) => boolean;
  toggleFavorite: (productId: string) => Promise<void>;
  reload: () => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Opportunistic one-time sync: push any AsyncStorage buffer before fetching
      try {
        await syncLocalFavoritesToRemote(user.id);
      } catch {}
      const favs = await fetchFavorites(user.id);
      setItems(favs);
    } catch (e: any) {
      if (!isExpectedFavoritesError(e)) console.warn("Failed to load favorites", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
    if (!user?.id) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`favorites-changes-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "favorites", filter: `user_id=eq.${user.id}` }, () => load())
        .subscribe((status, err) => {
          if (err && !String(err).includes("PGRST205")) console.warn("[favorites] realtime subscribe", status, err);
        });
    } catch {
      // table may not exist yet — realtime will fail silently until migration pushed
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id, load]);

  const ids = useMemo(() => new Set(items.map((p) => p.id)), [items]);

  const isFavorite = useCallback((productId: string) => ids.has(productId), [ids]);

  const toggleFavorite = useCallback(
    async (productId: string) => {
      if (!user) throw new Error("User not authenticated");
      const fav = ids.has(productId);
      // optimistic
      if (fav) {
        const prev = items;
        setItems((cur) => cur.filter((p) => p.id !== productId));
        try {
          await removeFavorite(user.id, productId);
        } catch (e) {
          setItems(prev);
          throw e;
        }
      } else {
        // optimistic add without full product fetch — placeholder then reload on success
        // we push a temp marker then reload
        try {
          await addFavorite(user.id, productId);
          await load();
        } catch (e) {
          throw e;
        }
      }
    },
    [user, ids, items, load]
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({ items, ids, loading, isFavorite, toggleFavorite, reload: load }),
    [items, ids, loading, isFavorite, toggleFavorite, load]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const v = useContext(FavoritesContext);
  if (!v) throw new Error("useFavorites must be used within FavoritesProvider");
  return v;
}
