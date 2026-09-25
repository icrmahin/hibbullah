import { supabase } from '../lib/supabase'
import { supabaseErrorToAppError } from '../lib/errors'
import { normalizeBdPhone } from '../utils/phone'

const PHONE_TAKEN_MESSAGE = 'This phone number is already registered to another account.'

/**
 * `phone` may be null to clear it, or any format a Bangladeshi user would
 * actually type. It is normalized to canonical E.164 here — the single write
 * path — so the same person entering '018…', '880…' or '+880 …' can never end
 * up as two different rows, and the database check is always satisfied.
 */
export async function updateProfile(
  userId: string,
  data: { name: string; phone?: string | null },
): Promise<void> {
  const patch: { name: string; phone?: string | null; updated_at: string } = {
    name: data.name,
    updated_at: new Date().toISOString(),
  }

  if (data.phone !== undefined) {
    if (!data.phone || !data.phone.trim()) {
      patch.phone = null
    } else {
      const parsed = normalizeBdPhone(data.phone)
      if (!parsed.ok || !parsed.e164) {
        throw new Error(parsed.error ?? 'Enter a valid Bangladeshi phone number.')
      }
      patch.phone = parsed.e164
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)

  if (error) {
    // 23505 = unique_violation on idx_profiles_phone.
    if (error.code === '23505') throw new Error(PHONE_TAKEN_MESSAGE)
    throw supabaseErrorToAppError(error)
  }
}

/** Stores the Cloudinary URL for a profile picture, or null when it is removed. */
export async function setAvatarUrl(userId: string, avatarUrl: string | null): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw supabaseErrorToAppError(error)
}
