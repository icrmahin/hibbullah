import config from '../constants/config'
import type { Product } from '../types/product'
import type { Category } from '../types/category'
import type { Manufacturer } from '../types/manufacturer'
import type { Order, OrderItem } from '../types/order'
import type { Address } from '../types/address'
import type { NotificationItem } from '../types/notification'
import type { DeliveryCycle } from '../types/deliveryCycle'
import type { ReturnRequest } from '../types/return'
import type { AuditEntry } from '../types/audit'

type DbRecord = Record<string, unknown>

interface DbProductRow extends DbRecord {
  id: string
  name: string
  brand: string
  generic_name?: string | null
  genericName?: string | null
  manufacturer_id?: string | null
  manufacturerId?: string | null
  category_id?: string | null
  categoryId?: string | null
  description?: string | null
  price: number | string
  original_price?: number | string | null
  discount_percent?: number | null
  discountPercent?: number | null
  cost_price?: number | string | null
  costPrice?: number | string | null
  stock?: number | string | null
  unit?: string | null
  image_url?: string | null
  image?: string | null
  primaryImage?: string | null
  secondary_image_url?: string | null
  secondaryImage?: string | null
  is_active?: boolean | null
  isActive?: boolean | null
  is_featured?: boolean | null
  isFeatured?: boolean | null
  batch_number?: string | null
  batchNumber?: string | null
  expiry_date?: string | null
  expiryDate?: string | null
  created_at?: string | null
  createdAt?: string | null
  categories?: { name?: string; slug?: string } | null
  manufacturers?: { name?: string } | null
  category_name?: string | null
  manufacturer_name?: string | null
}

export function mapProduct(db: DbProductRow | null | undefined): Product | null | undefined {
  if (!db) return db as unknown as Product | null | undefined
  const row = db as DbProductRow
  return {
    id: String(row.id),
    name: String(row.name),
    brand: String(row.brand),
    genericName: String(row.generic_name ?? row.genericName ?? ''),
    manufacturerId: String(row.manufacturer_id ?? row.manufacturerId ?? ''),
    categoryId: String(row.category_id ?? row.categoryId ?? ''),
    description: String(row.description ?? ''),
    price: Number(row.price),
    originalPrice: row.original_price != null ? Number(row.original_price) : row.originalPrice != null ? Number(row.originalPrice) : undefined,
    discountPercent: Number(row.discount_percent ?? row.discountPercent ?? 0),
    costPrice: row.cost_price != null ? Number(row.cost_price) : row.costPrice != null ? Number(row.costPrice) : undefined,
    stock: Number(row.stock ?? 0),
    unit: String(row.unit ?? 'pack'),
    image: (row.image_url ?? row.image ?? undefined) as string | undefined,
    primaryImage: (row.image_url ?? row.primaryImage ?? row.image ?? undefined) as string | undefined,
    secondaryImage: (row.secondary_image_url ?? row.secondaryImage ?? undefined) as string | undefined,
    isActive: Boolean(row.is_active ?? row.isActive ?? true),
    isFeatured: Boolean(row.is_featured ?? row.isFeatured ?? false),
    batchNumber: (row.batch_number ?? row.batchNumber ?? undefined) as string | undefined,
    expiryDate: (row.expiry_date ?? row.expiryDate ?? undefined) as string | undefined,
    createdAt: String(row.created_at ?? row.createdAt ?? ''),
    // The list functions return the joined names alongside the row, so a screen
    // can label itself without having to load and search the whole category or
    // manufacturer table to resolve one id. A single-row fetch joins them as
    // nested objects instead, so both shapes are read here.
    categoryName: row.category_name ?? row.categories?.name ?? undefined,
    manufacturerName: row.manufacturer_name ?? row.manufacturers?.name ?? undefined,
    _rawCategory: row.categories ?? undefined,
    _rawManufacturer: row.manufacturers ?? undefined,
  } as Product & { _rawCategory?: Category | null; _rawManufacturer?: Manufacturer | null }
}

type DbProfileRow = DbRecord & {
  id: string
  name?: string | null
  email?: string | null
  phone?: string | null
  role?: string | null
  avatar_url?: string | null
  created_at?: string | null
}

