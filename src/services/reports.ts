import { supabase } from '../lib/supabase'

export interface SalesReport {
  revenue: number
  deliveredOrders: number
  discounts: number
}

export interface InventoryReport {
  lowStock: number
  outOfStock: number
  expiring: number
  inventoryValue: number
}

export async function fetchSalesReport(): Promise<SalesReport> {
  const { data: orders, error } = await supabase.from('orders').select('total, discount, status')
  if (error) throw error
  const delivered = (orders || []).filter((o: any) => o.status === 'DELIVERED')
  return {
    revenue: delivered.reduce((s: number, o: any) => s + Number(o.total || 0), 0),
    deliveredOrders: delivered.length,
    discounts: (orders || []).reduce((s: number, o: any) => s + Number(o.discount || 0), 0),
  }
}

export async function fetchInventoryReport(): Promise<InventoryReport> {
  const { data: products, error: pErr } = await supabase.from('products').select('id, price, stock')
  if (pErr) throw pErr
  const { data: batches, error: bErr } = await supabase.from('inventory_items').select('id, quantity, expiry_date, product_id')
  if (bErr) throw bErr

  const lowStock = (products || []).filter((p: any) => Number(p.stock) > 0 && Number(p.stock) < 10).length
  const outOfStock = (products || []).filter((p: any) => Number(p.stock) === 0).length
  const now = new Date()
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  const expiring = (batches || []).filter((b: any) => {
    if (!b.expiry_date) return false
    const d = new Date(b.expiry_date)
    return d >= now && d <= in90
  }).length
  const priceById = new Map((products || []).map((p: any) => [p.id, Number(p.price || 0)]))
  const inventoryValue = (batches || []).reduce((s: number, b: any) => s + Number(b.quantity || 0) * (priceById.get(b.product_id) || 0), 0)

  return { lowStock, outOfStock, expiring, inventoryValue }
}
