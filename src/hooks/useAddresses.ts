/* eslint-disable react-hooks/set-state-in-effect -- data fetching and derived state sync require setState inside effects */
import { useState, useEffect, useCallback } from 'react'
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

  useEffect(() => {
    loadAddresses()
  }, [loadAddresses])

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
