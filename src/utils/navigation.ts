import { router } from 'expo-router'
import type { Href } from 'expo-router'

export function goBack(fallback: string = '/(auth)/welcome'): void {
  if (router.canGoBack()) {
    router.back()
  } else {
    router.replace(fallback as Href)
  }
}

export function goBackToTabs(): void {
  goBack('/(customer)/(tabs)')
}

/**
 * The only two ways this app opens a product.
 *
 * There are two product-detail routes — the admin one and the customer one — and both are
 * named `[productId]`, so the id has to travel as a route param rather than as a string a
 * caller stitches together. Building the path by hand is exactly how the dashboard ended up
 * pushing `/admin/products/undefined`: `(admin)` is a route group and so never appears in a
 * URL, and the row had no product id to put in it anyway. Every card, carousel, search
 * result and dashboard row funnels through here, so there is one address to keep correct
 * instead of nine.
 *
 * A missing id navigates nowhere rather than somewhere broken — there is no product to
 * show, and an unmatched route is a worse outcome than a tap that does nothing.
 */
export function goToAdminProduct(productId: string | null | undefined): void {
  if (!productId) return
  router.push({ pathname: '/(admin)/products/[productId]', params: { productId } })
}

export function goToProduct(productId: string | null | undefined): void {
  if (!productId) return
  router.push({ pathname: '/(customer)/products/[productId]', params: { productId } })
}
