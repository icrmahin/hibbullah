import { supabase } from '../lib/supabase'
import { supabaseErrorToAppError } from '../lib/errors'
import { ok, fail, type ServiceResult } from '../lib/result'

export interface CustomerRecord {
  id: string
  name: string
  email?: string
  phone?: string
  role: string
  isBlocked: boolean
  orderCount: number
  totalSpent: number
  createdAt: string
}

/**
 * PostgREST's codes for "there is no such function in the schema cache".
 *
 * `PGRST202` is what it reports for a missing function; `42883` is the SQLSTATE for an
 * undefined function, which is what surfaces if the call reaches Postgres without a cached
 * entry. Either one means the RPC is absent, which is the only situation the client-side
 * fallback is for.
 */
const RPC_MISSING = new Set(['PGRST202', '42883'])

export async function fetchCustomers(query?: string, options?: { limit?: number; offset?: number }): Promise<CustomerRecord[]> {
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  const trimmed = query?.trim() || null

  // Server-side aggregation: filtered and paginated in the database, which is what keeps
  // the customers screen usable at 4,000 products rather than paging by hand.
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
      // The aggregate RPC does not carry the flag; the detail screen reads it directly.
      isBlocked: false,
      orderCount: Number(p.order_count || 0),
      totalSpent: Number(p.total_spent || 0),
      createdAt: p.created_at,
    }))
  }
  // The fallback below exists for one narrow case: a database that has not had the RPC
  // deployed yet. It used to run for *any* RPC error, which turned a real refusal into a
  // silent empty list — the customers RPC raises "Only admins can query customers" for a
  // non-admin, that message matches no branch in supabaseErrorToAppError, so it arrived as
  // UNEXPECTED and the fallback answered with zero customers instead of an error.
  //
  // Only "this function does not exist" may fall through. Anything else propagates.
  if (rpcError && !RPC_MISSING.has(rpcError.code ?? '')) {
    throw supabaseErrorToAppError(rpcError)
  }

  // Fallback to client-side (legacy) if RPC not yet deployed
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, name, email, phone, role, is_blocked, created_at')
    .eq('role', 'customer')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw supabaseErrorToAppError(error)

  // Scoped to the customers on this page rather than the whole orders table, and filtered
  // to exclude cancelled orders so the fallback agrees with the RPC. It used to read every
  // order row in the shop to build a map keyed by customer, and counted cancelled orders as
  // money spent — the two screens would then show different totals for the same customer
  // depending on whether the RPC was reachable.
  const pageIds = (profiles || []).map((p: any) => p.id as string)
  let orders: any[] = []
  if (pageIds.length > 0) {
    const { data: orderRows } = await supabase
      .from('orders')
      .select('customer_id, total, status')
      .in('customer_id', pageIds)
    orders = (orderRows || []) as any[]
  }

  const stats = new Map<string, { count: number; total: number }>()
  for (const o of orders) {
    const s = stats.get(o.customer_id) || { count: 0, total: 0 }
    s.count += 1
    if (o.status !== 'CANCELLED') s.total += Number(o.total || 0)
    stats.set(o.customer_id, s)
  }

  let list: CustomerRecord[] = (profiles || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    email: p.email ?? undefined,
    phone: p.phone ?? undefined,
    role: p.role,
    isBlocked: p.is_blocked ?? false,
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
    .select('id, name, email, phone, role, is_blocked, created_at')
    .eq('id', customerId)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw supabaseErrorToAppError(error)
  }
  const { data: stats, error: statsError } = await supabase.rpc('get_customer_stats', { p_customer_id: customerId })
  if (statsError && !RPC_MISSING.has(statsError.code ?? '')) throw supabaseErrorToAppError(statsError)
  if (!statsError && stats && (stats as any[])[0]) {
    const row = (stats as any[])[0]
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email ?? undefined,
      phone: profile.phone ?? undefined,
      role: profile.role,
      isBlocked: profile.is_blocked ?? false,
      orderCount: Number(row.order_count || 0),
      totalSpent: Number(row.total_spent || 0),
      createdAt: profile.created_at,
    }
  }
  const { data: orders } = await supabase.from('orders').select('total, status').eq('customer_id', customerId)
  const rows = (orders || []) as any[]
  const orderCount = rows.length
  // Cancelled orders are counted but not charged, matching the RPC's filter above.
  const totalSpent = rows.reduce((sum: number, o: any) => (o.status === 'CANCELLED' ? sum : sum + Number(o.total || 0)), 0)
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email ?? undefined,
    phone: profile.phone ?? undefined,
    role: profile.role,
    isBlocked: profile.is_blocked ?? false,
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

/**
 * Block or unblock a customer account. Admin-only, enforced inside the RPC
 * (is_admin() check) — the client flag is convenience, not authority.
 * Blocking suspends the account reversibly: live sessions are refused at next
 * auth check and RLS denies the blocked token's reads/writes. Nothing is
 * deleted; order history stays intact.
 */
export async function setCustomerBlocked(customerId: string, blocked: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_user_blocked', {
    p_user_id: customerId,
    p_blocked: blocked,
  })
  if (error) throw supabaseErrorToAppError(error)
}
