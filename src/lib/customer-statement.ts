/**
 * Customer statement / consolidated report PDF export and sharing.
 *
 * Builds the statement markup via `src/lib/customer-statement-html` (pure,
 * testable in Node), then uses expo-print to render it to a PDF file on the
 * device and expo-sharing to offer the user a share/save sheet. Generation is
 * purely client-side, so there are no recurring server costs.
 *
 * Returns the file URI of the generated PDF, or null if the user dismissed
 * sharing. Throws on hard failure so the caller can surface an error message.
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
}): Promise<string | null> {
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
}): Promise<string | null> {
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
  const orderTotal = (order.items || []).reduce(
    (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0,
  )
  const status = (order.status || '').toUpperCase()
  return {
    order,
    orderTotal,
    isDelivered: status === 'DELIVERED',
    countsAsValue: status !== 'CANCELLED',
  }
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
      dialogTitle: dialogTitle || 'Hibbullah statement',
      UTI: 'com.adobe.pdf',
    })
  } catch {
    return fileUri
  }

  return fileUri
}
