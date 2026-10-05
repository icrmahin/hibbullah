import { supabase } from '../lib/supabase'
import type { Advertisement, AdvertisementDestination, AdvertisementInput } from '../types/advertisement'

const COLUMNS =
  'id, title, subtitle, image_url, destination_type, destination_id, sort_order, is_active, starts_at, ends_at, created_at, updated_at'

const DESTINATIONS: AdvertisementDestination[] = ['none', 'product', 'category', 'manufacturer', 'url']

function mapAdvertisement(row: any): Advertisement {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    subtitle: row.subtitle ?? null,
    imageUrl: String(row.image_url ?? ''),
    destinationType: (row.destination_type ?? 'none') as AdvertisementDestination,
    destinationId: row.destination_id ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    isActive: Boolean(row.is_active),
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

/**
 * The form checks these before the request goes out.
 *
 * The database has the same rules as `check` constraints, but a Postgres check arrives as
 * a terse `23514` mentioning a constraint name nobody typed. Saying it in words here is
 * the difference between "End date must be after the start date." and an error dialog.
 */
function validate(input: AdvertisementInput): void {
  const title = input.title.trim()
  if (!title) throw new Error('Give the banner a title.')
  if (title.length > 80) throw new Error('Title must be 80 characters or fewer.')
  if (input.subtitle && input.subtitle.trim().length > 120)
    throw new Error('Subtitle must be 120 characters or fewer.')
  if (!input.imageUrl.trim()) throw new Error('Add a banner image.')
  if (!DESTINATIONS.includes(input.destinationType)) throw new Error('Choose where the banner leads.')
  if (input.destinationType === 'none' && input.destinationId) input.destinationId = null
  if (input.destinationType === 'url') {
    const url = (input.destinationId ?? '').trim()
    if (!url) throw new Error('Paste the link this banner opens.')
    if (!/^https?:\/\//i.test(url)) throw new Error('The link must start with http:// or https://')
  }
  if (input.destinationType !== 'none' && input.destinationType !== 'url') {
    if (!(input.destinationId ?? '').trim()) throw new Error('Pick what this banner leads to.')
  }
  if (input.startsAt && input.endsAt && new Date(input.endsAt) < new Date(input.startsAt))
    throw new Error('End date must be after the start date.')
  if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0)
    throw new Error('Display order must be a whole number of 0 or more.')
}

/**
 * Every banner the public is allowed to see, in display order.
 *
 * The active flag and the date window live in the `Anyone can view live advertisements`
 * policy, so this query cannot return an expired campaign even if a caller forgets to
 * filter — the database decides, once, for every screen.
 */
export async function fetchLiveAdvertisements(): Promise<Advertisement[]> {
  const { data, error } = await supabase
    .from('advertisements')
    .select(COLUMNS)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapAdvertisement)
}

/** Every banner including paused and expired ones. Readable only by an admin. */
export async function fetchAllAdvertisements(): Promise<Advertisement[]> {
  const { data, error } = await supabase
    .from('advertisements')
    .select(COLUMNS)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(mapAdvertisement)
}

export async function fetchAdvertisement(id: string): Promise<Advertisement | null> {
  const { data, error } = await supabase.from('advertisements').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapAdvertisement(data) : null
}

/**
 * `id` is chosen by the caller, not by the database, for one reason: the banner's image
 * is uploaded to Cloudinary under `<id>-p<suffix>` *before* the row exists, exactly the
 * way ProductForm does it. Two independent id sources would leave the row pointing at a
 * folder nobody owns and would break superseded-image reclamation.
 */
export async function createAdvertisement(input: AdvertisementInput, id: string): Promise<string> {
  validate(input)
  const { error } = await supabase.from('advertisements').insert({
    id,
    title: input.title.trim(),
    subtitle: input.subtitle?.trim() || null,
    image_url: input.imageUrl.trim(),
    destination_type: input.destinationType,
    destination_id: input.destinationId?.trim() || null,
    sort_order: input.sortOrder,
    is_active: input.isActive,
    starts_at: input.startsAt || null,
    ends_at: input.endsAt || null,
  })
  if (error) throw error
  return id
}

export async function updateAdvertisement(id: string, input: AdvertisementInput): Promise<void> {
  validate(input)
  const { error } = await supabase
    .from('advertisements')
    .update({
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() || null,
      image_url: input.imageUrl.trim(),
      destination_type: input.destinationType,
      destination_id: input.destinationId?.trim() || null,
      sort_order: input.sortOrder,
      is_active: input.isActive,
      starts_at: input.startsAt || null,
      ends_at: input.endsAt || null,
    })
    .eq('id', id)
  if (error) throw error
}

/** Flip `is_active` without touching anything else — the list's quick pause control. */
export async function setAdvertisementActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('advertisements').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

export async function deleteAdvertisement(id: string): Promise<void> {
  const { error } = await supabase.from('advertisements').delete().eq('id', id)
  if (error) throw error
}
