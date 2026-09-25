import { supabase } from '../lib/supabase'
import { mapProduct } from '../lib/mappers'
import { deleteCloudinaryAsset, resolveProductImageUri } from './storage'
import { sanitizeSearchTerm } from './searchQuery'
import { randomUuid } from '../utils/uuid'
import type { Product } from '../types/product'
import type { Category } from '../types/category'
import type { Manufacturer } from '../types/manufacturer'

const DEFAULT_PAGE_SIZE = 24
const MAX_PAGE_SIZE = 100

/** Filters shared by browse and search. */
export interface ProductListParams {
  categoryId?: string
  manufacturerId?: string
  /** 'active' | 'inactive' | undefined for both. Admin-only. */
  status?: 'active' | 'inactive'
  /** 'in_stock' | 'low' | 'out' | undefined for both. Admin-only. */
  stock?: 'in_stock' | 'low' | 'out'
  /** Below this many units counts as "low". Defaults to 10 server-side. */
  lowStockThreshold?: number
  limit?: number
}

export type ProductCursor = { createdAt: string; id: string } | null

export interface BrowseResult {
  data: Product[]
  /** Pass back as the next page's cursor. null when the last page was reached. */
  cursor: ProductCursor
  hasMore: boolean
}

export interface SearchResult {
  data: Product[]
  total: number
  hasMore: boolean
}

function mapRows(rows: unknown[] | null): Product[] {
  return (rows || [])
    .map((row) => mapProduct(row as unknown as Parameters<typeof mapProduct>[0]))
    .filter(Boolean) as Product[]
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function clampLimit(limit?: number): number {
  const parsed = toOptionalNumber(limit)
  if (parsed === undefined) return DEFAULT_PAGE_SIZE
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_PAGE_SIZE)
}

/**
 * Keyset-paged catalog browse. Constant cost at any page depth, and stable
 * ordering via (created_at, id) — unlike the OFFSET paging it replaces, rows can
 * never be skipped or repeated when two products share a created_at.
 *
 * Returns no total on purpose: counting would mean scanning the whole filtered
 * set on every page, which is the cost this endpoint exists to avoid.
 */
export async function browseProducts(
  params: ProductListParams & { cursor?: ProductCursor } = {},
  signal?: AbortSignal,
): Promise<BrowseResult> {
  const limit = clampLimit(params.limit)

  const request = supabase.rpc('browse_products', {
    p_category: params.categoryId ?? null,
    p_manufacturer: params.manufacturerId ?? null,
    p_status: params.status ?? null,
    p_stock: params.stock ?? null,
    p_low_stock_threshold: params.lowStockThreshold ?? null,
    p_cursor_created_at: params.cursor?.createdAt ?? null,
    p_cursor_id: params.cursor?.id ?? null,
    p_limit: limit,
  })
  if (signal) request.abortSignal(signal)

  const { data, error } = await request

  if (error) throw error

  const rows = (data || []) as Record<string, unknown>[]
  const products = mapRows(rows)
  const hasMore = rows.length === limit && products.length > 0
  const last = rows[rows.length - 1]

  return {
    data: products,
    hasMore,
    cursor: hasMore && last
      ? { createdAt: String(last.created_at ?? ''), id: String(last.id ?? '') }
      : null,
  }
}

/**
 * Ranked search: exact name, then name prefix, then brand/generic prefix, then
 * trigram similarity for typo tolerance. The total arrives in the same response
 * via count(*) over (), so there is no second exact-count query per keystroke.
 */
export async function searchProductList(
  params: ProductListParams & { query: string; offset?: number },
  signal?: AbortSignal,
): Promise<SearchResult> {
  const term = sanitizeSearchTerm(params.query)
  const limit = clampLimit(params.limit)
  const offset = Math.max(toOptionalNumber(params.offset) ?? 0, 0)

  if (!term) return { data: [], total: 0, hasMore: false }

  const request = supabase.rpc('search_products', {
    p_query: term,
    p_category: params.categoryId ?? null,
    p_manufacturer: params.manufacturerId ?? null,
    p_status: params.status ?? null,
    p_stock: params.stock ?? null,
    p_low_stock_threshold: params.lowStockThreshold ?? null,
    p_limit: limit,
    p_offset: offset,
  })
  if (signal) request.abortSignal(signal)

  const { data, error } = await request

  if (error) throw error

  const rows = (data || []) as Record<string, unknown>[]
  const total = toOptionalNumber(rows[0]?.total_count) ?? 0

  return {
    data: mapRows(rows),
    total,
    hasMore: offset + rows.length < total,
  }
}

