import StatusBadge from "../common/StatusBadge";
import { statusTone } from "../../utils/statusTone";
import { orderStatusLabel } from "../../utils/displayLabels";
import type { OrderStatus as OrderStatusValue } from "../../types/order";

export default function OrderStatus({ status }: { status: OrderStatusValue }) {
	return <StatusBadge label={orderStatusLabel(status)} tone={statusTone(status)} />;
}
