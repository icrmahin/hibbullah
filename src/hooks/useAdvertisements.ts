import { useState, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  fetchAdvertisement,
  fetchAllAdvertisements,
  fetchLiveAdvertisements,
} from '../services/advertisements'
import type { Advertisement } from '../types/advertisement'

/**
 * Advertisements, read on the way into the screen.
 *
 * `scope` is not a filter the caller applies — it decides which service call runs, and
 * therefore which side of the RLS policies is being asked:
 *
 *   'live'  the homepage. The policy has already refused anything paused or out of date,
 *           so this list can be trusted as "what a customer is allowed to see".
 *   'admin' the manager. No policy filters it, because an expired banner still has to be
 *           findable so it can be edited or restarted.
 *
 * Reloads on focus for the same reason `useAddresses` does: navigating to the form and
 * back leaves the previous screen mounted, so a list that only reads on mount will keep
 * showing the row that was just edited, paused or deleted.
 */
export function useAdvertisements(scope: 'live' | 'admin' = 'live') {
  const [data, setData] = useState<Advertisement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Monotonic ticket: only the newest read may write. Closing the window where a slower
  // earlier response lands after a newer one and restores a row that no longer exists.
  const seq = useRef(0)

  const load = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const rows = scope === 'admin' ? await fetchAllAdvertisements() : await fetchLiveAdvertisements()
      if (mine !== seq.current) return
      setData(rows)
    } catch (err) {
      if (mine !== seq.current) return
      setError(err instanceof Error ? err.message : 'Failed to load advertisements')
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [scope])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  return { data, loading, error, reload: load }
}

/**
 * One banner, for the edit screen.
 *
 * Kept separate from the list hook because it is a different read: `.maybeSingle()`, no
 * policy filtering of its own — if the row is not there it is genuinely gone, not hidden
 * by the live-window policy — and it must not return the list's cache.
 */
export function useAdvertisement(id: string) {
  const [advertisement, setAdvertisement] = useState<Advertisement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const seq = useRef(0)

  const load = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const row = await fetchAdvertisement(id)
      if (mine !== seq.current) return
      setAdvertisement(row)
    } catch (err) {
      if (mine !== seq.current) return
      setError(err instanceof Error ? err.message : 'Failed to load the banner')
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [id])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  return { advertisement, loading, error, reload: load }
}
