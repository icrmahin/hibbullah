import { supabase } from '../lib/supabase'
import { supabaseErrorToAppError } from '../lib/errors'
import { ok, fail, type ServiceResult } from '../lib/result'

export interface CustomerRecord {
  id: string
  name: string
  email?: string
  phone?: string
  role: string
  orderCount: number
  totalSpent: number
  createdAt: string
}

export async function fetchCustomers(query?: string, options?: { limit?: number; offset?: number }): Promise<CustomerRecord[]> {
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  const trimmed = query?.trim() || null

  // Try RPC server-side aggregation (paginated, filtered)
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_customers_with_stats', {
    p_query: trimmed,
    p_limit: limit,
    p_offset: offset,
  })
  if (!rpcError && rpcData) {
    return (rpcData as any[]).map((p: any) => ({
      id: p.id,
      name: p.name,
      email: p.email ?? undefined,
      phone: p.phone ?? undefined,
      role: p.role,
      orderCount: Number(p.order_count || 0),
      totalSpent: Number(p.total_spent || 0),
      createdAt: p.created_at,
    }))
  }
  if (rpcError) {
    // If RPC missing/permissions, fallback silently; otherwise surface AppError
    const appErr = supabaseErrorToAppError(rpcError)
    if (appErr.type !== 'UNEXPECTED') throw appErr
  }

  // Fallback to client-side (legacy) if RPC not yet deployed
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, name, email, phone, role, created_at')
    .eq('role', 'customer')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw supabaseErrorToAppError(error)

  let q = query?.trim().toLowerCase() || ''
  if (q) {
    // server filter in fallback: crude ilike via or (covers basic search)
    // if RPC failed, we already have page; filter locally as before
  }

  const { data: orders } = await supabase.from('orders').select('customer_id, total')

  const stats = new Map<string, { count: number; total: number }>()
  for (const o of (orders || []) as any[]) {
    const s = stats.get(o.customer_id) || { count: 0, total: 0 }
    s.count += 1
    s.total += Number(o.total || 0)
    stats.set(o.customer_id, s)
  }

  let list: CustomerRecord[] = (profiles || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    email: p.email ?? undefined,
    phone: p.phone ?? undefined,
    role: p.role,
    orderCount: stats.get(p.id)?.count ?? 0,
    totalSpent: stats.get(p.id)?.total ?? 0,
    createdAt: p.created_at,
  }))

  if (trimmed) {
    const qlow = trimmed.toLowerCase()
    list = list.filter((c) => c.name.toLowerCase().includes(qlow) || (c.email || '').toLowerCase().includes(qlow) || (c.phone || '').includes(qlow))
  }

  return list
}

export async function fetchCustomerById(customerId: string): Promise<CustomerRecord | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, name, email, phone, role, created_at')
    .eq('id', customerId)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw supabaseErrorToAppError(error)
  }
  const { data: stats, error: statsError } = await supabase.rpc('get_customer_stats', { p_customer_id: customerId })
  if (!statsError && stats && (stats as any[])[0]) {
    const row = (stats as any[])[0]
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email ?? undefined,
      phone: profile.phone ?? undefined,
      role: profile.role,
      orderCount: Number(row.order_count || 0),
      totalSpent: Number(row.total_spent || 0),
      createdAt: profile.created_at,
    }
  }
  const { data: orders } = await supabase.from('orders').select('total').eq('customer_id', customerId)
  const orderCount = (orders || []).length
  const totalSpent = (orders || []).reduce((sum: number, o: any) => sum + Number(o.total || 0), 0)
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email ?? undefined,
    phone: profile.phone ?? undefined,
    role: profile.role,
    orderCount,
    totalSpent,
    createdAt: profile.created_at,
  }
}

export async function fetchCustomersResult(query?: string, options?: { limit?: number; offset?: number }): Promise<ServiceResult<CustomerRecord[]>> {
  try {
    const data = await fetchCustomers(query, options)
    return ok(data)
  } catch (e: any) {
    const appErr = e?.name === 'AppError' ? e : supabaseErrorToAppError(e)
    return fail(appErr.message, [] as CustomerRecord[])
  }
}
