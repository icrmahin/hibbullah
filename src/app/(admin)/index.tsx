import { router } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../components/admin/AdminHeader";
import AdminStatCard from "../../components/admin/AdminStatCard";
import Button from "../../components/common/Button";
import EmptyState from "../../components/common/EmptyState";
import LoadingState from "../../components/common/LoadingState";
import StatusBadge from "../../components/common/StatusBadge";
import colors from "../../constants/colors";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import { mockInventory, mockOrders } from "../../services/mockData";
import { formatCurrency } from "../../utils/currency";

type StatusTone = "success" | "warning" | "info";
type IconName = SymbolViewProps["name"];

// Single icon size/weight scale for every list row keeps the UI consistent.
const ROW_ICON_SIZE = 18;

// Destinations already registered in (admin)/_layout.tsx; this list only
// surfaces them as compact actions — it adds no routes or architecture.
const OPERATIONS: {
  label: string;
  meta: string;
  route: string;
  icon: IconName;
}[] = [
  { label: "Orders", meta: "Review queue", route: "/(admin)/orders", icon: { ios: "shippingbox.fill", android: "inventory_2", web: "inventory_2" } },
  { label: "Inventory", meta: "Stock levels", route: "/(admin)/inventory", icon: { ios: "archivebox.fill", android: "inventory", web: "inventory" } },
  { label: "Products", meta: "Catalog", route: "/(admin)/products", icon: { ios: "pills.fill", android: "medication", web: "medication" } },
  { label: "Customers", meta: "Records", route: "/(admin)/customers", icon: { ios: "person.2.fill", android: "people", web: "people" } },
];

const CHEVRON: IconName = { ios: "chevron.right", android: "chevron_right", web: "chevron_right" };
const RIPPLE = "rgba(2, 55, 25, 0.08)";

function toneForStatus(status: string): StatusTone {
  if (status === "DELIVERED") return "success";
  if (status === "PENDING") return "warning";
  return "info";
}

