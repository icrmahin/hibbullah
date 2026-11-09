/**
 * Pure financial report HTML generation.
 *
 * No Expo / native imports: this module can be tested in plain Node. The PDF
 * export step lives in `src/lib/financial-report.ts`.
 *
 * Builds A4-portrait financial reports consistent with the Hibbullah invoice
 * and customer statement visual system:
 *   - centred Hibbullah branding at the top
 *   - clear document title and reporting period
 *   - summary cards: order counts by status, total order value, delivered
 *     revenue, discounts, delivery fees
 *   - detailed order table: number, date, customer, status, payment, total
 *   - clear visual separation between summary and detail sections
 *   - page numbers where practical (via CSS counters)
 *
 * Money figures come from stored order / order-item snapshots, never from live
 * product rows. Cancelled orders are never counted as delivered revenue.
 */

import { config } from '../constants/config'
import { formatDateTime } from '../utils/date'
import { money, esc } from './invoice-html'
import type { Order } from '../types/order'

/** Minimal customer-sales order shape for reporting. */
export interface SalesOrder {
  order: Order
  /** Order total from the stored snapshot. */
  orderTotal: number
  /** Whether this order counts as delivered revenue. */
  isDelivered: boolean
  /** Whether this order counts toward total order value (non-cancelled). */
  countsAsValue: boolean
  /** Order status, upper-cased for grouping. */
  statusUpper: string
}

/** Discount per unit computed directly (no intermediate rounding of the original
 *  price), so the aggregate discount matches what was actually charged. The raw
 *  value is returned; rounding happens on the final aggregate. */
function discountUnitPrice(item: { unitPrice: number; discountPercent: number }): number {
  const { unitPrice, discountPercent } = item
  if (!discountPercent || discountPercent <= 0) return 0
  return unitPrice * discountPercent / (100 - discountPercent)
}

/** Escapes text for safe placement inside HTML text nodes. */
const escText = (value: string): string =>
  esc(value)

/** Title-case a stored status string ("CANCELLED" → "Cancelled"). */
const titleCaseStatus = (value: string): string =>
  value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())

/** Renders one order row in the detailed order table. */
function orderRowHtml(order: SalesOrder, index: number): string {
  const o = order.order
  const statusLabel = titleCaseStatus(order.statusUpper)
  const statusClass =
    order.statusUpper === 'CANCELLED' ? ' status-cancelled' :
    order.statusUpper === 'DELIVERED' ? ' status-delivered' : ''
  const zebra = index % 2 === 0 ? ' zebra' : ''

  return `
    <tr${zebra}>
      <td class="order-id">${escText(o.orderNumber || '—')}</td>
      <td class="order-date">${escText(formatDateTime(o.createdAt))}</td>
      <td class="customer">${escText(o.customerName || '—')}</td>
      <td class="status"><span class="status-badge${statusClass}">${escText(statusLabel)}</span></td>
      <td class="payment">${escText(o.paymentMethod ? o.paymentMethod.replace(/_/g, ' ') : '—')}</td>
      <td class="total">${money(order.orderTotal)}</td>
    </tr>`
}

/** Builds the summary card HTML. */
function summaryCardHtml(params: {
  label: string
  value: string
  highlight?: boolean
}): string {
  return `
    <div class="summary-card${params.highlight ? ' summary-card-highlight' : ''}">
      <div class="summary-label">${escText(params.label)}</div>
      <div class="summary-value">${params.value}</div>
    </div>
  `
}

