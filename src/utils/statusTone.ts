import type { StatusTone } from "../components/common/StatusBadge";

/**
 * The one status mapping.
 *
 * Order, inventory, return and batch statuses were each mapped to a badge tone in
 * their own screen (PENDING→warning re-declared in ~6 files), so the same status
 * could drift between screens. Every status string in the app resolves here, so a
 * status looks identical on the dashboard, the list and the detail screen.
 */
export function statusTone(status: string): StatusTone {
  const s = status.toUpperCase();
  if (
    s === "DELIVERED" ||
    s === "APPROVED" ||
    s === "PROCESSED" ||
    s === "HEALTHY" ||
    s === "ACTIVE" ||
    s === "COMPLETED"
  )
    return "success";
  if (
    s === "CANCELLED" ||
    s === "REJECTED" ||
    s === "FAILED" ||
    s === "OUT_OF_STOCK" ||
    s === "EXPIRED"
  )
    return "danger";
  if (
    s === "PENDING" ||
    s === "LOW" ||
    s === "LOW_STOCK" ||
    s === "EXPIRING" ||
    s === "PROCESSING_RETURN"
  )
    return "warning";
  if (s === "INACTIVE") return "neutral";
  return "info";
}

export default statusTone;
