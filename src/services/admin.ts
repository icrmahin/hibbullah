import { supabase } from '../lib/supabase'
import { mapOrder, mapProduct } from '../lib/mappers'
import { AppError, AppErrorType, supabaseErrorToAppError } from '../lib/errors'
import { listProducts } from './products'
import type { ProductCursor } from './products'
import config from '../constants/config'
import type { Product } from '../types/product'
import type { Order } from '../types/order'

interface InventoryItemWithProduct {
  id: string
  product_id: string
  batch_number: string
  quantity: number
  status: string
  expiry_date: string | null
  products: { name: string }[]
}

interface OrderBasic {
  id: string
  order_number: string
  customer_name: string
  total: number
}

interface OrderWithStatus {
  id: string
  order_number: string
  customer_name: string
  total: number
  status: string
  created_at: string
}

export interface AdminDashboardData {
  // 30-day window
  totalSalesQty: number // total items sold last 30d
  totalSalesRevenue: number // sum of DELIVERED order totals last 30d
  /** Delivered profit less approved returns. Never revenue, never a cancelled order. */
  totalEarning: number
  /** Profit before returns came off, so the headline figure can be explained. */
  grossProfit: number
  /** Profit given back by returns approved inside the window. */
  returnedProfit: number
  /** Delivered lines with no cost price set: they earn nothing and are counted, not guessed. */
  unpricedItems: number
  unpricedQty: number
  /** Approved returns naming no order line, whose profit could not be reversed. */
  unlinkedReturns: number
  salesTrend: number[] // 7 pts last 7d qty
  earningTrend: number[] // 7 pts last 7d profit
  pendingOrders: number
  processingOrders: number
  activeProducts: number
  lowStockProducts: number
  attentionOrders: { id: string; orderNumber: string; customerName: string; total: number }[]
  pendingReturns: { id: string; productName: string; customerName: string; quantity: number }[]
  lowStockBatches: { id: string; productName: string; batchNumber: string; quantity: number; status: 'healthy' | 'low' | 'out_of_stock'; expiryDate?: string }[]
  expiringBatches: { id: string; productName: string; batchNumber: string; quantity: number; status: 'healthy' | 'low' | 'out_of_stock'; expiryDate?: string }[]
  recentOrders: { id: string; orderNumber: string; customerName: string; total: number; status: string; createdAt: string }[]
}

type DashboardSalesJson = {
  totalSalesQty?: number
  totalSalesRevenue?: number
  totalEarning?: number
  grossProfit?: number
  returnedProfit?: number
  deliveredQty?: number
  unpricedItems?: number
  unpricedQty?: number
  unlinkedReturns?: number
  salesTrend?: number[]
  earningTrend?: number[]
}

export type AdminSalesAggregates = {
  totalSalesQty: number
  totalSalesRevenue: number
  /** Delivered profit, less returns approved in the window. Not revenue. */
  totalEarning: number
  /** Profit before returns came off, so the headline can be explained. */
  grossProfit: number
  /** Profit given back by approved returns, dated by approval. */
  returnedProfit: number
  /** Delivered lines with no cost price: they earn nothing and are reported, not guessed. */
  unpricedItems: number
  unpricedQty: number
  /** Approved returns that could not be reversed because they name no order line. */
  unlinkedReturns: number
  salesTrend: number[]
  earningTrend: number[]
}

/**
 * The sales and earning figures, counted in the database.
 *
 * There used to be a client-side fallback here, and it was the reason the dashboard showed
 * the wrong money. `get_admin_dashboard_sales` guarded itself with a JWT claim this project
 * has never had, so it raised for every caller — including real admins — and the fallback
 * quietly took over. The fallback then had two defects of its own: it summed `order_items`
 * with no join to `orders`, so a CANCELLED order counted as sales, and it filled in a
 * missing cost price as `unit_price * 0.8`, inventing a 20% margin and reporting the
 * difference as earnings. Nobody could tell, because the fallback ran whenever the RPC
 * failed and the RPC always failed.
 *
 * So there is no fallback. If the aggregate cannot be computed, that is a real fault and
 * the screen says so — a dashboard that shows 0 for "no data" and 0 for "the query broke"
 * is worse than one that admits it is broken.
 */
