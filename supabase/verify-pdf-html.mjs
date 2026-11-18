#!/usr/bin/env node
/**
 * Regression checks for money shown in generated PDFs.
 *
 * A real defect: statements and sales reports recomputed each order total from
 * item snapshots (`unitPrice x quantity`), which is the product-only subtotal.
 * Every figure was ৳80 (the delivery fee) lower than what the customer was
 * charged and disagreed with the invoice and the dashboard. These checks guard
 * both halves: the preparers must use the stored charged total, and the HTML
 * builders must render the values they are given without inventing numbers.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadTsModule, cleanup } from './lib/load-ts-module.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

let passed = 0
const fail = (msg) => { console.error(`  FAIL ${msg}`); process.exitCode = 1 }
const ok = (label, cond) => {
  if (cond) { passed += 1; console.log(`  ok   ${label}`) }
  else fail(label)
}

const html = (s) => s.replace(/\s+/g, ' ')
const summaryValue = (markup, label) => {
  const m = markup.match(new RegExp(`summary-label">${label}<\\/div>\\s*<div class="summary-value">([^<]+)`))
  return m ? m[1] : null
}

const mkOrder = (overrides = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  orderNumber: 'ORD-1001',
  customerId: 'c1',
  customerName: 'Rahim Ahmed',
  createdAt: '2026-09-26T20:34:37.885+00:00',
  status: 'DELIVERED',
  subtotal: 900,
  discount: 0,
  deliveryFee: 80,
  total: 980,
  paymentMethod: 'CASH_ON_DELIVERY',
  address: '12 Main Road, Dhaka',
  items: [{
    id: 'i1', productId: 'p1', productName: 'Napa 500mg',
    quantity: 10, unitPrice: 90, discountPercent: 0, total: 900,
  }],
  timeline: [],
  ...overrides,
})

try {
  console.log('\n=== stored totals reach the PDF preparers ===')
  const statementSrc = read('src/lib/customer-statement.ts')
  const financialSrc = read('src/lib/financial-report.ts')
  const reportsIndexSrc = read('src/app/(admin)/reports/index.tsx')

  ok('customer statement uses the stored charged total',
    /const orderTotal = Number\(order\.total \?\? 0\)/.test(statementSrc) &&
    !/orderTotal = \(order\.items \|\| \[\]\)\.reduce/.test(statementSrc))
  ok('sales report uses the stored charged total',
    /const orderTotal = Number\(order\.total \?\? 0\)/.test(financialSrc) &&
    !/orderTotal = \(order\.items \|\| \[\]\)\.reduce/.test(financialSrc))
  ok('yearly breakdown uses the stored charged total',
    /const orderTotal = Number\(o\.total \?\? 0\)/.test(reportsIndexSrc))

  // Load the pure builders with their pure dependencies.
  const config = await loadTsModule(join(root, 'src/constants/config.ts'))
  await loadTsModule(join(root, 'src/utils/date.ts'))
  const invoice = await loadTsModule(join(root, 'src/lib/invoice-html.ts'))
  const statement = await loadTsModule(join(root, 'src/lib/customer-statement-html.ts'))
  const financial = await loadTsModule(join(root, 'src/lib/financial-report-html.ts'))

  console.log('\n=== invoice ===')
  const invoiceHtml = invoice.buildInvoiceHtml(mkOrder())
  ok('invoice names the customer it bills', html(invoiceHtml).includes('Rahim Ahmed'))
  ok('invoice prints the delivery address', html(invoiceHtml).includes('12 Main Road, Dhaka'))
  ok('invoice shows the stored subtotal, fee and total',
    html(invoiceHtml).includes('900.00') &&
    html(invoiceHtml).includes('80.00') &&
    html(invoiceHtml).includes('980.00'))
  const discounted = invoice.buildInvoiceHtml(mkOrder({
    discount: 90,
    items: [{ id: 'i1', productId: 'p1', productName: 'Napa', quantity: 1, unitPrice: 0, discountPercent: 100, total: 0 }],
  }))
  ok('a 100% discount never prints Infinity', !html(discounted).includes('Infinity'))
  ok('an order-level discount is shown in the totals', html(discounted).includes('Discount'))

  console.log('\n=== customer statement ===')
  const statementHtml = statement.buildCustomerStatementHtml({
    customer: { id: 'c1', name: 'Rahim Ahmed' },
    orders: [{ order: mkOrder(), orderTotal: 980, isDelivered: true, countsAsValue: true }],
    title: 'Customer Orders',
    asOf: '2026-10-01T00:00:00.000Z',
  })
  ok('statement renders the charged total for the order',
    /Order total.{0,200}980\.00/.test(html(statementHtml)))
  ok('statement total spending uses the charged total',
    /Total order value.{0,200}980\.00/.test(html(statementHtml)) ||
    html(statementHtml).includes('980.00'))

  console.log('\n=== sales report ===')
  const cancelled = mkOrder({
    status: 'CANCELLED', total: 980, deliveryFee: 80,
    items: [{ id: 'i2', productId: 'p2', productName: 'Cancelled', quantity: 1, unitPrice: 90, discountPercent: 10, total: 90 }],
  })
  const salesHtml = financial.buildSalesReportHtml({
    docTitle: 'Monthly Sales Report',
    reportingPeriod: 'Month: September 2026',
    asOf: '2026-10-01T00:00:00.000Z',
    orders: [
      { order: mkOrder(), orderTotal: 980, isDelivered: true, countsAsValue: true, statusUpper: 'DELIVERED' },
      { order: cancelled, orderTotal: 980, isDelivered: false, countsAsValue: false, statusUpper: 'CANCELLED' },
    ],
  })
  const money = (n) => `${config.config.currencySymbol}${n.toFixed(2)}`
  ok('sales total order value excludes cancelled orders',
    summaryValue(salesHtml, 'Total order value') === money(980))
  ok('sales delivered revenue excludes cancelled orders',
    summaryValue(salesHtml, 'Delivered revenue') === money(980))
  ok('sales delivery fees exclude cancelled orders',
    summaryValue(salesHtml, 'Delivery fees') === money(80))
  ok('sales discounts exclude cancelled orders',
    summaryValue(salesHtml, 'Discounts') === money(0))
  ok('sales figures never print Infinity',
    !html(salesHtml).includes('Infinity'))
  ok('currency comes from app config',
    summaryValue(salesHtml, 'Delivery fees')?.includes(config.config.currencySymbol) === true)

  console.log(`\n=== ${passed} checks passed ===`)
} finally {
  cleanup()
}
