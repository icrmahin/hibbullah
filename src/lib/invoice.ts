/**
 * Per-order PDF invoice generation and sharing.
 *
 * Builds the invoice markup via `src/lib/invoice-html` (pure, testable in Node),
 * then uses expo-print to render it to a PDF file on the device and expo-sharing
 * to offer the user a share/save sheet. Generation is purely client-side, so there
 * are no recurring server costs and no new backend table or RPC.
 *
 * Returns the file URI of the generated PDF, or null if the user dismissed sharing.
 * Throws on hard failure so the caller can surface an error message.
 */

import { printToFileAsync } from 'expo-print'
import * as Sharing from 'expo-sharing'
import { buildInvoiceHtml } from './invoice-html'
import type { Order } from '../types/order'

/**
 * Generates the invoice PDF for `order` and offers to share/save it on Android.
 *
 * expo-print writes the rendered HTML to a PDF file in the app cache directory.
 * The share sheet lets the user save the invoice to Files (Android) or another app;
 * if sharing is cancelled or unavailable the file was still written to the cache
 * directory and its URI is returned.
 */
export async function generateAndShareInvoice(order: Order): Promise<string | null> {
  const html = buildInvoiceHtml(order);

  let fileUri: string;
  try {
    const result = await printToFileAsync({
      html,
      // A4 at ~96dpi -> width 794px, height 1123px. Print engine scales to A4
      // regardless; these guide the layout.
      width: 794,
      height: 1123,
    });
    fileUri = result.uri;
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : 'Could not generate the invoice PDF.',
    );
  }

  try {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/pdf',
      dialogTitle: `Invoice ${order.orderNumber || ''}`,
      UTI: 'com.adobe.pdf',
    });
  } catch {
    return fileUri;
  }

  return fileUri;
}