/**
 * One entry point for every product list in the app: searches when there is a
 * term, browses with a keyset cursor otherwise. Replaces four different
 * hand-rolled ILIKE implementations plus two client-side filters.
 */
export async function listProducts(
  params: ProductListParams & { query?: string; cursor?: ProductCursor; offset?: number },
  signal?: AbortSignal,
): Promise<SearchResult & { cursor: ProductCursor }> {
  if (sanitizeSearchTerm(params.query)) {
    const result = await searchProductList(params as ProductListParams & { query: string }, signal)
    return { ...result, cursor: null }
  }
  const result = await browseProducts(params, signal)
  return { data: result.data, total: 0, hasMore: result.hasMore, cursor: result.cursor }
}

/** Quick-search convenience wrapper. Returns only the rows, never the total. */
export async function searchProducts(query: string, limit = 10): Promise<Product[]> {
  const { data } = await searchProductList({ query, limit })
  return data
}

export async function fetchProductById(productId: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, slug), manufacturers(name)')
    .eq('id', productId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return mapProduct(data as unknown as Parameters<typeof mapProduct>[0]) as Product
}

export async function fetchCategories(query?: string): Promise<Category[]> {
  let builder = supabase.from('categories').select('*').order('name').limit(200)
  const term = sanitizeSearchTerm(query)
  if (term) builder = builder.ilike('name', `%${term}%`)
  const { data, error } = await builder
  if (error) throw error
  return (data || []) as Category[]
}

