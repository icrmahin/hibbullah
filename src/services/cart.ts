import { supabase } from '../lib/supabase'
import type { CartItem, CartSummary } from '../types/cart'
import type { Product } from '../types/product'
import config from '../constants/config'

interface DbProduct {
  id: string
  name: string
  brand: string
  generic_name: string
  manufacturer_id: string
  category_id: string
  description: string
  price: number
  original_price?: number
  discount_percent?: number
  stock: number
  unit: string
  image_url?: string
  secondary_image_url?: string
  is_active: boolean
  is_featured?: boolean
  batch_number?: string
  expiry_date?: string
  created_at: string
  updated_at: string
}

function mapDbProductToProduct(db: DbProduct): Product {
  return {
    id: db.id,
    name: db.name,
    brand: db.brand,
    genericName: db.generic_name,
    manufacturerId: db.manufacturer_id,
    categoryId: db.category_id,
    description: db.description,
    price: db.price,
    originalPrice: db.original_price,
    discountPercent: db.discount_percent,
    stock: db.stock,
    unit: db.unit,
    image: db.image_url,
    primaryImage: db.image_url,
    secondaryImage: db.secondary_image_url,
    isActive: db.is_active,
    isFeatured: db.is_featured,
    batchNumber: db.batch_number,
    expiryDate: db.expiry_date,
    createdAt: db.created_at,
  }
}

export interface CartItemWithProduct extends CartItem {
  product: Product
}

export async function fetchCart(userId: string): Promise<{ items: CartItemWithProduct[]; summary: CartSummary }> {
  const { data, error } = await supabase
    .from('cart_items')
    .select(`
      *,
      products(*)
    `)
    .eq('user_id', userId)

  if (error) throw error

  const items: CartItemWithProduct[] = (data || []).map(item => ({
    ...item,
    product: mapDbProductToProduct(item.products as DbProduct),
  }))

  const subtotal = items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0)
  const discount = items.reduce((sum, item) => {
    const itemDiscount = (item.product.price * item.quantity * (item.product.discountPercent || 0)) / 100
    return sum + itemDiscount
  }, 0)
  const deliveryFee = config.deliveryFee
  const total = subtotal - discount + deliveryFee

  return {
    items,
    summary: { subtotal, discount, deliveryFee, total },
  }
}

export async function addToCart(userId: string, productId: string, quantity = 1): Promise<void> {
  // Check if item already exists
  const { data: existing } = await supabase
    .from('cart_items')
    .select('id, quantity')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: existing.quantity + quantity, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('cart_items')
      .insert({ user_id: userId, product_id: productId, quantity })
    if (error) throw error
  }
}

export async function updateCartItemQuantity(userId: string, itemId: string, quantity: number): Promise<void> {
  if (quantity <= 0) {
    await removeFromCart(userId, itemId)
    return
  }

  const { error } = await supabase
    .from('cart_items')
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function removeFromCart(userId: string, itemId: string): Promise<void> {
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('id', itemId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function clearCart(userId: string): Promise<void> {
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('user_id', userId)
  if (error) throw error
}