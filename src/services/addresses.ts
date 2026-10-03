import { supabase } from '../lib/supabase'
import { mapAddress } from '../lib/mappers'
import { requireAffected } from '../lib/requireAffected'
import type { Address } from '../types/address'

function toDbAddress(userId: string, address: Partial<Address>) {
  const db: any = {}
  if (address.label !== undefined) db.label = address.label
  if (address.street !== undefined) db.street = address.street
  if (address.city !== undefined) db.city = address.city
  if (address.county !== undefined) db.county = address.county
  if (address.postalCode !== undefined) db.postal_code = address.postalCode
  if (address.phone !== undefined) db.phone = address.phone
  if (address.isDefault !== undefined) db.is_default = address.isDefault
  if (userId) db.user_id = userId
  return db
}

export async function fetchAddresses(userId: string): Promise<Address[]> {
  const { data, error } = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map((r) => mapAddress(r as unknown as Parameters<typeof mapAddress>[0]) as Address)
}

export async function fetchAddressById(addressId: string): Promise<Address | null> {
  const { data, error } = await supabase
    .from('addresses')
    .select('*')
    .eq('id', addressId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return mapAddress(data as unknown as Parameters<typeof mapAddress>[0]) as Address
}

export async function createAddress(userId: string, address: Omit<Address, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<Address> {
  const { data, error } = await supabase
    .from('addresses')
    .insert(toDbAddress(userId, address))
    .select()
    .single()

  if (error) throw error
  return mapAddress(data as unknown as Parameters<typeof mapAddress>[0]) as Address
}

export async function updateAddress(addressId: string, userId: string, updates: Partial<Omit<Address, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<Address> {
  const { data, error } = await supabase
    .from('addresses')
    .update({ ...toDbAddress(userId, updates), updated_at: new Date().toISOString() })
    .eq('id', addressId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error
  return mapAddress(data as unknown as Parameters<typeof mapAddress>[0]) as Address
}

export async function deleteAddress(addressId: string, userId: string): Promise<void> {
  // Verified, not assumed. A DELETE that matches nothing answers 204 exactly like one that
  // matched, so the bin button used to report success while the address stayed put — which
  // is the same "it did not work" symptom as the dialog that never opened.
  const { data, error } = await supabase
    .from('addresses')
    .delete()
    .eq('id', addressId)
    .eq('user_id', userId)
    .select('id')
  if (error) throw error
  requireAffected(data, 'this address')
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<void> {
  // First, unset any existing default
  await supabase
    .from('addresses')
    .update({ is_default: false })
    .eq('user_id', userId)
    .eq('is_default', true)

  // Then set the new default
  const { data, error } = await supabase
    .from('addresses')
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('id', addressId)
    .eq('user_id', userId)
    .select('id')
  if (error) throw error
  // Checked, because the step above has already cleared the previous default. If this one
  // matched nothing the user is left with no default address at all, having been told
  // nothing went wrong.
  requireAffected(data, 'this address')
}