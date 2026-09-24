/* eslint-disable react-hooks/set-state-in-effect -- data fetching and derived state sync require setState inside effects */
import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { CartItem, CartSummary } from '../types/cart'
import type { Product } from '../types/product'
import { fetchCart, addToCart, updateCartItemQuantity, removeFromCart, clearCart } from '../services/cart'
import { normalizeError } from '../utils/errorHandling'
import config from '../constants/config'

type CartContextValue = {
  items: (CartItem & { product: Product })[]
  summary: CartSummary
  loading: boolean
  loadError: string | null
  itemCount: number
  distinctCount: number
  addItem: (productId: string, quantity?: number) => Promise<void>
  setQuantity: (itemId: string, quantity: number) => Promise<void>
  removeItem: (itemId: string) => Promise<void>
  clear: () => Promise<void>
  reload: () => Promise<void>
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [items, setItems] = useState<(CartItem & { product: Product })[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadCart = useCallback(async () => {
    if (!user) {
      setItems([])
      setLoadError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { items: cartItems } = await fetchCart(user.id)
      setItems(cartItems)
      setLoadError(null)
    } catch (err) {
      setItems([])
      setLoadError(normalizeError(err).message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadCart()

    if (!user?.id) return

    const channel = supabase
      .channel(`cart-changes-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cart_items', filter: `user_id=eq.${user.id}` },
        () => loadCart()
      )
      .subscribe((status, err) => {
        // Table may not exist yet (schema not pushed): stay silent — DB is Admin's job.
        if (err && !String(err).includes('PGRST205')) {
          console.warn('[cart] realtime subscribe', status, err)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, loadCart])

  const addItem = useCallback(async (productId: string, quantity = 1) => {
    if (!user) throw new Error('User not authenticated')
    // optimistic: if product already in cart, bump quantity immediately
    const existing = items.find((i) => i.productId === productId || (i.product && (i.product as Product).id === productId))
    if (existing) {
      const prev = items
      setItems((cur) => cur.map((it) => (it.id === existing.id ? { ...it, quantity: it.quantity + quantity } : it)))
      try {
        await addToCart(user.id, productId, quantity)
      } catch (e) {
        setItems(prev)
        throw e
      }
      return
    }
    await addToCart(user.id, productId, quantity)
    await loadCart()
  }, [user, loadCart, items])

  const setQuantity = useCallback(async (itemId: string, quantity: number) => {
    if (!user) throw new Error('User not authenticated')
    const prev = items
    if (quantity <= 0) {
      setItems((cur) => cur.filter((it) => it.id !== itemId))
    } else {
      setItems((cur) => cur.map((it) => (it.id === itemId ? { ...it, quantity } : it)))
    }
    try {
      await updateCartItemQuantity(user.id, itemId, quantity)
    } catch (e) {
      setItems(prev)
      throw e
    }
  }, [user, items])

  const removeItem = useCallback(async (itemId: string) => {
    if (!user) throw new Error('User not authenticated')
    const prev = items
    setItems((cur) => cur.filter((it) => it.id !== itemId))
    try {
      await removeFromCart(user.id, itemId)
    } catch (e) {
      setItems(prev)
      throw e
    }
  }, [user, items])

  const clear = useCallback(async () => {
    if (!user) throw new Error('User not authenticated')
    await clearCart(user.id)
    await loadCart()
  }, [user, loadCart])

  const summary = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + (item.product?.price || 0) * item.quantity, 0)
    const discount = items.reduce((sum, item) => {
      const itemDiscount = ((item.product?.price || 0) * item.quantity * (item.product?.discountPercent || 0)) / 100
      return sum + itemDiscount
    }, 0)
    const deliveryFee = config.deliveryFee
    const total = subtotal - discount + deliveryFee
    return { subtotal, discount, deliveryFee, total }
  }, [items])

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const distinctCount = items.length

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      summary,
      loading,
      loadError,
      itemCount,
      distinctCount,
      addItem,
      setQuantity,
      removeItem,
      clear,
      reload: loadCart,
    }),
    [items, summary, loading, loadError, itemCount, distinctCount, addItem, setQuantity, removeItem, clear, loadCart]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used within CartProvider')
  return value
}
