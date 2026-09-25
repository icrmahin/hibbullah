/* eslint-disable react-hooks/set-state-in-effect -- data fetching and derived state sync require setState inside effects */
/* eslint-disable react-hooks/refs -- stable filters refs intentionally mutated during render for stable callbacks */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from './useAuth'
// FIX: merged the duplicate ../services/admin imports (runtime values on one line, type on another)
// into a single import — previously this imported the same module twice, tripping import/no-duplicates.
import {
  fetchAdminDashboard,
  fetchAdminProducts,
  fetchAdminOrders,
  updateOrderStatus,
  fetchAdminInventory,
  createStockAdjustment,
  type AdminDashboardData,
  type AdminInventoryRow,
} from '../services/admin'
import type { ProductCursor } from '../services/products'
import type { Product } from '../types/product'
import type { Order } from '../types/order'

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

export type AdminProductFilters = {
  status?: 'active' | 'inactive'
  stockFilter?: 'in_stock' | 'low' | 'out'
  categoryId?: string
  query?: string
  limit?: number
}

const ADMIN_SEARCH_DEBOUNCE_MS = 250

/**
 * Admin product list: server-side filtering, ranked search and keyset paging.
 *
 * Previously this loaded a single 100-row page with an exact count and then the
 * screen filtered those 100 rows in JavaScript — so at 4,000 products the admin
 * could only ever see, count, or search the newest 100, and the stock/status
 * chips silently disagreed with what the database held.
 */
export function useAdminProducts(filters?: AdminProductFilters) {
  const [data, setData] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const filtersKey = JSON.stringify(filters ?? {})
  const parsedFilters = useMemo(() => JSON.parse(filtersKey) as AdminProductFilters, [filtersKey])

  const [debouncedQuery, setDebouncedQuery] = useState(parsedFilters.query ?? '')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(parsedFilters.query ?? ''), ADMIN_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [parsedFilters.query])

  const listKey = useMemo(
    () => JSON.stringify({ ...parsedFilters, query: undefined }),
    [parsedFilters],
  )

  const filtersRef = useRef({ ...parsedFilters, query: debouncedQuery })
  filtersRef.current = { ...parsedFilters, query: debouncedQuery }

  const cursorRef = useRef<ProductCursor>(null)
  const searchOffsetRef = useRef(0)
  const inFlightRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  const loadFirstPage = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const result = await fetchAdminProducts(filtersRef.current, controller.signal)
      if (controller.signal.aborted || !mountedRef.current) return
      setData(result.data)
      setTotal(result.total)
      setHasMore(result.hasMore)
      cursorRef.current = result.cursor
      searchOffsetRef.current = result.data.length
    } catch (err) {
      if (!controller.signal.aborted && mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load products')
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      inFlightRef.current = false
      if (!controller.signal.aborted && mountedRef.current) setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (inFlightRef.current || !hasMore) return
    // Browse pages with a cursor; ranked search pages with an offset, because
    // the search order is by match quality and has no stable keyset.
    const isSearch = Boolean(filtersRef.current.query?.trim())
    if (!isSearch && !cursorRef.current) return

    inFlightRef.current = true
    setLoadingMore(true)
    try {
      const result = await fetchAdminProducts(
        isSearch
          ? { ...filtersRef.current, cursor: undefined, offset: searchOffsetRef.current }
          : { ...filtersRef.current, cursor: cursorRef.current ?? undefined },
      )
      if (!mountedRef.current) return
      if (result.data.length === 0) {
        setHasMore(false)
        cursorRef.current = null
        return
      }
      setData(prev => [...prev, ...result.data])
      setHasMore(result.hasMore)
      cursorRef.current = result.cursor
      searchOffsetRef.current += result.data.length
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to load more products')
    } finally {
      inFlightRef.current = false
      if (mountedRef.current) setLoadingMore(false)
    }
  }, [hasMore])

  useEffect(() => {
    void loadFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listKey covers every non-debounced filter; debouncedQuery is the debounced query
  }, [listKey, debouncedQuery, loadFirstPage])

  const reload = useCallback(() => loadFirstPage(), [loadFirstPage])

  return { data, loading, loadingMore, error, total, hasMore, reload, loadMore }
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
