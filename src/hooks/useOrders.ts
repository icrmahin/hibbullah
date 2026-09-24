/* eslint-disable react-hooks/set-state-in-effect -- data fetching and derived state sync require setState inside effects */
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'
import type { Order } from '../types/order'
import { fetchOrders, fetchOrderById, createOrder } from '../services/orders'
import { normalizeError } from '../utils/errorHandling'

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchOrders()
      setOrders(data)
    } catch (err) {
      setError(normalizeError(err).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const reload = useCallback(() => loadOrders(), [loadOrders])

  return { orders, loading, error, reload }
}

export function useOrder(orderId?: string) {
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) {
      setOrder(null)
      return
    }

    setLoading(true)
    setError(null)

    let cancelled = false

    import('../services/orders').then(({ fetchOrderById }) => {
      fetchOrderById(orderId)
        .then(order => {
          if (!cancelled) setOrder(order)
        })
        .catch(err => {
          if (!cancelled) setError(normalizeError(err).message)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })

    return () => { cancelled = true }
  }, [orderId])

  const reload = useCallback(() => {
    if (orderId) {
      setLoading(true)
      import('../services/orders').then(({ fetchOrderById }) => {
        fetchOrderById(orderId)
          .then(order => setOrder(order))
          .catch(err => setError(normalizeError(err).message))
          .finally(() => setLoading(false))
      })
    }
  }, [orderId])

  return { order, loading, error, reload }
}

export function useCreateOrder() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = useCallback(async (addressId: string): Promise<string> => {
    if (!user) throw new Error('User not authenticated')
    setLoading(true)
    setError(null)
    try {
      const orderId = await createOrder(user.id, addressId)
      return orderId
    } catch (err) {
      const message = normalizeError(err).message
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }, [user])

  return { create, loading, error }
}
