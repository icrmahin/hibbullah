import StatusBadge from "../common/StatusBadge";
import { statusTone } from "../../utils/statusTone";
import type { OrderStatus as OrderStatusValue } from "../../types/order";

const labels: Record<OrderStatusValue, string> = {
	PENDING: "Pending",
	CONFIRMED: "Confirmed",
	PROCESSING: "Processing",
	OUT_FOR_DELIVERY: "Out for delivery",
	DELIVERED: "Delivered",
	CANCELLED: "Cancelled",
	RETURNED: "Returned",
};

export default function OrderStatus({ status }: { status: OrderStatusValue }) {
	return <StatusBadge label={labels[status]} tone={statusTone(status)} />;
}
