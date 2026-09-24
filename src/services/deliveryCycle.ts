import { supabase } from '../lib/supabase'
import { mapDeliveryCycle } from '../lib/mappers'
import type { DeliveryCycleWithProducts } from '../types/deliveryCycle'

const CYCLE_WITH_ITEMS = '*, delivery_cycle_items(quantity, products(id, name, price, image_url))'

export async function fetchActiveDeliveryCycle(userId: string): Promise<DeliveryCycleWithProducts | null> {
  const { data, error } = await supabase
    .from('delivery_cycles')
    .select(CYCLE_WITH_ITEMS)
    .eq('customer_id', userId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return mapDeliveryCycle(data) as DeliveryCycleWithProducts
}

export async function fetchDeliveryCycles(userId: string): Promise<DeliveryCycleWithProducts[]> {
  const { data, error } = await supabase
    .from('delivery_cycles')
    .select(CYCLE_WITH_ITEMS)
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return (data || []).map((row: any) => mapDeliveryCycle(row) as DeliveryCycleWithProducts)
}

export async function fetchDeliveryCycleById(cycleId: string): Promise<DeliveryCycleWithProducts | null> {
  const { data, error } = await supabase
    .from('delivery_cycles')
    .select(CYCLE_WITH_ITEMS)
    .eq('id', cycleId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return mapDeliveryCycle(data) as DeliveryCycleWithProducts
}

export async function createDeliveryCycle(userId: string, items?: { productId: string; quantity: number }[]): Promise<DeliveryCycleWithProducts> {
  const now = new Date()
  const closesAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('delivery_cycles')
    .insert({
      customer_id: userId,
      status: 'PENDING',
      started_at: now.toISOString(),
      closes_at: closesAt.toISOString(),
      estimated_total: 0,
    })
    .select()
    .single()

  if (error) throw error

  if (items && items.length > 0) {
    const rows = items.map(i => ({ delivery_cycle_id: data.id, product_id: i.productId, quantity: i.quantity }))
    const { error: itemsError } = await supabase.from('delivery_cycle_items').insert(rows)
    if (itemsError) throw itemsError
    // trigger will have updated estimated_total; refetch with items
    return (await fetchDeliveryCycleById(data.id)) as DeliveryCycleWithProducts
  }

  return mapDeliveryCycle({ ...data, delivery_cycle_items: [] }) as DeliveryCycleWithProducts
}

export async function addProductsToCycle(cycleId: string, items: { productId: string; quantity: number }[]): Promise<void> {
  const rows = items.map(i => ({ delivery_cycle_id: cycleId, product_id: i.productId, quantity: i.quantity }))
  const { error } = await supabase.from('delivery_cycle_items').insert(rows)
  if (error) throw error
}

export async function removeProductFromCycle(cycleId: string, productId: string): Promise<void> {
  const { error } = await supabase.from('delivery_cycle_items').delete().eq('delivery_cycle_id', cycleId).eq('product_id', productId)
  if (error) throw error
}

export async function updateDeliveryCycleStatus(cycleId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('delivery_cycles')
    .update({ status })
    .eq('id', cycleId)
  if (error) throw error
}