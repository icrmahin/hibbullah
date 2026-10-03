import StatusBadge from "../common/StatusBadge";
import { statusTone } from "../../utils/statusTone";
import type { InventoryStatus as InventoryStatusValue } from "../../types/inventory";

export default function InventoryStatus({ status }: { status: InventoryStatusValue }) {
	const labels = { healthy: "Healthy", low: "Low stock", out_of_stock: "Out of stock" };
	return <StatusBadge label={labels[status]} tone={statusTone(status)} />;
}
