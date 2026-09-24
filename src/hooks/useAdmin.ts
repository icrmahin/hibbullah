/* eslint-disable react-hooks/set-state-in-effect -- data fetching and derived state sync require setState inside effects */
 /* eslint-disable react-hooks/refs -- stable filters refs intentionally mutated during render for stable callbacks */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from './useAuth'
import { fetchAdminDashboard, fetchAdminProducts, fetchAdminOrders, updateOrderStatus, fetchAdminInventory, createStockAdjustment, type AdminDashboardData } from '../services/admin'
import type { Product } from '../types/product'
import type { Order } from '../types/order'
import type { AdminInventoryRow } from '../services/admin'

export function useAdmin() {
  const { user, isAdmin } = useAuth()
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    if (!user || !isAdmin) {
      setDashboard(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const data = await fetchAdminDashboard()
      setDashboard(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin dashboard')
    } finally {
      setLoading(false)
    }
  }, [user, isAdmin])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const reload = useCallback(() => loadDashboard(), [loadDashboard])

  return { dashboard, loading, error, reload }
}

export function useAdminProducts(filters?: { status?: string; stockFilter?: string; categoryId?: string; query?: string; limit?: number; offset?: number }) {
  const [data, setData] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const filtersKey = JSON.stringify(filters ?? {})
  const parsedFilters = useMemo(() => JSON.parse(filtersKey) as typeof filters, [filtersKey])
  const filtersRef = useRef(parsedFilters)
  filtersRef.current = parsedFilters

  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchAdminProducts(filtersRef.current)
      setData(result.data)
      setTotal(result.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProducts()
  }, [filtersKey, loadProducts])

  const reload = useCallback(() => loadProducts(), [loadProducts])

  return { data, loading, error, total, reload }
}

export function useAdminOrders(filters?: { status?: string; limit?: number; offset?: number }) {
  const [data, setData] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const filtersKey = JSON.stringify(filters ?? {})
  const parsedFilters = useMemo(() => JSON.parse(filtersKey) as typeof filters, [filtersKey])
  const filtersRef = useRef(parsedFilters)
  filtersRef.current = parsedFilters

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchAdminOrders(filtersRef.current)
      setData(result.data)
      setTotal(result.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOrders()
  }, [filtersKey, loadOrders])

  const reload = useCallback(() => loadOrders(), [loadOrders])

  const updateStatus = useCallback(async (orderId: string, status: string) => {
    await updateOrderStatus(orderId, status)
    await loadOrders()
  }, [loadOrders])

  return { data, loading, error, total, reload, updateStatus }
}

export function useAdminInventory() {
  const [data, setData] = useState<AdminInventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadInventory = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAdminInventory()
      setData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  const reload = useCallback(() => loadInventory(), [loadInventory])

  return { data, loading, error, reload }
}

export function useStockAdjustment() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = useCallback(async (adjustment: {
    product_id: string
    batch_number: string
    type: 'increase' | 'decrease'
    quantity: number
    reason: string
    admin_id: string
  }) => {
    setLoading(true)
    setError(null)
    try {
      await createStockAdjustment(adjustment)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create stock adjustment'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  return { create, loading, error }
}