/** Renders the monthly or yearly sales report HTML. */
export function buildSalesReportHtml(params: {
  docTitle: string
  subtitle?: string
  reportingPeriod: string
  asOf: string
  orders: SalesOrder[]
  emptyMessage?: string
  monthlyBreakdown?: {
    month: string
    orderCount: number
    deliveredRevenue: number
    totalOrderValue: number
  }[]
}): string {
  const { docTitle, subtitle, reportingPeriod, asOf, orders, emptyMessage, monthlyBreakdown } = params
  const businessName = esc(config.appName)

  const orderCount = orders.length
  const statusCounts: Record<string, number> = {}
  for (const o of orders) {
    statusCounts[o.statusUpper] = (statusCounts[o.statusUpper] || 0) + 1
  }
  const totalOrderValue = orders
    .filter((o) => o.countsAsValue)
    .reduce((sum, o) => sum + o.orderTotal, 0)
  const deliveredRevenue = orders
    .filter((o) => o.isDelivered)
    .reduce((sum, o) => sum + o.orderTotal, 0)
  const discounts = Number(
    orders.reduce((sum, o) => {
      const discount = (o.order.items || []).reduce(
        (s, item) => s + discountUnitPrice(item) * Number(item.quantity || 0),
        0,
      )
      return sum + discount
    }, 0).toFixed(2),
  )
  const deliveryFees = orders.reduce((sum, o) => sum + Number(o.order.deliveryFee || 0), 0)

  const hasOrders = orderCount > 0
  const ordersHtml = hasOrders
    ? orders.map((o, i) => orderRowHtml(o, i)).join('')
    : `
      <tr>
        <td colspan="6" class="empty">${escText(emptyMessage || 'No orders found for this period.')}</td>
      </tr>`

  const monthlyRowsHtml = (monthlyBreakdown || [])
    .map((m) => `
    <tr>
      <td>${escText(m.month)}</td>
      <td class="number">${m.orderCount}</td>
      <td class="number">${money(m.deliveredRevenue)}</td>
      <td class="number">${money(m.totalOrderValue)}</td>
    </tr>`)
    .join('')

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escText(docTitle)}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 0;
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 7px;
      color: #777777;
    }
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Sora", "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 9.5px;
    color: #0a0a0a;
    margin: 0;
    padding: 0;
    line-height: 1.35;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 20mm 18mm 16mm 18mm;
    background: #ffffff;
  }
  .brand {
    text-align: center;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 1px;
    margin-bottom: 2px;
  }
  .doc-title {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 2px;
    text-align: center;
    margin: 4px 0 2px 0;
  }
  .doc-subtitle {
    text-align: center;
    font-size: 7.5px;
    color: #666666;
    margin-bottom: 14px;
  }
  .generated-at {
    text-align: right;
    font-size: 7.5px;
    color: #777777;
    margin-bottom: 12px;
  }
  .reporting-period {
    text-align: center;
    font-size: 8.5px;
    font-weight: 700;
    color: #333333;
    margin-bottom: 14px;
  }
  .section-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #444444;
    text-transform: uppercase;
    margin: 0 0 8px 0;
    border-bottom: 1.5px solid #0a0a0a;
    padding-bottom: 3px;
  }
  .summary-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }
  .summary-card {
    flex: 1 1 150px;
    border: 1px solid #dddddd;
    border-radius: 6px;
    padding: 8px 10px;
    background: #fafafa;
  }
  .summary-card-highlight {
    border-color: #0a0a0a;
    background: #f5f5f5;
  }
  .summary-label {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #444444;
    text-transform: uppercase;
    margin: 0 0 2px 0;
  }
  .summary-value {
    font-size: 10px;
    font-weight: 700;
    color: #0a0a0a;
    font-variant-numeric: tabular-nums;
    margin: 0;
  }
  table.financial-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
  }
  table.financial-table thead tr {
    border-top: 1.5px solid #0a0a0a;
    border-bottom: 1.5px solid #0a0a0a;
  }
  table.financial-table th {
    font-size: 7.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #222222;
    padding: 5px 4px;
    text-align: left;
    border-bottom: 1.5px solid #0a0a0a;
  }
  table.financial-table th.number,
  table.financial-table td.number {
    text-align: right;
  }
  table.financial-table tbody tr {
    border-bottom: 0.5px solid #bbbbbb;
  }
  table.financial-table tbody tr:last-child {
    border-bottom: none;
  }
  table.financial-table td {
    font-size: 8.5px;
    padding: 4px 4px;
    vertical-align: top;
  }
  table.financial-table tr.zebra {
    background: #fafafa;
  }
  .status-badge {
    font-size: 7.5px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .status-cancelled {
    background: #fbe4e2;
    color: #b3261e;
    border: 0.5px solid #f0c4c0;
  }
  .status-delivered {
    background: #e4f5ec;
    color: #1a6b4a;
    border: 0.5px solid #b8d4ce;
  }
  .empty {
    text-align: center;
    font-size: 10px;
    color: #666666;
    padding: 30px 0;
  }
  .monthly-breakdown {
    margin-top: 4px;
  }
  .note {
    font-size: 7.5px;
    color: #666666;
    margin-top: 8px;
    font-style: italic;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="brand">${businessName}</div>
    <div class="doc-title">${escText(docTitle)}</div>
    ${subtitle ? `<div class="doc-subtitle">${escText(subtitle)}</div>` : ''}
    <div class="generated-at">Generated ${escText(formatDateTime(asOf))}</div>
    <div class="reporting-period">${escText(reportingPeriod)}</div>

    <div class="section-title">Summary</div>
    <div class="summary-grid">
      ${summaryCardHtml({ label: 'Total orders', value: String(orderCount) })}
      ${summaryCardHtml({ label: 'Delivered', value: String(statusCounts.DELIVERED || 0) })}
      ${summaryCardHtml({ label: 'Pending', value: String(statusCounts.PENDING || 0) })}
      ${summaryCardHtml({ label: 'Processing', value: String(statusCounts.PROCESSING || 0) })}
      ${summaryCardHtml({ label: 'Out for delivery', value: String(statusCounts.OUT_FOR_DELIVERY || 0) })}
      ${summaryCardHtml({ label: 'Cancelled', value: String(statusCounts.CANCELLED || 0) })}
      ${summaryCardHtml({ label: 'Total order value', value: money(totalOrderValue), highlight: true })}
      ${summaryCardHtml({ label: 'Delivered revenue', value: money(deliveredRevenue), highlight: true })}
      ${summaryCardHtml({ label: 'Discounts', value: money(discounts) })}
      ${summaryCardHtml({ label: 'Delivery fees', value: money(deliveryFees) })}
    </div>

    <div class="section-title">Orders</div>
    <table class="financial-table">
      <thead>
        <tr>
          <th>Order number</th>
          <th>Order date</th>
          <th>Customer</th>
          <th>Status</th>
          <th>Payment method</th>
          <th class="number">Order total</th>
        </tr>
      </thead>
      <tbody>
        ${ordersHtml}
      </tbody>
    </table>

    ${monthlyBreakdown && monthlyBreakdown.length > 0 ? `
    <div class="section-title monthly-breakdown">Monthly breakdown</div>
    <table class="financial-table">
      <thead>
        <tr>
          <th>Month</th>
          <th class="number">Orders</th>
          <th class="number">Delivered revenue</th>
          <th class="number">Total order value</th>
        </tr>
      </thead>
      <tbody>
        ${monthlyRowsHtml}
      </tbody>
    </table>
    ` : ''}

    <div class="note">
      Cancelled orders are excluded from delivered revenue. Total order value includes
      all non-cancelled orders. Figures come from stored order snapshots, not live
      product prices.
    </div>
  </div>
</body>
</html>
`
}

/** Helper: original unit price derived from stored final price + discount percent. */
export function originalUnitPrice(item: { unitPrice: number; discountPercent: number }): number {
  const { unitPrice, discountPercent } = item
  if (!discountPercent || discountPercent <= 0) return unitPrice
  return Number((unitPrice / (1 - discountPercent / 100)).toFixed(2))
}
