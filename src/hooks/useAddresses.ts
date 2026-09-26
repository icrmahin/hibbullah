import { useState, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { useAuth } from './useAuth'
import type { Address } from '../types/address'
import { fetchAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress } from '../services/addresses'

export function useAddresses() {
  const { user } = useAuth()
  const [data, setData] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Monotonic request id. Every load takes a ticket and only the newest one is allowed to
  // write, which closes the window where a slower earlier read lands after a newer one.
  //
  // Without it, deleting an address was not reliably reflected. `remove()` deletes and then
  // reloads, but a load already in flight — the `useFocusEffect` read on the way into the
  // screen, or one started by an earlier `create()` — can resolve *after* the post-delete
  // reload has already written the shorter list, and restore the row the user just deleted.
  // The list then showed an address that was gone from the database, and tapping the bin on
  // it again did nothing visible, which reads as "delete is broken". Same for `create`: a
  // stale read could hide the address that was just added.
  //
  // This is a guard against a *specific* interleaving, not a general cache. `mine !== seq`
  // means a newer request exists, so this response describes a moment that no longer
  // matters and must be dropped -- whether that newer request has finished or not.
  const seq = useRef(0)

  const loadAddresses = useCallback(async () => {
    if (!user) {
      seq.current += 1
      setData([])
      setLoading(false)
      return
    }

    const mine = ++seq.current
    setLoading(true)
    try {
      const rows = await fetchAddresses(user.id)
      if (mine !== seq.current) return
      setData(rows)
    } catch (err) {
      if (mine !== seq.current) return
      setError(err instanceof Error ? err.message : 'Failed to load addresses')
    } finally {
      // Only the newest request may clear the spinner. A stale one clearing it would make
      // the screen look settled while the read that matters is still running.
      if (mine === seq.current) setLoading(false)
    }
  }, [user])

  // Reload every time the screen comes back to the foreground.
  //
  // This is the second half of "adding an address does not work". The address IS saved --
  // the insert returns 201 -- but the screen that sent you to the form keeps its own copy
  // of `data`, and `router.push` leaves it mounted rather than remounting it. Nothing
  // re-reads on the way back, so the list still said "No saved addresses" and the customer
  // tapped Save again. `create()` calling `loadAddresses()` does not help: that is the hook
  // instance *inside the form*, not the one on the screen behind it.
  //
  // This replaces a plain useEffect on mount, which it also covers -- useFocusEffect runs
  // on first focus as well as on every return, so keeping both just double-fetched. And
  // because it re-runs when the callback identity changes, the read still happens once
  // `user` finishes loading, which a focus-only trigger would otherwise miss.
  useFocusEffect(
    useCallback(() => {
      loadAddresses()
    }, [loadAddresses])
  )

  const create = useCallback(async (address: Omit<Address, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!user) throw new Error('User not authenticated')
    const newAddress = await createAddress(user.id, address)
    await loadAddresses()
    return newAddress
  }, [user, loadAddresses])

  const update = useCallback(async (addressId: string, updates: Partial<Omit<Address, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    if (!user) throw new Error('User not authenticated')
    const updated = await updateAddress(addressId, user.id, updates)
    await loadAddresses()
    return updated
  }, [user, loadAddresses])

  const remove = useCallback(async (addressId: string) => {
    if (!user) throw new Error('User not authenticated')
    await deleteAddress(addressId, user.id)
    await loadAddresses()
  }, [user, loadAddresses])

  const setDefault = useCallback(async (addressId: string) => {
    if (!user) throw new Error('User not authenticated')
    await setDefaultAddress(user.id, addressId)
    await loadAddresses()
  }, [user, loadAddresses])

  const reload = useCallback(() => loadAddresses(), [loadAddresses])

  return { data, loading, error, create, update, remove, setDefault, reload }
}
