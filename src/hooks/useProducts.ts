/* eslint-disable react-hooks/set-state-in-effect -- data fetching and derived state sync require setState inside effects */
/* eslint-disable react-hooks/refs -- stable filters refs intentionally mutated during render for stable callbacks */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Product } from '../types/product'
import type { Category } from '../types/category'
import type { Manufacturer } from '../types/manufacturer'
import { supabase } from '../lib/supabase'
import { listProducts, searchProductList, fetchCategories, fetchManufacturers } from '../services/products'
import type { ProductCursor, ProductListParams } from '../services/products'
import { normalizeError } from '../utils/errorHandling'
import { isSearchableTerm } from '../services/searchQuery'

export interface ProductFilters {
  categoryId?: string
  manufacturerId?: string
  query?: string
  isActive?: boolean
  isFeatured?: boolean
  limit?: number
}

/**
 * Coalescing window for the realtime subscription.
 *
 * A single stock adjustment fires several postgres_changes events, and an admin
 * import can fire thousands in a burst. Previously every event kicked off its
 * own full refetch, so a busy catalog queued up hundreds of identical queries.
 * Now a burst collapses into one refresh, and a refresh that lands while another
 * is in flight is deferred to exactly one follow-up instead of piling up.
 */
const REALTIME_COALESCE_MS = 500

/** Keystroke debounce, so a round trip is not fired per character. */
const SEARCH_DEBOUNCE_MS = 250

