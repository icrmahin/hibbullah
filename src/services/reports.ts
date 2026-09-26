import { supabase } from '../lib/supabase'
import { supabaseErrorToAppError } from '../lib/errors'
import { config } from '../constants/config'

export interface SalesReport {
  revenue: number
  deliveredOrders: number
  discounts: number
}

export interface InventoryReport {
  lowStock: number
  outOfStock: number
  expiring: number
  inventoryValue: number
}

export interface ReportsBundle {
  sales: SalesReport
  inventory: InventoryReport
}

/**
 * Sales and inventory totals for the admin reports screens.
 *
 * This used to read every row of `orders`, `products` and `inventory_items` into the
 * client and add them up in JavaScript. On a 4,000-product catalogue that is 4,000
 * product rows plus every batch, on every visit to the screen, to produce five numbers.
 * `get_reports` does the same arithmetic in the database and returns one row, so the cost
 * stops scaling with the size of the shop.
 *
 * The thresholds are passed in rather than hardcoded on either side. `config` is the only
 * definition of them: hardcoding 10 and 90 here is what had the reports screen counting a
 * 90-day expiry window while `config.expiryWarningDays` says 60, so the reports screen and
 * the expiry screen disagreed about what "expiring soon" meant.
 *
 * One call serves both report screens, so the overview costs a single round trip instead
 * of the two it used to make by running the sales and inventory fetches in parallel.
 */
export async function fetchReports(): Promise<ReportsBundle> {
  const { data, error } = await supabase.rpc('get_reports', {
    p_low_stock_threshold: config.lowStockThreshold,
    p_expiry_warning_days: config.expiryWarningDays,
  })
  if (error) throw supabaseErrorToAppError(error)
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined
  if (!row) throw new Error('The reports service returned no totals')

  // Postgres numeric arrives as a string to keep precision, which would otherwise render
  // as e.g. "1164.00" and make the arithmetic downstream concatenate instead of add.
  const num = (v: unknown) => Number(v ?? 0)
  return {
    sales: {
      revenue: num(row.revenue),
      deliveredOrders: num(row.delivered_orders),
      // Counted over DELIVERED orders, the same set as `revenue`. These two sat side by
      // side on one card while being computed over different populations, so their
      // difference did not mean anything; the RPC now agrees on the scope.
      discounts: num(row.discounts),
    },
    inventory: {
      lowStock: num(row.low_stock),
      outOfStock: num(row.out_of_stock),
      expiring: num(row.expiring),
      inventoryValue: num(row.inventory_value),
    },
  }
}

export async function fetchSalesReport(): Promise<SalesReport> {
  return (await fetchReports()).sales
}

export async function fetchInventoryReport(): Promise<InventoryReport> {
  return (await fetchReports()).inventory
}
