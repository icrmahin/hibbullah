/* eslint-disable react-hooks/set-state-in-effect -- data fetching and derived state sync require setState inside effects */
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'
import type { DeliveryCycle } from '../types/deliveryCycle'
import { fetchActiveDeliveryCycle, createDeliveryCycle } from '../services/deliveryCycle'

export function useDeliveryCycle() {
  const { user } = useAuth()
  const [cycle, setCycle] = useState<DeliveryCycle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadCycle = useCallback(async () => {
    if (!user) {
      setCycle(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const cycle = await fetchActiveDeliveryCycle(user.id)
      setCycle(cycle)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load delivery cycle')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadCycle()
  }, [loadCycle])

  const create = useCallback(async () => {
    if (!user) throw new Error('User not authenticated')
    const newCycle = await createDeliveryCycle(user.id)
    setCycle(newCycle)
    return newCycle
  }, [user])

  const reload = useCallback(() => loadCycle(), [loadCycle])

  return { cycle, loading, error, create, reload }
}