export function useProducts(filters: ProductFilters = {}) {
  const [data, setData] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)

  // Stabilize the filters object — callers commonly pass an inline literal,
  // which is a new reference every render and would refetch forever.
  const filtersKey = JSON.stringify(filters)
  const parsedFilters = useMemo<ProductFilters>(() => JSON.parse(filtersKey), [filtersKey])

  // The query is debounced apart from the other filters: changing category should
  // reload immediately, typing should not reload on every keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState(parsedFilters.query ?? '')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(parsedFilters.query ?? ''), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [parsedFilters.query])

  // Everything except the query: the dependency for the realtime channel and the
  // non-debounced half of a reload.
  const listKey = useMemo(
    () =>
      JSON.stringify({
        categoryId: parsedFilters.categoryId,
        manufacturerId: parsedFilters.manufacturerId,
        isActive: parsedFilters.isActive,
        isFeatured: parsedFilters.isFeatured,
        limit: parsedFilters.limit,
      }),
    [parsedFilters],
  )

  const searchable = isSearchableTerm(debouncedQuery)

  const paramsRef = useRef({ ...parsedFilters, query: debouncedQuery, searchable })
  paramsRef.current = { ...parsedFilters, query: debouncedQuery, searchable }

  // Browse pages with a keyset cursor; search pages with an offset, because the
  // ranked search orders by match quality and has no stable keyset.
  const cursorRef = useRef<ProductCursor>(null)
  const searchOffsetRef = useRef(0)

  const inFlightRef = useRef(false)
  const loadingMoreRef = useRef(false)
  const pendingRefreshRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const loadFirstPageRef = useRef<() => Promise<void>>(async () => {})

  const fetchPage = useCallback(async (mode: 'first' | 'more', signal: AbortSignal) => {
    const active = paramsRef.current
    const base: ProductListParams & { query?: string } = {
      categoryId: active.categoryId,
      manufacturerId: active.manufacturerId,
      status:
        active.isActive === false ? 'inactive' : active.isActive === true ? 'active' : undefined,
      limit: active.limit,
      query: active.query,
    }
    return active.searchable
      ? listProducts(
          { ...base, offset: mode === 'more' ? searchOffsetRef.current : 0 },
          signal,
        )
      : listProducts({ ...base, cursor: mode === 'more' ? cursorRef.current : null }, signal)
  }, [])

  const loadFirstPage = useCallback(async () => {
    if (inFlightRef.current) {
      pendingRefreshRef.current = true
      return
    }

    inFlightRef.current = true
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const result = await fetchPage('first', controller.signal)
      if (controller.signal.aborted || !mountedRef.current) return
      setData(result.data)
      setHasMore(result.hasMore)
      setTotal(result.total)
      cursorRef.current = result.cursor
      searchOffsetRef.current = result.data.length
    } catch (err) {
      if (!controller.signal.aborted && mountedRef.current) setError(normalizeError(err).message)
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      inFlightRef.current = false
      // An aborted load hands `loading` to whichever request superseded it.
      if (!controller.signal.aborted && mountedRef.current) setLoading(false)
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false
        // Through a ref rather than the function itself: a filter change or a
        // realtime event can land while a load is in flight, and the follow-up
        // has to run the same code path without this callback depending on
        // itself.
        void loadFirstPageRef.current()
      }
    }
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (inFlightRef.current || loadingMoreRef.current) return
    if (!hasMore) return
    if (!searchable && !cursorRef.current) return

    inFlightRef.current = true
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const result = await fetchPage('more', new AbortController().signal)
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
      if (mountedRef.current) setError(normalizeError(err).message)
    } finally {
      inFlightRef.current = false
      loadingMoreRef.current = false
      if (mountedRef.current) setLoadingMore(false)
    }
  }, [fetchPage, hasMore, searchable])

  loadFirstPageRef.current = loadFirstPage

  const scheduleRefresh = useCallback(() => {
    if (realtimeTimerRef.current) return
    realtimeTimerRef.current = setTimeout(() => {
      realtimeTimerRef.current = null
      void loadFirstPageRef.current()
    }, REALTIME_COALESCE_MS)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    void loadFirstPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listKey covers every non-debounced filter; debouncedQuery is the debounced query
  }, [listKey, debouncedQuery, loadFirstPage])

  // STK-01 realtime stock updates — subscribe to products + inventory_items, fallback via reload on focus
  useEffect(() => {
    const channel = supabase
      .channel(`products-stock:${listKey.slice(0, 20)}:${Math.random().toString(36).slice(2, 6)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, scheduleRefresh)
      .subscribe((status, err) => {
        if (err && !String(err).includes('PGRST205')) {
          console.warn('[products] realtime subscribe', status, err)
        }
      })
    return () => {
      if (realtimeTimerRef.current) {
        clearTimeout(realtimeTimerRef.current)
        realtimeTimerRef.current = null
      }
      supabase.removeChannel(channel)
    }
  }, [listKey, scheduleRefresh])

  const reload = useCallback(() => loadFirstPage(), [loadFirstPage])

  return { data, loading, loadingMore, error, hasMore, total, reload, loadMore }
}

export function useProduct(productId?: string) {
  const [product, setProduct] = useState<Product | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!productId) {
      setProduct(undefined)
      return
    }

    setLoading(true)
    setError(null)

    let cancelled = false

    import('../services/products').then(({ fetchProductById }) => {
      fetchProductById(productId)
        .then(product => {
          if (!cancelled) {
            setProduct(product || undefined)
          }
        })
        .catch(err => {
          if (!cancelled) {
            setError(normalizeError(err).message)
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })

    return () => { cancelled = true }
  }, [productId])

  const reload = useCallback(() => {
    if (productId) {
      setLoading(true)
      import('../services/products').then(({ fetchProductById }) => {
        fetchProductById(productId)
          .then(product => setProduct(product || undefined))
          .catch(err => setError(normalizeError(err).message))
          .finally(() => setLoading(false))
      })
    }
  }, [productId])

  return { product, loading, error, reload }
}

/** Shared fetch for the two pickers: debounced, cancellable, searchable. */
function useLookup<T>(query: string | undefined, fetcher: (term?: string) => Promise<T[]>) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [debounced, setDebounced] = useState(query ?? '')
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query ?? ''), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetcherRef.current(debounced || undefined)
      .then(rows => {
        if (!cancelled) setData(rows)
      })
      .catch(err => {
        if (!cancelled) setError(normalizeError(err).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [debounced])

  const reload = useCallback(() => {
    setLoading(true)
    fetcherRef.current(debounced || undefined)
      .then(rows => setData(rows))
      .catch(err => setError(normalizeError(err).message))
      .finally(() => setLoading(false))
  }, [debounced])

  return { data, loading, error, reload }
}

export function useCategories(query?: string) {
  return useLookup<Category>(query, fetchCategories)
}

export function useManufacturers(query?: string) {
  return useLookup<Manufacturer>(query, fetchManufacturers)
}

export function useProductSearch(query: string) {
  const [data, setData] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  // A term too short to be worth a round trip is treated as "not searching yet"
  // rather than firing a request that could only return noise.
  const searchable = isSearchableTerm(query)

  useEffect(() => {
    if (!searchable) {
      setData([])
      setTotal(0)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const debounce = setTimeout(() => {
      // Each term gets its own controller, so a slow request for an old term is
      // cancelled instead of landing on top of the new term's results.
      const controller = new AbortController()
      searchProductList({ query, limit: 24 }, controller.signal)
        .then(result => {
          if (controller.signal.aborted) return
          setData(result.data)
          setTotal(result.total)
        })
        .catch(err => {
          if (!controller.signal.aborted) setError(normalizeError(err).message)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(debounce)
  }, [query, searchable])

  return { data, loading, error, total }
}
