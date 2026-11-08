/**
 * Pure invoice HTML generation.
 *
 * No Expo / native imports: this module can be tested in plain Node and imported
 * anywhere an invoice markup string is needed. `src/lib/invoice.ts` adds the
 * expo-print / expo-sharing export step on top.
 *
 * Builds an A4-portrait invoice from a stored order snapshot:
 *   - centred business name ("Hibbullah") at the top
 *   - prominent INVOICE heading
 *   - left: business name + address (address omitted when not configured)
 *   - right: order number, order date, payment method
 *   - full-width product table: Product | Quantity | Original Price | Discount (%) |
 *     Discount Price | Final Price
 *   - right-aligned Subtotal and Total below the table; Total bold, boxed by
 *     black rules above and below
 *   - thin grey row dividers; black rules around the header and total rows
 *
 * Money figures come from the order snapshot (`orders` + `order_items`), never from
 * live product rows, so the invoice always reflects what was actually charged.
 */

import { config } from '../constants/config'
import { formatDateTime } from '../utils/date'
import type { Order } from '../types/order'

/** Two-decimal money formatting used inside the invoice PDF. */
export const money = (value: number): string =>
  `${config.currencySymbol}${value.toFixed(2)}`;

/**
 * Business address printed on the invoice. It is intentionally absent:
 * `src/constants/config.ts` configures `appName` only, and there is no stored
 * business address anywhere in the app configuration. Rather than invent a
 * placeholder, the address line is omitted from the invoice. Report exactly what
 * is missing: a configured business address is required before an address line can
 * appear on issued invoices.
 */
export const businessAddress: string | null = null;

/**
 * Original (pre-discount) unit price, derived from the stored final unit price and
 * the stored discount percent. When no discount applies, original == final.
 *
 * Floating-point division is rounded to 2dp so the backwards computation lands on a
 * clean amount (e.g. final 90 with 10% discount -> original 100).
 */
export function originalUnitPrice(item: { unitPrice: number; discountPercent: number }): number {
  const { unitPrice, discountPercent } = item;
  if (!discountPercent || discountPercent <= 0) return unitPrice;
  return Number((unitPrice / (1 - discountPercent / 100)).toFixed(2));
}

/** Discount (savings) per unit = original - final. */
export function discountUnitPrice(item: { unitPrice: number; discountPercent: number }): number {
  const { unitPrice, discountPercent } = item;
  if (!discountPercent || discountPercent <= 0) return 0;
  return Number((originalUnitPrice(item) - unitPrice).toFixed(2));
}

/** Escapes text for safe placement inside HTML attributes / text nodes. */
export const esc = (value: string): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Builds the invoice HTML. A4 portrait, white background, black typography.
 */
