/**
 * A merchant-managed homepage banner.
 *
 * Deliberately not a product and not a discount: it has its own image, its own words and
 * a destination that need not be a product at all. `isActive`, the product's `isActive`
 * and the product's `discountPercent` are three independent facts, and only one of them
 * is "is this banner showing".
 */
export type AdvertisementDestination = 'none' | 'product' | 'category' | 'manufacturer' | 'url'

export type Advertisement = {
  id: string
  title: string
  subtitle: string | null
  imageUrl: string
  destinationType: AdvertisementDestination
  /** String because it may be a url; resolved against the route it names on tap. */
  destinationId: string | null
  sortOrder: number
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
}

/** The subset the form owns. `id` and the timestamps are the database's. */
export type AdvertisementInput = {
  title: string
  subtitle?: string | null
  imageUrl: string
  destinationType: AdvertisementDestination
  destinationId?: string | null
  sortOrder: number
  isActive: boolean
  startsAt?: string | null
  endsAt?: string | null
}
