/**
 * Financial report PDF export and sharing.
 *
 * Builds the sales report markup via `src/lib/financial-report-html` (pure,
 * testable in Node), then uses expo-print to render it to a PDF file on the
 * device and expo-sharing to offer the user a share/save sheet. Generation is
 * purely client-side, so there are no recurring server costs.
 *
 * Returns the file URI of the generated PDF, or null if the user dismissed
 * sharing. Throws on hard failure so the caller can surface an error message.
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
    const orderTotal = (order.items || []).reduce(
      (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
      0,
    )
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
}): Promise<string | null> {
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

async function renderAndShare(html: string, dialogTitle?: string): Promise<string | null> {
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

  try {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/pdf',
      dialogTitle: dialogTitle || 'Hibbullah report',
      UTI: 'com.adobe.pdf',
    })
  } catch {
    return fileUri
  }

  return fileUri
}
