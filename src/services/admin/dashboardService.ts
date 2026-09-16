import config from "../../constants/config";
import { wait } from "../../lib/result";
import { store } from "../mockData";

const EXPIRY_WINDOW_DAYS = 90;

// Single aggregation point for the admin dashboard. All metrics and snapshot
// lists derive from the existing mock store; the screen never reads the store
// directly. Consumption goes through the useAdmin() hook.
export async function getAdminDashboard() {
  await wait();

  const pendingOrders = store.orders.filter(
    (order) => order.status === "PENDING",
  );
  const processingOrders = store.orders.filter(
    (order) => order.status === "PROCESSING",
  );
  const activeProducts = store.products.filter((product) => product.isActive);
  const lowStockProducts = store.products.filter(
    (product) => product.stock < config.lowStockThreshold,
  );

  const lowStockBatches = store.inventory
    .filter((item) => item.status !== "healthy")
    .slice(0, 4);

  const expiringBatches = store.inventory
    .filter((item) => {
      if (!item.expiryDate) return false;
      const within = Date.now() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      return new Date(item.expiryDate).getTime() <= within;
    })
    .slice(0, 4);

  return {
    pendingOrders: pendingOrders.length,
    processingOrders: processingOrders.length,
    activeProducts: activeProducts.length,
    lowStockProducts: lowStockProducts.length,
    attentionOrders: pendingOrders.slice(0, 3),
    pendingReturns: store.returns
      .filter((entry) => entry.status === "PENDING")
      .slice(0, 2),
    lowStockBatches,
    expiringBatches,
    recentOrders: store.orders.slice(0, 5),
    recentActivity: store.audit.slice(0, 4),
  };
}