export type MappedProfile = {
  id: string
  name: string
  email: string
  phone: string
  role: 'customer' | 'admin'
  avatar?: string
  createdAt: string
}

/**
 * `avatar_url` -> `avatar` lived as a one-off expression in AuthProvider, so the
 * admin customer screens had no way to read a profile picture. Single mapping,
 * reused everywhere a profiles row is read.
 */
export function mapProfile(db: DbProfileRow | null | undefined): MappedProfile | null {
  if (!db) return null
  const row = db as DbProfileRow
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    role: row.role === 'admin' ? 'admin' : 'customer',
    avatar: (row.avatar_url ?? undefined) as string | undefined,
    createdAt: String(row.created_at ?? ''),
  }
}

type DbOrderRow = DbRecord & {
  id: string
  order_number?: string
  orderNumber?: string
  customer_id?: string
  customerId?: string
  customer_name?: string
  customerName?: string
  created_at?: string
  createdAt?: string
  status: string
  subtotal?: number | string | null
  discount?: number | string | null
  delivery_fee?: number | string | null
  deliveryFee?: number | string | null
  total?: number | string | null
  payment_method?: string
  paymentMethod?: string
  address?: string
  order_items?: DbRecord[]
  items?: DbRecord[]
  timeline?: unknown
}

export function mapOrder(db: DbOrderRow | null | undefined): Order | null | undefined {
  if (!db) return db as unknown as Order | null | undefined
  const row = db as DbOrderRow
  const rawItems = (row.order_items ?? row.items ?? []) as DbRecord[]
  const items: OrderItem[] = rawItems.map((it) => {
    const r = it as Record<string, unknown>
    return {
      id: String(r.id ?? ''),
      productId: String(r.product_id ?? r.productId ?? ''),
      productName: String(r.product_name ?? r.productName ?? ''),
      quantity: Number(r.quantity ?? 0),
      unitPrice: Number(r.unit_price ?? r.unitPrice ?? 0),
      discountPercent: Number(r.discount_percent ?? r.discountPercent ?? 0),
      total: Number(r.total ?? 0),
    }
  })
  return {
    id: String(row.id),
    orderNumber: String(row.order_number ?? row.orderNumber ?? ''),
    customerId: String(row.customer_id ?? row.customerId ?? ''),
    customerName: String(row.customer_name ?? row.customerName ?? ''),
    createdAt: String(row.created_at ?? row.createdAt ?? ''),
    status: String(row.status),
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    deliveryFee: Number(row.delivery_fee ?? row.deliveryFee ?? config.deliveryFee),
    total: Number(row.total ?? 0),
    paymentMethod: String(row.payment_method ?? row.paymentMethod ?? 'CASH_ON_DELIVERY'),
    address: String(row.address ?? ''),
    items,
    timeline: (row.timeline as unknown[]) ?? [],
  } as Order
}

export function mapAddress(db: DbRecord | null | undefined): Address | null | undefined {
  if (!db) return db as unknown as Address | null | undefined
  const row = db as DbRecord & { id: string; label: string; street: string; city: string; county?: string | null; postal_code?: string | null; postalCode?: string | null; is_default?: boolean | null; isDefault?: boolean | null }
  return {
    id: String(row.id),
    label: String(row.label),
    street: String(row.street),
    city: String(row.city),
    county: (row.county ?? undefined) as string | undefined,
    postalCode: String(row.postal_code ?? row.postalCode ?? ''),
    isDefault: Boolean(row.is_default ?? row.isDefault ?? false),
  }
}

export function mapNotification(db: DbRecord | null | undefined): NotificationItem | null | undefined {
  if (!db) return db as unknown as NotificationItem | null | undefined
  const row = db as DbRecord & { id: string; title: string; body: string; created_at?: string; createdAt?: string; read?: boolean | null; type?: string | null }
  return {
    id: String(row.id),
    title: String(row.title),
    body: String(row.body),
    createdAt: String(row.created_at ?? row.createdAt ?? ''),
    read: Boolean(row.read ?? false),
    type: String(row.type ?? 'info') as NotificationItem['type'],
  }
}