export default function AdminDashboardScreen() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <LoadingState label="Loading dashboard" />;

  // Same derived values as before — presentation only, no new metrics.
  const pendingOrders = mockOrders.filter(
    (order) => order.status === "PENDING",
  ).length;
  const todaySales = mockOrders.reduce((sum, order) => sum + order.total, 0);
  const lowStock = mockInventory.filter(
    (item) => item.status !== "healthy",
  ).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <AdminHeader
        title="Dashboard"
        subtitle="Operations overview"
        action={
          <Button
            title="Add product"
            onPress={() => router.push("/(admin)/products/add")}
          />
        }
      />
      <ScrollView contentContainerStyle={styles.container}>
        {/* 01 — Metric overview from existing demo data, each with a meaning icon. */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionIndex}>01</Text>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.sectionRule} />
        </View>
        <View style={styles.grid}>
          <AdminStatCard
            label="Pending orders"
            value={pendingOrders}
            detail="Needs review"
            accent="gold"
            icon={{ ios: "shippingbox.fill", android: "inventory_2", web: "inventory_2" }}
          />
          <AdminStatCard
            label="Today sales"
            value={formatCurrency(todaySales)}
            detail="All demo orders"
            accent="green"
            icon={{ ios: "banknote.fill", android: "payments", web: "payments" }}
          />
          <AdminStatCard
            label="Active cycles"
            value={2}
            detail="In progress"
            icon={{ ios: "arrow.triangle.2.circlepath", android: "sync", web: "sync" }}
          />
          <AdminStatCard
            label="Low stock"
            value={lowStock}
            detail="Needs attention"
            accent="gold"
            icon={{ ios: "exclamationmark.triangle.fill", android: "warning", web: "warning" }}
          />
        </View>

        {/* 02 — Shortcuts to screens that already exist. */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionIndex}>02</Text>
          <Text style={styles.sectionTitle}>Operations</Text>
          <View style={styles.sectionRule} />
        </View>
        <View style={styles.opsPanel}>
          {OPERATIONS.map((op, index) => (
            <View key={op.label}>
              <Pressable
                style={({ pressed }) => [
                  styles.opRow,
                  pressed && styles.pressed,
                ]}
                android_ripple={{ color: RIPPLE }}
                accessibilityRole="button"
                accessibilityLabel={`Open ${op.label}`}
                onPress={() => router.push(op.route as never)}
              >
                <View style={styles.iconTile}>
                  <SymbolView
                    name={op.icon}
                    tintColor={colors.primary}
                    size={ROW_ICON_SIZE}
                  />
                </View>
                <View style={styles.opText}>
                  <Text style={styles.opLabel}>{op.label}</Text>
                  <Text style={styles.opMeta}>{op.meta}</Text>
                </View>
                <SymbolView
                  name={CHEVRON}
                  tintColor={colors.textMuted}
                  size={16}
                />
              </Pressable>
              {index < OPERATIONS.length - 1 ? (
                <View style={styles.hairline} />
              ) : null}
            </View>
          ))}
        </View>

        {/* 03 — Recent orders rendered from the same source as before. */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionIndex}>03</Text>
          <Text style={styles.sectionTitle}>Recent orders</Text>
          <View style={styles.sectionRule} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View all orders"
            onPress={() => router.push("/(admin)/orders" as never)}
          >
            <Text style={styles.sectionLink}>View all</Text>
          </Pressable>
        </View>
        <View style={styles.listPanel}>
          {mockOrders.length === 0 ? (
            <EmptyState
              title="No recent orders"
              message="New customer orders will appear here."
            />
          ) : (
            mockOrders.map((order, index) => (
              <View key={order.id}>
                <Pressable
                  style={({ pressed }) => [
                    styles.listRow,
                    pressed && styles.pressed,
                  ]}
                  android_ripple={{ color: RIPPLE }}
                  accessibilityRole="button"
                  accessibilityLabel={`Review order ${order.orderNumber}`}
                  onPress={() =>
                    router.push({
                      pathname: "/(admin)/orders/[orderId]",
                      params: { orderId: order.id },
                    })
                  }
                >
                  <View style={styles.listMain}>
                    <Text style={styles.listTitle}>{order.orderNumber}</Text>
                    <Text style={styles.listMeta} numberOfLines={1}>
                      {order.customerName} · {formatCurrency(order.total)}
                    </Text>
                  </View>
                  <StatusBadge
                    label={order.status}
                    tone={toneForStatus(order.status)}
                  />
                  <SymbolView
                    name={CHEVRON}
                    tintColor={colors.textMuted}
                    size={16}
                  />
                </Pressable>
                {index < mockOrders.length - 1 ? (
                  <View style={styles.hairline} />
                ) : null}
              </View>
            ))
          )}
        </View>

        <Text style={styles.footnote}>
          HIBBULLAH ADMIN · LIGHT MODE · SOLID SURFACES
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Solid light surface; nothing translucent, no blur anywhere.
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionIndex: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  sectionRule: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  sectionLink: {
    color: colors.primary,
    fontSize: typography.bodySmall,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  // One bordered panel with hairline dividers beats a stack of cards.
  opsPanel: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  opRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  // 28px framed tile: industrial framing around the meaning icon.
  iconTile: {
    width: 28,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  opText: { flex: 1, gap: 2 },
  opLabel: {
    color: colors.text,
    fontSize: typography.bodySmall,
    fontWeight: "600",
  },
  opMeta: {
    color: colors.textMuted,
    fontSize: typography.caption,
  },
  listPanel: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  listMain: { flex: 1, gap: 2 },
  listTitle: {
    color: colors.text,
    fontSize: typography.bodySmall,
    fontWeight: "700",
  },
  listMeta: { color: colors.textMuted, fontSize: typography.caption },
  hairline: { height: 1, backgroundColor: colors.borderSoft },
  // Press feedback: fading + a subtle scale reads as tactile without animation.
  pressed: { opacity: 0.6, transform: [{ scale: 0.99 }] },
  footnote: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: "600",
    letterSpacing: 1,
    textAlign: "center",
    marginTop: spacing.md,
  },
});