export async function fetchManufacturers(query?: string): Promise<Manufacturer[]> {
  let builder = supabase.from('manufacturers').select('*').order('name').limit(200)
  const term = sanitizeSearchTerm(query)
  if (term) builder = builder.ilike('name', `%${term}%`)
  const { data, error } = await builder
  if (error) throw error
  return (data || []) as Manufacturer[]
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505'

/**
 * Re-adding something that already exists is a normal thing to do from the inline
 * "add" field on the product form, and the raw error is useless to an admin: it
 * arrives as `duplicate key value violates unique constraint
 * "idx_manufacturers_name_unique"` with no indication of which row clashed.
 *
 * So on a unique violation the existing row is looked up and returned instead. The
 * caller cannot tell the difference, which is the point: the admin's intent was "I
 * want this category selected", and it now is.
 *
 * The match is on the same expression the unique index uses, not on an exact
 * spelling, because that index is what actually rejected the insert.
 */
async function findExistingByName(
  table: 'categories' | 'manufacturers',
  name: string,
  column: 'slug' | 'name',
  value: string,
): Promise<Record<string, unknown> | null> {
  let query = supabase.from(table).select('*')
  query =
    table === 'categories' && column === 'slug'
      ? query.eq('slug', value)
      : query.ilike('name', name.trim())
  const { data } = await query.maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
}

export async function createCategory(input: { name: string; description?: string }): Promise<Category> {
  const name = input.name.trim()
  const slug = slugify(name)
  if (!slug) throw new Error('Category name is required. Use at least one letter or number.')

  const { data, error } = await supabase
    .from('categories')
    .insert({ name, slug, description: input.description?.trim() || null })
    .select('*')
    .single()
  if (error) {
    // categories_slug_key is unique. A different name that slugifies to the same slug
    // ("Diabetes & Care" and "diabetes-care") lands here too, and returning the
    // other row would silently pick a category the admin did not ask for, so that
    // case is reported instead of resolved.
    if (error.code === UNIQUE_VIOLATION) {
      const sameName = await findExistingByName('categories', name, 'name', '')
      if (sameName) return sameName as Category
      const clashing = await findExistingByName('categories', name, 'slug', slug)
      throw new Error(
        clashing
          ? `"${clashing.name}" already covers that name. Pick it from the list, or rename it first.`
          : 'That category already exists. Pick it from the list instead.',
      )
    }
    throw error
  }
  return data as Category
}

export async function createManufacturer(input: { name: string; country?: string }): Promise<Manufacturer> {
  const name = input.name.trim()
  if (!name) throw new Error('Manufacturer name is required.')

  const { data, error } = await supabase
    .from('manufacturers')
    .insert({ name, country: input.country?.trim() || null })
    .select('*')
    .single()
  if (error) {
    // idx_manufacturers_name_unique is unique on lower(btrim(name)), so the only way
    // to collide is to already have that manufacturer, possibly spelled differently.
    if (error.code === UNIQUE_VIOLATION) {
      const existing = await findExistingByName('manufacturers', name, 'name', '')
      if (existing) return existing as Manufacturer
      throw new Error('That manufacturer already exists. Pick it from the list instead.')
    }
    throw error
  }
  return data as Manufacturer
}

export type CreateProductInput = {
  name: string
  brand: string
  genericName: string
  manufacturerId: string
  categoryId: string
  description: string
  price: number
  stock: number
  unit: string
  isActive: boolean
  /**
   * Optional. The form generates one up front so it can upload the product
   * image to `products/<id>` before the row exists; pass it through so the
   * image and the row agree.
   */
  id?: string
  originalPrice?: number | null
  discountPercent?: number | null
  costPrice?: number | null
  batchNumber?: string | null
  expiryDate?: string | null
  isFeatured?: boolean | null
  /** Images must already be uploaded. See uploadProductImage. */
  image?: string | null
  primaryImage?: string | null
  secondaryImage?: string | null
}

/**
 * Creates the product and its first stock batch in one transaction via the
 * create_product RPC. Before this, a failure on the inventory insert left a
 * product row with stock 0 and the form still on screen.
 *
 * Normalizes the two inputs Postgres is strict about, so a normal form state
 * can never come back as an RPC 400:
 * - discount without an original price is rejected by the check_discount
 *   trigger, so it is coerced to 0 (the form also blocks it with a message).
 * - p_expiry_date is cast to date by PostgREST before the function runs, so a
 *   non-YYYY-MM-DD value is a 400 with no row written; it is validated here.
 */
export async function createProduct(input: CreateProductInput): Promise<Product> {
  const productId = input.id ?? randomUuid()

  const name = input.name?.trim()
  const brand = input.brand?.trim()
  const genericName = input.genericName?.trim()
  if (!name) throw new Error('Product name is required.')
  if (!brand) throw new Error('Brand is required.')
  if (!genericName) throw new Error('Generic name is required.')
  if (!input.manufacturerId) throw new Error('Select a manufacturer.')
  if (!input.categoryId) throw new Error('Select a category.')

  const price = Number(input.price)
  if (!Number.isFinite(price) || price <= 0) throw new Error('Enter a valid price.')

  const costInput = input.costPrice != null ? Number(input.costPrice) : NaN
  const costPrice = Number.isFinite(costInput)
    ? costInput
    : Math.round(price * 0.8 * 100) / 100
  if (costPrice < 0 || costPrice > price)
    throw new Error('Cost cannot exceed selling price.')

  const stock = Number(input.stock ?? 0)
  if (!Number.isInteger(stock) || stock < 0) throw new Error('Enter a valid whole-number stock.')

  // Discount is only meaningful against an original price. Coerce rather than
  // send an invalid pairing the trigger would reject with a 400.
  const originalRaw = input.originalPrice ?? null
  const originalPrice = originalRaw != null ? Number(originalRaw) : null
  if (originalPrice != null && (!Number.isFinite(originalPrice) || originalPrice <= 0))
    throw new Error('Enter a valid original price.')
  const discountRaw = input.discountPercent ?? null
  const discountNum = discountRaw != null ? Number(discountRaw) : 0
  if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > 99)
    throw new Error('Discount must be 0-99%.')
  const discountPercent = originalPrice == null ? 0 : discountNum

  const batchNumber = input.batchNumber?.trim() || null

  let expiryDate: string | null = null
  if (input.expiryDate) {
    const day = input.expiryDate.split('T')[0].trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)))
      throw new Error('Expiry date must be YYYY-MM-DD (e.g. 2027-05-12).')
    expiryDate = day
  }

  const { error } = await supabase.rpc('create_product', {
    p_id: productId,
    p_name: name,
    p_brand: brand,
    p_generic_name: genericName,
    p_description: input.description ?? '',
    p_manufacturer_id: input.manufacturerId,
    p_category_id: input.categoryId,
    p_price: price,
    p_original_price: originalPrice,
    p_discount_percent: discountPercent,
    p_cost_price: costPrice,
    p_unit: input.unit?.trim() || 'pack',
    p_image_url: input.primaryImage ?? input.image ?? null,
    p_secondary_image_url: input.secondaryImage ?? null,
    p_is_active: input.isActive,
    p_is_featured: input.isFeatured ?? false,
    p_initial_stock: stock,
    p_batch_number: batchNumber,
    p_expiry_date: expiryDate,
  })

  if (error) throw toFriendlyCreateError(error)

  const created = await fetchProductById(productId)
  if (!created) throw new Error('Product was created but could not be read back.')
  return created
}

