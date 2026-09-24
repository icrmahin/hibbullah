import { supabase } from '../lib/supabase'
import { supabaseErrorToAppError } from '../lib/errors'

export async function updateProfile(userId: string, data: { name: string; phone: string | null }): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ name: data.name, phone: data.phone, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw supabaseErrorToAppError(error)
}

export async function fetchProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) throw supabaseErrorToAppError(error)
  return data
}
