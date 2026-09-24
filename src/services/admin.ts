import { supabase } from '../lib/supabase'
import { mapOrder, mapProduct } from '../lib/mappers'
import type { Product } from '../types/product'
import type { Order } from '../types/order'

interface SupabaseResponse<T> {
  data: T | null
  error: unknown
  count: number | null
}

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

interface AuditEntry {
  id: string
  action: string
  actor: string
  record_type: string
  timestamp: string
}

export interface AdminDashboardData {
  // 30-day window
  totalSalesQty: number // total items sold last 30d
  totalSalesRevenue: number // sum total last 30d
  totalEarning: number // profit = sum((unit_price - cost_price)*qty) last 30d
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
  recentActivity: { id: string; action: string; actor: string; recordType: string; timestamp: string }[]
}

type DashboardSalesJson = { totalSalesQty?: number; totalSalesRevenue?: number; totalEarning?: number; salesTrend?: number[]; earningTrend?: number[] }

async function fetchSalesAggregates(since30Iso: string): Promise<{ totalSalesQty: number; totalSalesRevenue: number; totalEarning: number; salesTrend: number[]; earningTrend: number[] }> {
  const { data, error } = await supabase.rpc('get_admin_dashboard_sales', { p_since: since30Iso })
  if (!error && data) {
    const j = data as DashboardSalesJson
    return {
      totalSalesQty: Number(j.totalSalesQty || 0),
      totalSalesRevenue: Number(j.totalSalesRevenue || 0),
      totalEarning: Number(j.totalEarning || 0),
      salesTrend: Array.isArray(j.salesTrend) ? j.salesTrend : [],
      earningTrend: Array.isArray(j.earningTrend) ? j.earningTrend : [],
    }
  }
  // Fallback to client-side aggregation if RPC missing (older remote or anon)
  const since30 = since30Iso
  const [salesAggResult, salesItemsAggResult] = await Promise.all([
    supabase.from('orders').select('total, created_at').gte('created_at', since30).neq('status', 'CANCELLED'),
    supabase.from('order_items').select('quantity, unit_price, product_id, created_at, products(cost_price)').gte('created_at', since30),
  ])
  type SalesRow = { total?: number | string | null; created_at?: string | null }
  type ItemRow = { quantity?: number | string | null; unit_price?: number | string | null; created_at?: string | null; products?: { cost_price?: number | string | null } | { cost_price?: number | string | null }[] | null }
  const salesRows = (salesAggResult.data as SalesRow[] | null) || []
  const totalSalesRevenue = salesRows.reduce((s, r) => s + Number(r.total || 0), 0)
  const itemRows = (salesItemsAggResult.data as ItemRow[] | null) || []
  let totalSalesQty = 0
  let totalEarning = 0
  const byDayQty = new Map<string, number>()
  const byDayEarn = new Map<string, number>()
  for (const r of itemRows) {
    const qty = Number(r.quantity || 0)
    const unit = Number(r.unit_price || 0)
    const prod = r.products as { cost_price?: number | string | null } | Array<{ cost_price?: number | string | null }> | null | undefined
    const costRaw = Array.isArray(prod) ? prod[0]?.cost_price : prod?.cost_price
    const cost = Number(costRaw ?? unit * 0.8)
    const profit = (unit - cost) * qty
    totalSalesQty += qty
    totalEarning += profit > 0 ? profit : 0
    const day = String(r.created_at ?? '').slice(0, 10)
    byDayQty.set(day, (byDayQty.get(day) || 0) + qty)
    byDayEarn.set(day, (byDayEarn.get(day) || 0) + profit)
  }
  const salesTrend: number[] = []
  const earningTrend: number[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    salesTrend.push(byDayQty.get(d) || 0)
    earningTrend.push(Math.round(byDayEarn.get(d) || 0))
  }
  return { totalSalesQty, totalSalesRevenue, totalEarning: Math.round(totalEarning), salesTrend, earningTrend }
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
    recentActivityResult,
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
    supabase
      .from('audit_entries')
      .select('id, action, actor, record_type, timestamp')
      .order('timestamp', { ascending: false })
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

  const transformedActivity = (recentActivityResult.data as AuditEntry[] || []).map(activity => ({
    id: activity.id,
    action: activity.action,
    actor: activity.actor,
    recordType: activity.record_type,
    timestamp: activity.timestamp,
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
    recentActivity: transformedActivity,
  }
}

export async function fetchAdminProducts(filters?: { status?: string; stockFilter?: string; categoryId?: string; query?: string; limit?: number; offset?: number }): Promise<{ data: Product[]; total: number }> {
  let query = supabase
    .from('products')
    .select('*, categories(name, slug), manufacturers(name)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filters?.status === 'active') query = query.eq('is_active', true)
  if (filters?.status === 'inactive') query = query.eq('is_active', false)
  if (filters?.stockFilter === 'low') query = query.lt('stock', 10)
  if (filters?.stockFilter === 'out') query = query.eq('stock', 0)
  if (filters?.categoryId) query = query.eq('category_id', filters.categoryId)
  if (filters?.query) {
    query = query.or(`name.ilike.%${filters.query}%,brand.ilike.%${filters.query}%,generic_name.ilike.%${filters.query}%`)
  }
  if (filters?.limit) query = query.limit(filters.limit)
  if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1)

  const { data, error, count } = await query
  if (error) throw error

  return { data: (data || []).map((row) => mapProduct(row as unknown as Parameters<typeof mapProduct>[0])).filter(Boolean) as Product[], total: count || 0 }
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