export function buildInvoiceHtml(order: Order): string {
  const items = order.items || [];
  const businessName = esc(config.appName);

  const orderNumber = esc(order.orderNumber || '—');
  const orderDate = esc(order.createdAt ? formatDateTime(order.createdAt) : '—');
  const paymentMethod = esc(order.paymentMethod ? order.paymentMethod.replace(/_/g, ' ') : '—');

  // Per-line computations from the stored snapshot. The displayed Subtotal uses the
  // order's stored subtotal (source of truth); per-row figures are computed from the
  // item snapshot so the Discount Price / Final Price columns are accurate.
  const rows = items.map((item) => {
    const finalUnit = Number(item.unitPrice || 0);
    const quantity = Number(item.quantity || 0);
    const discountPercent = Number(item.discountPercent || 0);
    const originalUnit = originalUnitPrice(item);
    const discountUnit = discountUnitPrice(item);

    const lineFinal = finalUnit * quantity;

    return {
      productName: esc(item.productName || 'Unnamed product'),
      quantity: String(quantity),
      originalPrice: money(originalUnit),
      discountPercent: discountPercent ? `${discountPercent}%` : '—',
      discountPrice: discountPercent ? money(discountUnit) : '—',
      finalPrice: money(finalUnit),
      lineFinal: money(lineFinal),
    };
  });

  // The order's stored subtotal is the source of truth for what was charged; it is
  // the sum of item final prices. Round to 2dp for display.
  const orderSubtotal = Number(order.subtotal || 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const orderTotal = Number(order.total || 0);

  const rowsHtml = rows
    .map(
      (r) => `
    <tr>
      <td class="product">${r.productName}</td>
      <td class="quantity">${r.quantity}</td>
      <td class="price">${r.originalPrice}</td>
      <td class="price">${r.discountPercent}</td>
      <td class="price">${r.discountPrice}</td>
      <td class="price final">${r.finalPrice}</td>
    </tr>`,
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invoice ${orderNumber}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * {
    box-sizing: border-box;
  }
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
    padding: 22mm 18mm 18mm 18mm;
    background: #ffffff;
  }
  .brand {
    text-align: center;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 1px;
    margin-bottom: 2px;
  }
  .brand-small {
    text-align: center;
    font-size: 8px;
    color: #555555;
    letter-spacing: 0.5px;
    margin-bottom: 14px;
  }
  .invoice-heading {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 3px;
    text-align: center;
    margin: 0 0 6px 0;
  }
  .invoice-subheading {
    text-align: center;
    font-size: 8px;
    color: #666666;
    margin-bottom: 18px;
  }
  .info {
    display: flex;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .info-col {
    flex: 1;
  }
  .info-col + .info-col {
    margin-left: 16px;
  }
  .info-label {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #444444;
    text-transform: uppercase;
    margin-bottom: 3px;
  }
  .info-value {
    font-size: 9px;
    color: #0a0a0a;
    margin: 0 0 2px 0;
  }
  table.invoice-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 18px;
  }
  table.invoice-table thead tr {
    border-top: 1.5px solid #0a0a0a;
    border-bottom: 1.5px solid #0a0a0a;
  }
  table.invoice-table th {
    font-size: 7.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #222222;
    padding: 6px 4px;
    text-align: left;
    border-bottom: 1.5px solid #0a0a0a;
  }
  table.invoice-table th.quantity,
  table.invoice-table td.quantity,
  table.invoice-table th.price,
  table.invoice-table td.price {
    text-align: right;
  }
  table.invoice-table th.product,
  table.invoice-table td.product {
    text-align: left;
  }
  table.invoice-table tbody tr {
    border-bottom: 0.5px solid #bbbbbb;
  }
  table.invoice-table tbody tr:last-child {
    border-bottom: none;
  }
  table.invoice-table td {
    font-size: 8.5px;
    padding: 5px 4px;
    vertical-align: top;
  }
  table.invoice-table td.product {
    text-align: left;
  }
  table.invoice-table td.quantity {
    text-align: center;
  }
  .totals {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    width: 100%;
    margin-top: 4px;
  }
  .totals-row {
    display: flex;
    justify-content: flex-end;
    width: 100%;
    font-size: 9px;
    padding: 3px 0;
  }
  .totals-row .label {
    min-width: 90px;
    text-align: right;
    margin-right: 10px;
    color: #333333;
  }
  .totals-row .value {
    font-variant-numeric: tabular-nums;
  }
  .totals-row.subtotal .value {
    color: #0a0a0a;
  }
  .totals-row.total {
    border-top: 1.5px solid #0a0a0a;
    border-bottom: 1.5px solid #0a0a0a;
    margin-top: 2px;
    padding-top: 4px;
    padding-bottom: 4px;
  }
  .totals-row.total .label {
    font-weight: 700;
    color: #0a0a0a;
  }
  .totals-row.total .value {
    font-weight: 700;
    color: #0a0a0a;
    font-size: 10px;
  }
  .footer {
    margin-top: 24px;
    font-size: 7px;
    color: #777777;
    text-align: center;
    border-top: 0.5px solid #dddddd;
    padding-top: 6px;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="brand">${businessName}</div>
    <div class="invoice-heading">INVOICE</div>
    <div class="invoice-subheading">Official receipt for your purchase</div>

    <div class="info">
      <div class="info-col">
        <div class="info-label">From</div>
        <div class="info-value">${businessName}</div>
        ${businessAddress ? `<div class="info-value">${businessAddress}</div>` : ''}
      </div>
      <div class="info-col">
        <div class="info-label">Invoice</div>
        <div class="info-value"># ${orderNumber}</div>
        <div class="info-value">${orderDate}</div>
        <div class="info-value">Payment: ${paymentMethod}</div>
      </div>
    </div>

    <table class="invoice-table">
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

    <div class="totals">
      <div class="totals-row subtotal">
        <span class="label">Subtotal</span>
        <span class="value">${money(orderSubtotal)}</span>
      </div>
      <div class="totals-row delivery">
        <span class="label">Delivery fee</span>
        <span class="value">${money(deliveryFee)}</span>
      </div>
      <div class="totals-row total">
        <span class="label">Total</span>
        <span class="value">${money(orderTotal)}</span>
      </div>
    </div>

    <div class="footer">
      ${businessName} &mdash; Invoice #${orderNumber} &mdash; Generated on ${new Date().toLocaleDateString()}
    </div>
  </div>
</body>
</html>
`;
}
