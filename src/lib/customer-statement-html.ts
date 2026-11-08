/**
 * Pure customer statement / consolidated report HTML generation.
 *
 * No Expo / native imports: this module can be tested in plain Node. The PDF
 * export step lives in `src/lib/customer-statement.ts`.
 *
 * Builds A4-portrait statements consistent with the Hibbullah invoice:
 *   - centred Hibbullah branding at the top
 *   - clear document title and reporting period
 *   - customer name and available contact information
 *   - per-order blocks: number, date, payment method, status, product table,
 *     order-level total
 *   - thin grey row dividers, black rules around table headers and totals
 *   - strong visual separation between customers and between orders
 *   - page numbers where practical (via CSS counters)
 *
 * Money figures come from stored order / order-item snapshots, never from live
 * product rows. Cancelled orders are never counted as delivered revenue.
 */

import { config } from '../constants/config'
import { formatDateTime } from '../utils/date'
import { money, originalUnitPrice, discountUnitPrice, esc } from './invoice-html'
import type { Order } from '../types/order'

/** Minimal customer shape needed by the statements. */
export interface StatementCustomer {
  id: string
  name: string
  email?: string | null
  phone?: string | null
}

/** One order as rendered in a statement, pre-computed for display. */
export interface StatementOrder {
  order: Order
  /** Sum of item final prices (order total, from the stored snapshot). */
  orderTotal: number
  /** Whether this order counts toward delivered revenue. */
  isDelivered: boolean
  /** Whether this order counts toward total order value (non-cancelled). */
  countsAsValue: boolean
}

/** Escapes text for safe placement inside HTML text nodes. */
const escText = (value: string): string =>
  esc(value)

/** Title-case a stored status/payment string ("CANCELLED" → "Cancelled"). */
const titleCase = (value: string): string =>
  value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

/** Renders one order block inside a customer statement. */
function orderBlockHtml(order: StatementOrder, index: number, total: number): string {
  const o = order.order
  const items = o.items || []
  const isLast = index === total - 1

  const rowsHtml = items
    .map((item) => {
      const finalUnit = Number(item.unitPrice || 0)
      const quantity = Number(item.quantity || 0)
      const discountPercent = Number(item.discountPercent || 0)
      const originalUnit = originalUnitPrice(item)
      const discountUnit = discountUnitPrice(item)

      return `
    <tr>
      <td class="product">${escText(item.productName || 'Unnamed product')}</td>
      <td class="quantity">${quantity}</td>
      <td class="price">${money(originalUnit)}</td>
      <td class="price">${discountPercent ? `${discountPercent}%` : '—'}</td>
      <td class="price">${discountPercent ? money(discountUnit) : '—'}</td>
      <td class="price final">${money(finalUnit)}</td>
    </tr>`
    })
    .join('')

  const statusLabel = titleCase(o.status || '—')
  const statusTone = o.status === 'CANCELLED' ? ' status-cancelled' : ''

  return `
    <div class="order${isLast ? ' order-last' : ''}">
      <div class="order-header">
        <div class="order-id">Order #${escText(o.orderNumber || '—')}</div>
        <div class="order-meta">
          <span>${escText(formatDateTime(o.createdAt))}</span>
          <span>·</span>
          <span>${escText(o.paymentMethod ? o.paymentMethod.replace(/_/g, ' ') : '—')}</span>
          <span>·</span>
          <span class="status${statusTone}">${escText(statusLabel)}</span>
        </div>
      </div>
      <table class="order-table">
        <thead>
          <tr>
            <th class="product">Product</th>
            <th class="quantity">Quantity</th>
            <th class="price">Original Price</th>
            <th class="price">Discount (%)</th>
            <th class="price">Discount Price</th>
            <th class="price">Final Price</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <div class="order-total">
        <span class="label">Order total</span>
        <span class="value">${money(order.orderTotal)}</span>
      </div>
    </div>
  `
}