export function mapDeliveryCycle(db: DbRecord | null | undefined): DeliveryCycle | null | undefined {
  if (!db) return db as unknown as DeliveryCycle | null | undefined
  const row = db as DbRecord & { id: string; customer_id?: string; customerId?: string; status: DeliveryCycle['status']; started_at?: string; startedAt?: string; closes_at?: string; closesAt?: string; estimated_total?: number | string | null; estimatedTotal?: number | string | null; created_at?: string; createdAt?: string; delivery_cycle_items?: DbRecord[]; items?: DbRecord[]; products?: unknown[] }
  const rawItems = (row.delivery_cycle_items ?? row.items ?? []) as DbRecord[]
  const products = rawItems.map((it) => {
    const r = it as Record<string, unknown>
    const p = (r.products ?? r.product ?? {}) as Record<string, unknown>
    return {
      id: String(p.id ?? r.product_id ?? ''),
      name: String(p.name ?? 'Unknown'),
      price: p.price != null ? Number(p.price) : undefined,
      image: (p.image_url ?? p.image) as string | undefined,
      quantity: Number(r.quantity ?? 0),
      ...(p as object),
    }
  })
  return {
    id: String(row.id),
    customerId: String(row.customer_id ?? row.customerId ?? ''),
    status: row.status,
    startedAt: String(row.started_at ?? row.startedAt ?? ''),
    closesAt: String(row.closes_at ?? row.closesAt ?? ''),
    estimatedTotal: Number(row.estimated_total ?? row.estimatedTotal ?? 0),
    products: products.length ? (products as unknown as DeliveryCycle['products']) : ((row.products ?? []) as unknown as DeliveryCycle['products']),
    createdAt: String(row.created_at ?? row.createdAt ?? ''),
  }
}

export function mapReturnRequest(db: DbRecord | null | undefined): ReturnRequest | null | undefined {
  if (!db) return db as unknown as ReturnRequest | null | undefined
  const row = db as DbRecord & { id: string; order_id?: string; orderId?: string; customer_id?: string; customerId?: string; customer_name?: string; customerName?: string; product_name?: string; productName?: string; quantity: number; reason: string; status: string; created_at?: string; createdAt?: string }
  return {
    id: String(row.id),
    orderId: String(row.order_id ?? row.orderId ?? ''),
    customerId: String(row.customer_id ?? row.customerId ?? ''),
    customerName: String(row.customer_name ?? row.customerName ?? ''),
    productName: String(row.product_name ?? row.productName ?? ''),
    quantity: Number(row.quantity),
    reason: String(row.reason),
    status: row.status as ReturnRequest['status'],
    createdAt: String(row.created_at ?? row.createdAt ?? ''),
  }
}

export function mapAuditEntry(db: DbRecord | null | undefined): AuditEntry | null | undefined {
  if (!db) return db as unknown as AuditEntry | null | undefined
  const row = db as DbRecord & { id: string; actor_id?: string | null; actor?: string | null; action: string; timestamp?: string | null; created_at?: string | null; record_type?: string | null; recordType?: string | null; old_value?: unknown; oldValue?: unknown; new_value?: unknown; newValue?: unknown }
  return {
    id: String(row.id),
    actor: String(row.actor_id ?? row.actor ?? ''),
    action: String(row.action),
    timestamp: String(row.timestamp ?? row.created_at ?? new Date().toISOString()),
    recordType: String(row.record_type ?? row.recordType ?? ''),
    oldValue: typeof row.old_value === 'string' ? String(row.old_value) : row.old_value ? JSON.stringify(row.old_value) : typeof row.oldValue === 'string' ? String(row.oldValue) : row.oldValue ? JSON.stringify(row.oldValue) : undefined,
    newValue: typeof row.new_value === 'string' ? String(row.new_value) : row.new_value ? JSON.stringify(row.new_value) : typeof row.newValue === 'string' ? String(row.newValue) : row.newValue ? JSON.stringify(row.newValue) : undefined,
  }
}