async function fetchSalesAggregates(since30Iso: string): Promise<AdminSalesAggregates> {
  const { data, error } = await supabase.rpc('get_admin_dashboard_sales', { p_since: since30Iso })
  if (error) throw supabaseErrorToAppError(error)
  if (!data) throw new AppError(AppErrorType.UNEXPECTED, 'The dashboard totals could not be loaded.')
  const j = data as DashboardSalesJson
  const num = (v: unknown) => Number(v ?? 0) || 0
  const series = (v: unknown) => (Array.isArray(v) ? v.map((x) => num(x)) : [])
  return {
    totalSalesQty: num(j.totalSalesQty),
    totalSalesRevenue: num(j.totalSalesRevenue),
    totalEarning: num(j.totalEarning),
    grossProfit: num(j.grossProfit),
    returnedProfit: num(j.returnedProfit),
    unpricedItems: num(j.unpricedItems),
    unpricedQty: num(j.unpricedQty),
    unlinkedReturns: num(j.unlinkedReturns),
    salesTrend: series(j.salesTrend),
    // The RPC's own trend, never a stand-in. A fabricated sparkline next to a real number
    // is the same class of lie as the fabricated margin.
    earningTrend: series(j.earningTrend),
  }
}

export async function fetchAdminDashboard(): Promise<AdminDashboardData> {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [
    pendingResult,
    processingResult,
    activeResult,
    lowStockCountResult,
    attentionResult,
    lowStockItemsResult,
    expiringResult,
    recentOrdersResult,
    pendingReturnsResult,
    salesAgg,
  ] = await Promise.all([
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'PROCESSING'),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true).lt('stock', 10),
    supabase
      .from('orders')
      .select('id, order_number, customer_name, total')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('inventory_items')
      .select('id, product_id, batch_number, quantity, status, expiry_date, products(name)')
      .lt('quantity', 10)
      .order('quantity', { ascending: true })
      .limit(10),
    supabase
      .from('inventory_items')
      .select('id, product_id, batch_number, quantity, status, expiry_date, products(name)')
      .not('expiry_date', 'is', null)
      .lt('expiry_date', new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('expiry_date', { ascending: true })
      .limit(10),
    supabase
      .from('orders')
      .select('id, order_number, customer_name, total, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('return_requests').select('id, product_name, customer_name, quantity').eq('status', 'PENDING').order('created_at', { ascending: false }).limit(5),
    fetchSalesAggregates(since30),
  ])

  const pendingOrders = pendingResult.count || 0
  const processingOrders = processingResult.count || 0
  const activeProducts = activeResult.count || 0
  const lowStockProducts = lowStockCountResult.count || 0

  const attentionOrders = (attentionResult.data as OrderBasic[] || []).map(order => ({
    id: order.id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    total: order.total,
  }))

  const transformedLowStock = (lowStockItemsResult.data as InventoryItemWithProduct[] || []).map(item => ({
    id: item.id,
    productName: item.products?.[0]?.name || 'Unknown',
    batchNumber: item.batch_number,
    quantity: item.quantity,
    status: item.status as 'healthy' | 'low' | 'out_of_stock',
    expiryDate: item.expiry_date || undefined,
  }))

  const transformedExpiring = (expiringResult.data as InventoryItemWithProduct[] || []).map(item => ({
    id: item.id,
    productName: item.products?.[0]?.name || 'Unknown',
    batchNumber: item.batch_number,
    quantity: item.quantity,
    status: item.status as 'healthy' | 'low' | 'out_of_stock',
    expiryDate: item.expiry_date || undefined,
  }))

  const transformedRecentOrders = (recentOrdersResult.data as OrderWithStatus[] || []).map(order => ({
    id: order.id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    total: order.total,
    status: order.status,
    createdAt: order.created_at,
  }))

  type PendingReturnRow = { id: string; product_name: string; customer_name: string; quantity: number }
  const pendingReturns = ((pendingReturnsResult.data as PendingReturnRow[] | null) || []).map((r) => ({
    id: r.id,
    productName: r.product_name,
    customerName: r.customer_name,
    quantity: r.quantity,
  }))

  return {
    totalSalesQty: salesAgg.totalSalesQty,
    totalSalesRevenue: salesAgg.totalSalesRevenue,
    totalEarning: salesAgg.totalEarning,
    grossProfit: salesAgg.grossProfit,
    returnedProfit: salesAgg.returnedProfit,
    unpricedItems: salesAgg.unpricedItems,
    unpricedQty: salesAgg.unpricedQty,
    unlinkedReturns: salesAgg.unlinkedReturns,
    salesTrend: salesAgg.salesTrend,
    earningTrend: salesAgg.earningTrend,
    pendingOrders,
    processingOrders,
    activeProducts,
    lowStockProducts,
    attentionOrders,
    pendingReturns,
    lowStockBatches: transformedLowStock,
    expiringBatches: transformedExpiring,
    recentOrders: transformedRecentOrders,
  }
}

export type AdminProductFilters = {
  status?: 'active' | 'inactive'
  stockFilter?: 'in_stock' | 'low' | 'out'
  categoryId?: string
  query?: string
  limit?: number
  cursor?: ProductCursor
  /** Only meaningful for ranked search, which pages by offset. */
  offset?: number
}

