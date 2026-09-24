import { supabase } from '../lib/supabase'
import { mapReturnRequest } from '../lib/mappers'
import type { ReturnRequest } from '../types/return'
import { supabaseErrorToAppError } from '../lib/errors'
import { ok, fail, type ServiceResult } from '../lib/result'

export async function fetchReturns(userId?: string): Promise<ReturnRequest[]> {
  let query = supabase.from('return_requests').select('*').order('created_at', { ascending: false })
  if (userId) query = query.eq('customer_id', userId)
  const { data, error } = await query
  if (error) throw supabaseErrorToAppError(error)
  return (data || []).map((r) => mapReturnRequest(r as unknown as Parameters<typeof mapReturnRequest>[0]) as ReturnRequest)
}

export async function fetchReturnsResult(userId?: string): Promise<ServiceResult<ReturnRequest[]>> {
  try {
    const data = await fetchReturns(userId)
    return ok(data)
  } catch (e: any) {
    const appErr = e?.name === 'AppError' ? e : supabaseErrorToAppError(e)
    return fail(appErr.message, [] as ReturnRequest[])
  }
}

export async function fetchReturnById(returnId: string): Promise<ReturnRequest | null> {
  const { data, error } = await supabase.from('return_requests').select('*').eq('id', returnId).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw supabaseErrorToAppError(error)
  }
  return mapReturnRequest(data as unknown as Parameters<typeof mapReturnRequest>[0]) as ReturnRequest
}

export async function createReturnRequest(input: {
  orderId: string
  customerId: string
  customerName: string
  productName: string
  quantity: number
  reason: string
}): Promise<ReturnRequest> {
  const { error: vError } = await supabase.rpc('validate_return', {
    p_order_id: input.orderId,
    p_customer_id: input.customerId,
  })
  if (vError) throw supabaseErrorToAppError(vError)
  const { data, error } = await supabase
    .from('return_requests')
    .insert({
      order_id: input.orderId,
      customer_id: input.customerId,
      customer_name: input.customerName,
      product_name: input.productName,
      quantity: input.quantity,
      reason: input.reason,
      status: 'PENDING',
    })
    .select()
    .single()
  if (error) throw supabaseErrorToAppError(error)
  return mapReturnRequest(data as unknown as Parameters<typeof mapReturnRequest>[0]) as ReturnRequest
}

export async function createReturnRequests(inputs: {
  orderId: string
  customerId: string
  customerName: string
  reason: string
  items: { productName: string; quantity: number }[]
}): Promise<ReturnRequest[]> {
  if (inputs.items.length === 0) throw new Error('No items selected for return')
  const { error: vError } = await supabase.rpc('validate_return', {
    p_order_id: inputs.orderId,
    p_customer_id: inputs.customerId,
  })
  if (vError) throw supabaseErrorToAppError(vError)
  const rows = inputs.items.map((it) => ({
    order_id: inputs.orderId,
    customer_id: inputs.customerId,
    customer_name: inputs.customerName,
    product_name: it.productName,
    quantity: it.quantity,
    reason: inputs.reason,
    status: 'PENDING' as const,
  }))
  const { data, error } = await supabase.from('return_requests').insert(rows).select()
  if (error) throw supabaseErrorToAppError(error)
  return (data || []).map((r) => mapReturnRequest(r as unknown as Parameters<typeof mapReturnRequest>[0]) as ReturnRequest)
}

export async function updateReturnStatus(returnId: string, status: 'APPROVED' | 'REJECTED' | 'PROCESSED'): Promise<void> {
  const { error } = await supabase.from('return_requests').update({ status }).eq('id', returnId)
  if (error) throw supabaseErrorToAppError(error)
}