/** Renders the customer order history statement (complete or last-30-days). */
export function buildCustomerStatementHtml(params: {
  customer: StatementCustomer
  orders: StatementOrder[]
  title: string
  subtitle?: string
  reportingPeriod?: string
  asOf: string
  emptyMessage?: string
}): string {
  const { customer, orders, title, subtitle, reportingPeriod, asOf, emptyMessage } = params
  const businessName = esc(config.appName)

  const orderCount = orders.length
  const totalOrderValue = orders
    .filter((o) => o.countsAsValue)
    .reduce((sum, o) => sum + o.orderTotal, 0)
  const deliveredRevenue = orders
    .filter((o) => o.isDelivered)
    .reduce((sum, o) => sum + o.orderTotal, 0)

  const hasOrders = orderCount > 0
  const ordersHtml = hasOrders
    ? orders.map((o, i) => orderBlockHtml(o, i, orderCount)).join('')
    : `
      <div class="empty">
        ${emptyMessage || 'No orders found for this customer.'}
      </div>
    `

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escText(title)}</title>
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
  .customer-card {
    border: 1px solid #dddddd;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 16px;
    background: #fafafa;
  }
  .customer-name {
    font-size: 13px;
    font-weight: 700;
    margin: 0 0 4px 0;
  }
  .customer-meta {
    font-size: 8px;
    color: #444444;
    margin: 0 0 2px 0;
  }
  .reporting-period {
    text-align: center;
    font-size: 8.5px;
    font-weight: 700;
    color: #333333;
    margin: 2px 0 14px 0;
  }
  .generated-at {
    text-align: right;
    font-size: 7.5px;
    color: #777777;
    margin-bottom: 12px;
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
  .order {
    border: 1px solid #dddddd;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 12px;
    page-break-inside: avoid;
  }
  .order-last {
    margin-bottom: 0;
  }
  .order-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
  }
  .order-id {
    font-size: 11px;
    font-weight: 700;
  }
  .order-meta {
    font-size: 8px;
    color: #444444;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .status {
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
  table.order-table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 8px 0;
  }
  table.order-table thead tr {
    border-top: 1.5px solid #0a0a0a;
    border-bottom: 1.5px solid #0a0a0a;
  }
  table.order-table th {
    font-size: 7.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #222222;
    padding: 5px 4px;
    text-align: left;
    border-bottom: 1.5px solid #0a0a0a;
  }
  table.order-table th.quantity,
  table.order-table td.quantity,
  table.order-table th.price,
  table.order-table td.price {
    text-align: right;
  }
  table.order-table th.product,
  table.order-table td.product {
    text-align: left;
  }
  table.order-table tbody tr {
    border-bottom: 0.5px solid #bbbbbb;
  }
  table.order-table tbody tr:last-child {
    border-bottom: none;
  }
  table.order-table td {
    font-size: 8.5px;
    padding: 4px 4px;
    vertical-align: top;
  }
  .order-total {
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1.5px solid #0a0a0a;
  }
  .order-total .label {
    font-weight: 700;
    margin-right: 10px;
    color: #0a0a0a;
  }
  .order-total .value {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #0a0a0a;
  }
  .summary {
    border: 1px solid #dddddd;
    border-radius: 6px;
    padding: 12px;
    background: #fafafa;
    margin-top: 4px;
    page-break-inside: avoid;
  }
  .summary-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #444444;
    text-transform: uppercase;
    margin: 0 0 8px 0;
    border-bottom: 1.5px solid #0a0a0a;
    padding-bottom: 3px;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    padding: 3px 0;
  }
  .summary-row .label {
    color: #333333;
  }
  .summary-row .value {
    font-variant-numeric: tabular-nums;
    color: #0a0a0a;
  }
  .summary-row.total {
    border-top: 1.5px solid #0a0a0a;
    margin-top: 4px;
    padding-top: 4px;
    font-weight: 700;
  }
  .summary-row.total .value {
    font-size: 10px;
  }
  .empty {
    text-align: center;
    font-size: 10px;
    color: #666666;
    padding: 30px 0;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="brand">${businessName}</div>
    <div class="doc-title">${escText(title)}</div>
    ${subtitle ? `<div class="doc-subtitle">${escText(subtitle)}</div>` : ''}
    <div class="generated-at">Generated ${escText(formatDateTime(asOf))}</div>

    <div class="customer-card">
      <div class="customer-name">${escText(customer.name)}</div>
      <div class="customer-meta">
        ${customer.email ? `Email: ${escText(customer.email)} · ` : ''}
        ${customer.phone ? `Phone: ${escText(customer.phone)}` : ''}
        ${!customer.email && !customer.phone ? 'No contact details on file' : ''}
      </div>
    </div>

    ${reportingPeriod ? `<div class="reporting-period">${escText(reportingPeriod)}</div>` : ''}

    <div class="section-title">Orders</div>
    ${ordersHtml}

    <div class="summary">
      <div class="summary-title">Summary</div>
      <div class="summary-row">
        <span class="label">Total orders</span>
        <span class="value">${orderCount}</span>
      </div>
      <div class="summary-row">
        <span class="label">Total order value</span>
        <span class="value">${money(totalOrderValue)}</span>
      </div>
      <div class="summary-row">
        <span class="label">Delivered revenue</span>
        <span class="value">${money(deliveredRevenue)}</span>
      </div>
      ${!hasOrders ? `<div class="summary-row"><span class="label">Note</span><span class="value" style="color:#666666;">Cancelled orders are excluded from value and revenue.</span></div>` : ''}
    </div>
  </div>
</body>
</html>
`
}

/** Renders the all-customers consolidated report. */
export function buildAllCustomersHtml(params: {
  customers: (StatementCustomer & { orders: StatementOrder[] })[]
  asOf: string
}): string {
  const { customers, asOf } = params
  const businessName = esc(config.appName)

  const totalCustomers = customers.length
  const customersWithOrders = customers.filter((c) => c.orders.length > 0).length
  const totalOrders = customers.reduce((sum, c) => sum + c.orders.length, 0)
  const totalOrderValue = customers.reduce(
    (sum, c) => sum + c.orders.filter((o) => o.countsAsValue).reduce((s, o) => s + o.orderTotal, 0),
    0,
  )
  const deliveredRevenue = customers.reduce(
    (sum, c) => sum + c.orders.filter((o) => o.isDelivered).reduce((s, o) => s + o.orderTotal, 0),
    0,
  )

  const customerBlocksHtml = customers
    .map((c) => {
      const hasOrders = c.orders.length > 0
      const customerTotal = c.orders
        .filter((o) => o.countsAsValue)
        .reduce((sum, o) => sum + o.orderTotal, 0)
      const ordersHtml = hasOrders
        ? c.orders.map((o, i) => orderBlockHtml(o, i, c.orders.length)).join('')
        : `<div class="empty">No orders placed.</div>`

      return `
      <div class="customer-report" style="page-break-inside: avoid;">
        <div class="customer-header">
          <div class="customer-name">${escText(c.name)}</div>
          <div class="customer-meta">
            ${c.email ? `Email: ${escText(c.email)} · ` : ''}
            ${c.phone ? `Phone: ${escText(c.phone)}` : ''}
            ${!c.email && !c.phone ? 'No contact details on file' : ''}
            ${hasOrders ? ` · ${c.orders.length} order${c.orders.length === 1 ? '' : 's'}` : ' · No orders'}
          </div>
        </div>
        <div class="orders-list">
          ${hasOrders ? `<div class="section-title">Orders</div>` : ''}
          ${ordersHtml}
          ${hasOrders ? `<div class="customer-total"><span class="label">Customer total</span><span class="value">${money(customerTotal)}</span></div>` : ''}
        </div>
      </div>
    `
    })
    .join('')

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>All Customers Report</title>
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
  .customer-report {
    border: 1px solid #dddddd;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 14px;
    page-break-inside: avoid;
  }
  .customer-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
  }
  .customer-name {
    font-size: 12px;
    font-weight: 700;
    margin: 0;
  }
  .customer-meta {
    font-size: 8px;
    color: #444444;
    margin: 2px 0 0 0;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .orders-list {
    margin-top: 6px;
  }
  .orders-list .order {
    margin-bottom: 8px;
  }
  .customer-total {
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1.5px solid #0a0a0a;
    page-break-inside: avoid;
  }
  .customer-total .label {
    font-weight: 700;
    margin-right: 10px;
    color: #0a0a0a;
  }
  .customer-total .value {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #0a0a0a;
    font-size: 10px;
  }
  .summary {
    border: 1px solid #dddddd;
    border-radius: 6px;
    padding: 12px;
    background: #fafafa;
    page-break-inside: avoid;
  }
  .summary-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #444444;
    text-transform: uppercase;
    margin: 0 0 8px 0;
    border-bottom: 1.5px solid #0a0a0a;
    padding-bottom: 3px;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    padding: 3px 0;
  }
  .summary-row .label {
    color: #333333;
  }
  .summary-row .value {
    font-variant-numeric: tabular-nums;
    color: #0a0a0a;
  }
  .summary-row.total {
    border-top: 1.5px solid #0a0a0a;
    margin-top: 4px;
    padding-top: 4px;
    font-weight: 700;
  }
  .summary-row.total .value {
    font-size: 10px;
  }
  .orders-list .order-table th.quantity,
  .orders-list .order-table td.quantity,
  .orders-list .order-table th.price,
  .orders-list .order-table td.price {
    text-align: right;
  }
  .orders-list .order-table th.product,
  .orders-list .order-table td.product {
    text-align: left;
  }
  .orders-list .order-table tbody tr {
    border-bottom: 0.5px solid #bbbbbb;
  }
  .orders-list .order-table tbody tr:last-child {
    border-bottom: none;
  }
  .orders-list .order-table td {
    font-size: 8.5px;
    padding: 4px 4px;
    vertical-align: top;
  }
  .orders-list .order-table th {
    font-size: 7.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #222222;
    padding: 5px 4px;
    text-align: left;
    border-bottom: 1.5px solid #0a0a0a;
  }
  .orders-list .order-table {
    width: 100%;
    border-collapse: collapse;
    margin: 6px 0 6px 0;
  }
  .orders-list .order-table thead tr {
    border-top: 1.5px solid #0a0a0a;
    border-bottom: 1.5px solid #0a0a0a;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="brand">${businessName}</div>
    <div class="doc-title">All Customers Report</div>
    <div class="generated-at">Generated ${escText(formatDateTime(asOf))}</div>
    <div class="reporting-period">All customers — complete order history</div>

    <div class="summary">
      <div class="summary-title">Overall Summary</div>
      <div class="summary-row">
        <span class="label">Total customers</span>
        <span class="value">${totalCustomers}</span>
      </div>
      <div class="summary-row">
        <span class="label">Customers with orders</span>
        <span class="value">${customersWithOrders}</span>
      </div>
      <div class="summary-row">
        <span class="label">Customers without orders</span>
        <span class="value">${totalCustomers - customersWithOrders}</span>
      </div>
      <div class="summary-row">
        <span class="label">Total orders</span>
        <span class="value">${totalOrders}</span>
      </div>
      <div class="summary-row">
        <span class="label">Total order value</span>
        <span class="value">${money(totalOrderValue)}</span>
      </div>
      <div class="summary-row">
        <span class="label">Delivered revenue</span>
        <span class="value">${money(deliveredRevenue)}</span>
      </div>
    </div>

    <div class="section-title">Customers</div>
    ${customerBlocksHtml}
  </div>
</body>
</html>
`
}
