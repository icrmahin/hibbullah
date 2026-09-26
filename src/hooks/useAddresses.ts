import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { useAuth } from './useAuth'
import type { Address } from '../types/address'
import { fetchAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress } from '../services/addresses'

export function useAddresses() {
  const { user } = useAuth()
  const [data, setData] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAddresses = useCallback(async () => {
    if (!user) {
      setData([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const data = await fetchAddresses(user.id)
      setData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load addresses')
    } finally {
      setLoading(false)
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