/**
 * PostgREST RPC failures arrive as terse Postgres messages
 * ("discount_percent must be 0...", "invalid input syntax for type date",
 * "violates foreign key constraint", "not authorized"). Map the known ones to
 * something an admin can act on; pass everything else through.
 */
function toFriendlyCreateError(error: { message?: string; code?: string }): Error {
  const message = error.message ?? ''
  if (/discount_percent must be 0/i.test(message))
    return new Error('Add an original price when a discount is set, or leave discount empty.')
  if (/invalid input syntax for type date/i.test(message))
    return new Error('Expiry date must be YYYY-MM-DD (e.g. 2027-05-12).')
  if (/violates foreign key constraint/i.test(message)) {
    if (/manufacturer/i.test(message)) return new Error('That manufacturer no longer exists. Pick another one.')
    if (/categor/i.test(message)) return new Error('That category no longer exists. Pick another one.')
    return new Error('A linked category or manufacturer no longer exists. Re-select them and try again.')
  }
  if (/not authorized|42501|permission denied|violates row-level/i.test(message))
    return new Error('Your account is not an admin. Sign in with an admin account to add products.')
  if (/duplicate key|already exists|23505/i.test(message))
    return new Error('That product already exists.')
  return error instanceof Error ? error : new Error(message || 'Could not save the product. Please try again.')
}

/**
 * Partial update.
 *
 * `undefined` means "leave unchanged"; `null` means "clear". That distinction is
 * what stops an edit from silently wiping cost_price / original_price /
 * discount_percent, which the previous version did whenever the form sent those
 * fields blank. The nullable columns are widened to accept `null` here for the
 * same reason — `Product` describes a read, and a read never has to clear
 * anything.
 */
export type ProductUpdate = Partial<
  Omit<
    Product,
    | 'id'
    | 'createdAt'
    | 'originalPrice'
    | 'discountPercent'
    | 'costPrice'
    | 'batchNumber'
    | 'expiryDate'
    | 'primaryImage'
    | 'secondaryImage'
    | 'image'
  >
> & {
  originalPrice?: number | null
  discountPercent?: number | null
  costPrice?: number | null
  batchNumber?: string | null
  expiryDate?: string | null
  primaryImage?: string | null
  secondaryImage?: string | null
  image?: string | null
}