/**
 * The admin product list.
 *
 * Was a `count: 'exact'` select with `.or()` ILIKE and OFFSET paging, capped at
 * 100 rows by the caller — so a 4,000-product catalog silently showed the newest
 * 100, the exact count scanned the whole table on every keystroke, and the
 * search term was interpolated raw into a PostgREST filter string. Now it goes
 * through the same server-side browse/search functions as the customer app, with
 * filtering, ranking and paging all in the database.
 */
export async function fetchAdminProducts(
  filters?: AdminProductFilters,
  signal?: AbortSignal,
): Promise<{ data: Product[]; total: number; hasMore: boolean; cursor: ProductCursor }> {
  const result = await listProducts(
    {
      status: filters?.status,
      stock: filters?.stockFilter,
      lowStockThreshold: config.lowStockThreshold,
      categoryId: filters?.categoryId,
      query: filters?.query,
      limit: filters?.limit,
      cursor: filters?.cursor,
      offset: filters?.offset,
    },
    signal,
  )

  if (result.data.length > 0) {
    return {
      data: result.data,
      total: result.total,
      hasMore: result.hasMore,
      cursor: result.cursor,
    }
  }

  // Safety net: browse_products uses INNER JOINs on categories/manufacturers,
  // so a product whose category row is missing — or hidden by RLS — drops the
  // whole row and the admin list reads empty with no error. When the RPC says
  // "no rows" on an unfiltered first page, read the table directly (PostgREST
  // embeds use LEFT joins, so the product survives even if its category does
  // not) rather than stranding accidental uploads with no delete path.
  const isFirstPage = !filters?.cursor && !filters?.offset
  const isUnfiltered =
    !filters?.query?.trim() && !filters?.status && !filters?.stockFilter && !filters?.categoryId
  if (!isFirstPage || !isUnfiltered) {
    return { data: result.data, total: result.total, hasMore: result.hasMore, cursor: result.cursor }
  }

  const limit = Math.min(Math.max(filters?.limit ?? 24, 1), 100)
  const fallback = await supabase
    .from('products')
    .select('*, categories(name, slug), manufacturers(name)')
    .order('created_at', { ascending: false })
    .limit(limit + 1)
  if (fallback.error) return { data: [], total: 0, hasMore: false, cursor: null }
  const rows = (fallback.data || []) as unknown as Parameters<typeof mapProduct>[0][]
  const products = rows
    .map((row) => mapProduct(row))
    .filter((p): p is Product => !!p && !p.isDeleted)
  if (products.length === 0) return { data: [], total: 0, hasMore: false, cursor: null }
  console.warn(
    `[fetchAdminProducts] RPC returned 0 rows but direct query found ${products.length}; showing direct results (likely category/manufacturer join or RLS).`,
  )
  const page = products.slice(0, limit)
  const last = (fallback.data || [])[page.length - 1] as unknown as Record<string, unknown> | undefined
  return {
    data: page,
    total: 0,
    hasMore: products.length > limit,
    cursor:
      products.length > limit && last
        ? { createdAt: String(last.created_at ?? ''), id: String(last.id ?? '') }
        : null,
  }
}

export async function fetchAdminOrders(filters?: { status?: string; limit?: number; offset?: number }): Promise<{ data: Order[]; total: number }> {
  let query = supabase
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.limit) query = query.limit(filters.limit)
  if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1)

  const { data, error, count } = await query
  if (error) throw error

  const mapped = (data || []).map((row) => mapOrder(row as unknown as Parameters<typeof mapOrder>[0]) as Order).filter(Boolean) as Order[]
  return { data: mapped, total: count || 0 }
}

export async function fetchAdminOrderById(orderId: string): Promise<Order | null> {
  const { data, error } = await supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single()
  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null
    throw error
  }
  return mapOrder(data as unknown as Parameters<typeof mapOrder>[0]) as Order | null
}

export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  const { error } = await supabase.rpc('transition_order_status', {
    p_order_id: orderId,
    p_new_status: status,
    p_admin_id: (await supabase.auth.getUser()).data.user?.id,
  })
  if (error) throw error
}

export interface AdminInventoryRow {
  id: string
  product_id: string
  batch_number: string
  quantity: number
  status: string
  expiry_date: string | null
  last_updated: string
  products?: { name: string; brand?: string; generic_name?: string; is_active?: boolean } | null
}

export async function fetchAdminInventory(): Promise<AdminInventoryRow[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*, products(name, brand, generic_name, is_active)')
    .order('last_updated', { ascending: false })

  if (error) throw error
  return (data as AdminInventoryRow[]) || []
}

export async function createStockAdjustment(adjustment: {
  product_id: string
  batch_number: string
  type: 'increase' | 'decrease'
  quantity: number
  reason: string
  admin_id: string
}): Promise<void> {
  const { error } = await supabase
    .from('stock_adjustments')
    .insert(adjustment)
  if (error) throw error
}