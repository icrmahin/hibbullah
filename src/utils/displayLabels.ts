import type { OrderStatus } from "../types/order";
import type { ReturnStatus } from "../types/return";
import type { DeliveryCycleStatus } from "../types/deliveryCycle";

/**
 * Customer-facing words for every machine status code in the app.
 *
 * Status codes (PENDING, CASH_ON_DELIVERY, …) are database values, not words a
 * person reads. Every screen that shows one must go through these helpers so a
 * customer never meets an underscore. Unknown codes fall back to a humanized
 * form rather than the raw string, so a future status degrades to "Out for
 * delivery"-style wording instead of "OUT_FOR_DELIVERY".
 */
function humanize(code: string): string {
  const words = code.toLowerCase().replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : code;
}

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
};

export function orderStatusLabel(status: string): string {
  return (ORDER_STATUS_LABELS as Record<string, string>)[status] ?? humanize(status);
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH_ON_DELIVERY: "Cash on delivery",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? humanize(method);
}

const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PROCESSED: "Processed",
};

export function returnStatusLabel(status: string): string {
  return (RETURN_STATUS_LABELS as Record<string, string>)[status] ?? humanize(status);
}

const DELIVERY_CYCLE_STATUS_LABELS: Record<DeliveryCycleStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  CONFIRMED: "Confirmed",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function deliveryCycleStatusLabel(status: string): string {
  return (DELIVERY_CYCLE_STATUS_LABELS as Record<string, string>)[status] ?? humanize(status);
}

const TIMELINE_STEP_LABELS: Record<string, string> = {
  PLACED: "Placed",
  STATUS_CHANGED: "Status changed",
  ITEMS_ADDED: "Items added",
  STOCK_RESTOCKED: "Stock restocked",
  CANCELLED: "Cancelled",
};

/**
 * Timeline step names are written by the database (`transition_order_status`),
 * so they arrive as codes. Known codes read as words; anything else passes
 * through untouched — a custom admin note must never be rewritten.
 */
export function timelineStepLabel(label: string): string {
  return TIMELINE_STEP_LABELS[label] ?? label;
}