export async function updateProduct(productId: string, input: ProductUpdate): Promise<Product> {
  const payload: Record<string, unknown> = {}

  if (input.name !== undefined) payload.name = input.name
  if (input.brand !== undefined) payload.brand = input.brand
  if (input.genericName !== undefined) payload.generic_name = input.genericName
  if (input.manufacturerId !== undefined) payload.manufacturer_id = input.manufacturerId
  if (input.categoryId !== undefined) payload.category_id = input.categoryId
  if (input.description !== undefined) payload.description = input.description
  if (input.price !== undefined) payload.price = input.price
  if (input.unit !== undefined) payload.unit = input.unit
  if (input.isActive !== undefined) payload.is_active = input.isActive
  if (input.isFeatured !== undefined) payload.is_featured = input.isFeatured

  if (input.costPrice !== undefined) {
    payload.cost_price = input.costPrice === null ? null : Number(input.costPrice)
  }
  if (input.originalPrice !== undefined) {
    payload.original_price = input.originalPrice === null ? null : Number(input.originalPrice)
  }
  if (input.discountPercent !== undefined) {
    payload.discount_percent = input.discountPercent === null ? 0 : Number(input.discountPercent)
  }

  if (input.primaryImage !== undefined || input.image !== undefined) {
    payload.image_url = await resolveProductImageUri(input.primaryImage ?? input.image ?? null, productId, 'primary')
  }
  if (input.secondaryImage !== undefined) {
    payload.secondary_image_url = await resolveProductImageUri(input.secondaryImage ?? null, productId, 'secondary')
  }

  if (Object.keys(payload).length > 0) {
    const { error } = await supabase.from('products').update(payload).eq('id', productId)
    if (error) throw error
  }

  // Inventory is a separate ledger and `stock` is the sum of the batches, so a
  // change to the total has to be distributed rather than written to one
  // arbitrary row. An `undefined` stock means the admin only touched the batch or
  // expiry, and the quantities are then left exactly as they are.
  if (input.stock !== undefined || input.batchNumber !== undefined || input.expiryDate !== undefined) {
    const expiry = input.expiryDate ? input.expiryDate.split('T')[0] : null
    const batchNumber = input.batchNumber?.trim() || null

    if (batchNumber) {
      const { data: existing } = await supabase
        .from('inventory_items')
        .select('id, quantity')
        .eq('product_id', productId)
        .eq('batch_number', batchNumber)
        .maybeSingle()
      const qty = input.stock ?? (existing ? Number(existing.quantity) : 0)

      if (existing) {
        const patch: Record<string, unknown> = { quantity: qty }
        if (input.expiryDate !== undefined) patch.expiry_date = expiry
        const { error } = await supabase.from('inventory_items').update(patch).eq('id', existing.id)
        if (error) throw error
      } else if (input.stock !== undefined && qty > 0) {
        const { error } = await supabase
          .from('inventory_items')
          .insert({ product_id: productId, batch_number: batchNumber, quantity: qty, expiry_date: expiry })
        if (error) throw error
      }
    } else if (input.stock !== undefined) {
      // A product can have several batches. The entered number is the product
      // total, so it is distributed: the oldest batch absorbs the total minus
      // everything the other batches hold, and the ledger stays an accurate
      // breakdown of that same total.
      const { data: batches } = await supabase
        .from('inventory_items')
        .select('id, quantity')
        .eq('product_id', productId)
        .order('last_updated', { ascending: true })
      const others = (batches || []).slice(1).reduce((s, b) => s + Number(b.quantity || 0), 0)
      const target = Math.max(input.stock - others, 0)
      if (batches && batches.length > 0) {
        const patch: Record<string, unknown> = { quantity: target }
        if (input.expiryDate !== undefined) patch.expiry_date = expiry
        const { error } = await supabase.from('inventory_items').update(patch).eq('id', batches[0].id)
        if (error) throw error
      } else if (input.stock > 0) {
        const { error } = await supabase.from('inventory_items').insert({
          product_id: productId,
          batch_number: `BATCH-${productId.slice(0, 8).toUpperCase()}-001`,
          quantity: input.stock,
          expiry_date: expiry,
        })
        if (error) throw error
      }
    } else if (input.expiryDate !== undefined) {
      // Only the expiry changed: apply it to the oldest batch rather than
      // creating a zero-quantity row for a batch number that was never given.
      const { data: oldest } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('product_id', productId)
        .order('last_updated', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (oldest) {
        const { error } = await supabase
          .from('inventory_items')
          .update({ expiry_date: expiry })
          .eq('id', oldest.id)
        if (error) throw error
      }
    }
  }

  const updated = await fetchProductById(productId)
  if (!updated) throw new Error('Product was updated but could not be read back.')
  return updated
}

export async function deleteProduct(productId: string): Promise<void> {
  // Soft delete if referenced by orders — preserve history (PM-01)
  const { data: ref, error: refError } = await supabase.from('order_items').select('id').eq('product_id', productId).limit(1)
  if (refError) throw refError
  if (ref && ref.length > 0) {
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', productId)
    if (error) throw error
    return
  }
  const { error: invError } = await supabase.from('inventory_items').delete().eq('product_id', productId)
  if (invError) throw invError
  const { error } = await supabase.from('products').delete().eq('id', productId)
  if (error) throw error
  // Only now that the row is gone: a hard-deleted product must not keep its
  // images in Cloudinary.
  await deleteCloudinaryAsset({ scope: 'product', productId })
}

export async function deactivateProduct(productId: string): Promise<void> {
  const { error } = await supabase.from('products').update({ is_active: false }).eq('id', productId)
  if (error) throw error
}

export async function activateProduct(productId: string): Promise<void> {
  const { error } = await supabase.from('products').update({ is_active: true }).eq('id', productId)
  if (error) throw error
}

export async function fetchProductInventory(productId: string): Promise<{ id: string; batchNumber: string; quantity: number; status: string; expiryDate?: string }[]> {
  const { data, error } = await supabase.from('inventory_items').select('id, batch_number, quantity, status, expiry_date').eq('product_id', productId).order('expiry_date', { ascending: true })
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    batchNumber: String(row.batch_number ?? ''),
    quantity: Number(row.quantity ?? 0),
    status: String(row.status ?? ''),
    expiryDate: (row.expiry_date ?? undefined) as string | undefined,
  }))
}
