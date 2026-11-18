/**
 * Financial report PDF export and sharing.
 *
 * Builds the sales report markup via `src/lib/financial-report-html` (pure,
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
import { buildSalesReportHtml, type SalesOrder } from './financial-report-html'
import type { Order } from '../types/order'

/** Shared A4 print dimensions (~96dpi). */
const PRINT_WIDTH = 794
const PRINT_HEIGHT = 1123

/**
 * Prepares stored orders into sales-report display fields.
 */
function prepareSalesOrders(orders: Order[]): SalesOrder[] {
  return orders.map((order) => {
    // Use the charged total stored on the order (subtotal - discount + delivery
    // fee), not the sum of item snapshots. The item sum is only the product
    // subtotal and understated every order by the delivery fee.
    const orderTotal = Number(order.total ?? 0)
    const statusUpper = (order.status || '').toUpperCase()
    return {
      order,
      orderTotal,
      isDelivered: statusUpper === 'DELIVERED',
      countsAsValue: statusUpper !== 'CANCELLED',
      statusUpper,
    }
  })
}

/**
 * Generates a monthly or yearly sales report PDF and offers to share/save it.
 */
export async function generateAndShareSalesReport(params: {
  docTitle: string
  subtitle?: string
  reportingPeriod: string
  asOf: string
  orders: Order[]
  emptyMessage?: string
  monthlyBreakdown?: {
    month: string
    orderCount: number
    deliveredRevenue: number
    totalOrderValue: number
  }[]
  dialogTitle?: string
}): Promise<string> {
  const prepared = prepareSalesOrders(params.orders)
  const html = buildSalesReportHtml({
    docTitle: params.docTitle,
    subtitle: params.subtitle,
    reportingPeriod: params.reportingPeriod,
    asOf: params.asOf,
    orders: prepared,
    emptyMessage: params.emptyMessage,
    monthlyBreakdown: params.monthlyBreakdown,
  })
  return renderAndShare(html, params.dialogTitle)
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
        dialogTitle: dialogTitle || 'Hibbullah report',
        UTI: 'com.adobe.pdf',
      })
    } catch (err) {
      console.warn('[report] could not open the share sheet:', err instanceof Error ? err.message : err)
    }
  }

  return fileUri
}
