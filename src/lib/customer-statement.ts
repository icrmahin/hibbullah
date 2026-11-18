/**
 * Customer statement / consolidated report PDF export and sharing.
 *
 * Builds the statement markup via `src/lib/customer-statement-html` (pure,
 * testable in Node), then uses expo-print to render it to a PDF file on the
 * device and expo-sharing to offer the user a share/save sheet. Generation is
 * purely client-side, so there are no recurring server costs.
 *
 * Returns the file URI of the generated PDF. A share-sheet failure is logged
 * and the saved file path is still returned; only a generation failure throws,
 * so the caller can surface an error message.
 */

import { printToFileAsync } from 'expo-print'
import * as Sharing from 'expo-sharing'
import {
  buildCustomerStatementHtml,
  buildAllCustomersHtml,
  type StatementCustomer,
  type StatementOrder,
} from './customer-statement-html'
import type { Order } from '../types/order'

/** Shared A4 print dimensions (~96dpi). */
const PRINT_WIDTH = 794
const PRINT_HEIGHT = 1123

/**
 * Generates a customer statement PDF (complete history or last-N-days) and
 * offers to share/save it.
 */
export async function generateAndShareCustomerStatement(params: {
  customer: StatementCustomer
  orders: Order[]
  title: string
  subtitle?: string
  reportingPeriod?: string
  asOf: string
  emptyMessage?: string
  dialogTitle?: string
}): Promise<string> {
  const prepared = params.orders.map(prepareOrder)
  const html = buildCustomerStatementHtml({
    customer: params.customer,
    orders: prepared,
    title: params.title,
    subtitle: params.subtitle,
    reportingPeriod: params.reportingPeriod,
    asOf: params.asOf,
    emptyMessage: params.emptyMessage,
  })
  return renderAndShare(html, params.dialogTitle)
}

/**
 * Generates the all-customers consolidated report PDF and offers to
 * share/save it.
 */
export async function generateAndShareAllCustomersReport(params: {
  customers: (StatementCustomer & { orders: Order[] })[]
  asOf: string
  dialogTitle?: string
}): Promise<string> {
  const prepared = params.customers.map((c) => ({
    ...c,
    orders: c.orders.map(prepareOrder),
  }))
  const html = buildAllCustomersHtml({
    customers: prepared,
    asOf: params.asOf,
  })
  return renderAndShare(html, params.dialogTitle)
}

function prepareOrder(order: Order): StatementOrder {
  // The stored order total is the amount the customer was actually charged:
  // subtotal - discount + delivery fee. Re-deriving it from the item snapshots
  // yields the product-only subtotal and silently drops the delivery fee (and
  // any order-level discount), so statements disagreed with invoices and with
  // the dashboard's "Total spending". Current product prices are never used.
  const orderTotal = Number(order.total ?? 0)
  const status = (order.status || '').toUpperCase()
  return {
    order,
    orderTotal,
    isDelivered: status === 'DELIVERED',
    countsAsValue: status !== 'CANCELLED',
  }
}

async function renderAndShare(html: string, dialogTitle?: string): Promise<string> {
  let fileUri: string
  try {
    const result = await printToFileAsync({
      html,
      width: PRINT_WIDTH,
      height: PRINT_HEIGHT,
    })
    fileUri = result.uri
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : 'Could not generate the PDF.',
    )
  }

  if (await Sharing.isAvailableAsync()) {
    try {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle: dialogTitle || 'Hibbullah statement',
        UTI: 'com.adobe.pdf',
      })
    } catch (err) {
      // The PDF is already saved. Do not pretend the share sheet opened, but do
      // not throw away a valid file either — log the reason and return the path.
      console.warn('[statement] could not open the share sheet:', err instanceof Error ? err.message : err)
    }
  }

  return fileUri
}
