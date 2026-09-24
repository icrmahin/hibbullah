import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../components/admin/AdminHeader";
import Sparkline from "../../components/admin/Sparkline";
import StockDonut from "../../components/admin/StockDonut";
import Button from "../../components/common/Button";
import EmptyState from "../../components/common/EmptyState";
import ResponsiveContainer from "../../components/common/ResponsiveContainer";
import StatusBadge from "../../components/common/StatusBadge";
import InventoryStatus from "../../components/admin/InventoryStatus";
import Icon from "../../components/common/Icon";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { useResponsive } from "../../hooks/useResponsive";
import { useAdmin } from "../../hooks/useAdmin";
import { useAuth } from "../../hooks/useAuth";
import LoadingState from "../../components/common/LoadingState";
import ErrorState from "../../components/common/ErrorState";
import { radius } from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import { formatCurrency } from "../../utils/currency";
import { formatShortDate } from "../../utils/date";
import type { IconName } from "../../components/common/Icon";

function timeNow(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AdminDashboardScreen() {
  const colors = useThemeColors();
  const shadows = useShadows();
  const { user } = useAuth();
  const { dashboard, loading, error, reload } = useAdmin();
  const { isWide, isMobile } = useResponsive();

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Dashboard" subtitle={timeNow() + " · loading"} />
        <LoadingState label="Loading dashboard" />
      </SafeAreaView>
    );
  }
  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Dashboard" subtitle={timeNow() + " · error"} />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  if (!dashboard) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Dashboard" subtitle={timeNow() + " · no data"} />
        <EmptyState title="No dashboard data" message="Dashboard returned no data. Pull to retry or check connection." actionLabel="Retry" onAction={reload} />
      </SafeAreaView>
    );
  }

  const {
    totalSalesQty,
    totalSalesRevenue,
    totalEarning,
    salesTrend,
    earningTrend,
    pendingOrders,
    processingOrders,
    activeProducts,
    lowStockProducts,
    attentionOrders,
    pendingReturns,
    lowStockBatches,
    expiringBatches,
    recentOrders,
  } = dashboard;

  const open = (href: string) => router.push(href as never);
  const openOrder = (id: string) => router.push({ pathname: "/(admin)/orders/[orderId]", params: { orderId: id } });

  // Fix now — top 3 priority (orders pending > low stock)
  const fixNow = [
    ...attentionOrders.slice(0, 2).map((o: any) => ({
      id: o.id,
      title: o.orderNumber,
      sub: `${o.customerName} · ${formatCurrency(o.total)}`,
      icon: "receipt-long" as IconName,
      action: "Review",
      onPress: () => openOrder(o.id),
    })),
    ...lowStockBatches.slice(0, 3 - Math.min(2, attentionOrders.length)).map((b: any) => ({
      id: b.id,
      title: b.productName,
      sub: `Batch ${b.batchNumber} · ${b.quantity} left`,
      icon: "inventory-2" as IconName,
      action: "Restock",
      onPress: () => open("/(admin)/inventory"),
    })),
  ].slice(0, 3);

  if (pendingReturns.length && fixNow.length < 3) {
    const r: any = pendingReturns[0];
    fixNow.push({ id: r.id, title: r.productName, sub: `${r.customerName} · ${r.quantity} pcs`, icon: "assignment-return" as IconName, action: "Decide", onPress: () => open(`/(admin)/returns/${r.id}`) });
  }

  const healthy = Math.max(activeProducts - lowStockProducts, 0);
  const low = lowStockProducts;
  const out = Math.max(lowStockBatches.filter((b: any) => b.status === "out_of_stock").length, 0);

  const time = timeNow();
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader
        title="Dashboard"
        subtitle={`${time} · live`}
        action={
          <Pressable
            onPress={() => open("/(admin)/products/add")}
            style={({ pressed }) => [
              styles.addPill,
              { backgroundColor: colors.primary, borderColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add product"
          >
            <Icon name="add" size={16} color="#fff" />
            <Text style={styles.addText}>Add</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: spacing.xxxl }]}>
        <ResponsiveContainer sidebarAware maxWidth={isWide ? 1200 : 960}>
          <View style={styles.page}>
            {/* ===== Hero 4 — Sales > Earning > Orders > Stock (classic, compact, soft) ===== */}
            <View style={styles.heroGrid}>
              {/* Sales — primary */}
              <Pressable
                onPress={() => open("/(admin)/orders")}
                style={({ pressed }) => [styles.heroCard, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }, pressed && styles.pressed]}
              >
                <View style={styles.heroTop}>
                  <View style={[styles.heroIcon, { backgroundColor: colors.primarySoft }]}>
                    <Icon name="trending-up" size={16} color={colors.primary} />
                  </View>
                  <Text style={[styles.heroLabel, { color: colors.textMuted }]}>Sales</Text>
                </View>
                <Text style={[styles.heroValue, { color: colors.text }]}>{totalSalesQty}</Text>
                <Text style={[styles.heroSub, { color: colors.textMuted }]}>{totalSalesQty === 1 ? "item sold" : "items sold"} · {formatCurrency(totalSalesRevenue)}</Text>
                <View style={styles.sparkWrap}>
                  <Sparkline data={salesTrend.length ? salesTrend : [0, 1, 0, 2, 1, 3, totalSalesQty]} color={colors.primary} />
                </View>
              </Pressable>

              {/* Earning */}
              <Pressable
                onPress={() => open("/(admin)/orders")}
                style={({ pressed }) => [styles.heroCard, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }, pressed && styles.pressed]}
              >
                <View style={styles.heroTop}>
                  <View style={[styles.heroIcon, { backgroundColor: colors.successSoft }]}>
                    <Icon name="payments" size={16} color={colors.success} />
                  </View>
                  <Text style={[styles.heroLabel, { color: colors.textMuted }]}>Earning</Text>
                </View>
                <Text style={[styles.heroValue, { color: colors.text }]}>{formatCurrency(totalEarning)}</Text>
                <Text style={[styles.heroSub, { color: colors.success }]}>profit · 30d</Text>
                <View style={styles.sparkWrap}>
                  <Sparkline data={earningTrend.length ? earningTrend : [0, 2, 1, 3, 2, 4, Math.round(totalEarning / 30)]} color={colors.success} />
                </View>
              </Pressable>

              {/* Orders */}
              <Pressable
                onPress={() => open("/(admin)/orders")}
                style={({ pressed }) => [styles.heroCard, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }, pressed && styles.pressed]}
              >
                <View style={styles.heroTop}>
                  <View style={[styles.heroIcon, { backgroundColor: colors.warningSoft }]}>
                    <Icon name="receipt-long" size={16} color={colors.warning} />
                  </View>
                  <Text style={[styles.heroLabel, { color: colors.textMuted }]}>Orders</Text>
                </View>
                <Text style={[styles.heroValue, { color: colors.text }]}>{pendingOrders}</Text>
                <Text style={[styles.heroSub, { color: colors.textMuted }]}>{pendingOrders === 1 ? "awaiting" : "awaiting"} · {processingOrders} in motion</Text>
                <View style={styles.heroFoot}>
                  <View style={[styles.dot, { backgroundColor: colors.warning }]} />
                  <Text style={[styles.footText, { color: colors.textMuted }]}>Pending</Text>
                </View>
              </Pressable>

              {/* Stock */}
              <Pressable
                onPress={() => open("/(admin)/products")}
                style={({ pressed }) => [styles.heroCard, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }, pressed && styles.pressed]}
              >
                <View style={styles.heroTop}>
                  <View style={[styles.heroIcon, { backgroundColor: colors.background }]}>
                    <Icon name="inventory-2" size={16} color={colors.textMuted} />
                  </View>
                  <Text style={[styles.heroLabel, { color: colors.textMuted }]}>Stock</Text>
                </View>
                <Text style={[styles.heroValue, { color: colors.text }]}>{activeProducts}</Text>
                <Text style={[styles.heroSub, { color: low > 0 ? colors.warning : colors.success }]}>{low > 0 ? `${low} fraying` : "all healthy"} · live</Text>
                <View style={styles.heroFoot}>
                  <Text style={[styles.footText, { color: colors.textMuted }]}>{healthy} ok</Text>
                </View>
              </Pressable>
            </View>

            {/* ===== Mission Board — Fix now + Donut (connectivity) ===== */}
            <View style={[styles.mission, isWide && styles.missionWide]}>
              <View style={[styles.missionLeft, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }]}>
                <View style={styles.missionHead}>
                  <Text style={[styles.missionTitle, { color: colors.text }]}>Fix now</Text>
                  <Text style={[styles.missionCount, { color: colors.textMuted }]}>{fixNow.length} · tap to act</Text>
                </View>
                {fixNow.length === 0 ? (
                  <View style={styles.calm}>
                    <Icon name="verified" size={20} color={colors.success} />
                    <Text style={[styles.calmText, { color: colors.success }]}>All calm — nothing needs you</Text>
                  </View>
                ) : (
                  fixNow.map((it, idx) => (
                    <View key={it.id}>
                      <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={it.onPress}>
                        <View style={[styles.rowIcon, { backgroundColor: colors.background, borderColor: colors.borderSoft }]}>
                          <Icon name={it.icon} size={16} color={colors.primary} />
                        </View>
                        <View style={styles.rowMain}>
                          <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{it.title}</Text>
                          <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{it.sub}</Text>
                        </View>
                        <View style={[styles.chip, { borderColor: colors.primary + "22", backgroundColor: colors.primarySoft }]}>
                          <Text style={[styles.chipText, { color: colors.primary }]}>{it.action}</Text>
                        </View>
                      </Pressable>
                      {idx < fixNow.length - 1 ? <View style={[styles.hairline, { backgroundColor: colors.borderSoft }]} /> : null}
                    </View>
                  ))
                )}
              </View>

              <View style={[styles.missionRight, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }]}>
                <Text style={[styles.missionTitle, { color: colors.text }]}>Stock pulse</Text>
                <Text style={[styles.missionSub, { color: colors.textMuted }]}>30 days</Text>
                <View style={styles.donutRow}>
                  <StockDonut healthy={healthy} low={low} out={out} />
                  <View style={styles.legend}>
                    <View style={styles.legRow}><View style={[styles.legDot, { backgroundColor: colors.success }]} /><Text style={[styles.legText, { color: colors.textMuted }]}>Healthy {healthy}</Text></View>
                    <View style={styles.legRow}><View style={[styles.legDot, { backgroundColor: colors.warning }]} /><Text style={[styles.legText, { color: colors.textMuted }]}>Low {low}</Text></View>
                    <View style={styles.legRow}><View style={[styles.legDot, { backgroundColor: colors.danger }]} /><Text style={[styles.legText, { color: colors.textMuted }]}>Out {out}</Text></View>
                  </View>
                </View>
                {expiringBatches.length ? <Text style={[styles.expiry, { color: colors.warning }]}>{expiringBatches.length} expiring in 60d</Text> : null}
              </View>
            </View>

            {/* ===== Command bar — feather pill ===== */}
            <View style={[styles.commandBar, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }]}>
              <Pressable onPress={() => open("/(admin)/products/add")} style={styles.cmd}><Icon name="add" size={16} color={colors.primary} /><Text style={[styles.cmdText, { color: colors.text }]}>Add</Text></Pressable>
              <View style={[styles.cmdSep, { backgroundColor: colors.borderSoft }]} />
              <Pressable onPress={() => open("/(admin)/orders")} style={styles.cmd}><Icon name="receipt-long" size={16} color={colors.textMuted} /><Text style={[styles.cmdText, { color: colors.textMuted }]}>Orders</Text></Pressable>
              <Pressable onPress={() => open("/(admin)/products")} style={styles.cmd}><Icon name="inventory-2" size={16} color={colors.textMuted} /><Text style={[styles.cmdText, { color: colors.textMuted }]}>Products</Text></Pressable>
              <Pressable onPress={() => open("/(admin)/inventory")} style={styles.cmd}><Icon name="warehouse" size={16} color={colors.textMuted} /><Text style={[styles.cmdText, { color: colors.textMuted }]}>Stock</Text></Pressable>
            </View>

            {/* ===== Product cockpit ===== */}
            <View style={[styles.cockpit, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }]}>
              <View style={styles.cockpitHead}>
                <Text style={[styles.cockpitTitle, { color: colors.text }]}>Products</Text>
                <Pressable onPress={() => open("/(admin)/products")}><Text style={[styles.link, { color: colors.primary }]}>Manage →</Text></Pressable>
              </View>
              <View style={styles.productMiniList}>
                {recentLowPreview(lowStockBatches).map((p: any) => (
                  <Pressable key={p.id} onPress={() => open(`/admin/products/${p.product_id}`)} style={[styles.miniCard, { borderColor: colors.borderSoft, backgroundColor: colors.background }]}>
                    <Text style={[styles.miniName, { color: colors.text }]} numberOfLines={1}>{p.productName}</Text>
                    <Text style={[styles.miniMeta, { color: colors.textMuted }]}>Batch {p.batchNumber} · {p.quantity} left</Text>
                    <InventoryStatus status={p.status} />
                  </Pressable>
                ))}
                {lowStockBatches.length === 0 ? <Text style={[styles.calmText, { color: colors.textMuted }]}>No fraying stock</Text> : null}
              </View>
            </View>

            {/* Recent orders — keep one compact list */}
            <View style={[styles.panel, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft, ...shadows.xs }]}>
              <View style={styles.panelHead}>
                <Text style={[styles.panelTitle, { color: colors.text }]}>Latest orders</Text>
                <Pressable onPress={() => open("/(admin)/orders")}><Text style={[styles.link, { color: colors.primary }]}>View all</Text></Pressable>
              </View>
              {recentOrders.length === 0 ? <EmptyState title="No orders" message="New orders will appear here." /> : recentOrders.slice(0, 4).map((o: any, i: number) => (
                <View key={o.id}>
                  <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => openOrder(o.id)}>
                    <View style={styles.rowMain}>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>{o.orderNumber} · {formatCurrency(o.total)}</Text>
                      <Text style={[styles.rowSub, { color: colors.textMuted }]}>{o.customerName} · {formatShortDate(o.createdAt)}</Text>
                    </View>
                    <StatusBadge label={o.status} tone={o.status === "DELIVERED" ? "success" : o.status === "PENDING" ? "warning" : "info"} />
                    <Icon name="chevron-right" size={16} color={colors.textMuted} />
                  </Pressable>
                  {i < Math.min(4, recentOrders.length) - 1 ? <View style={[styles.hairline, { backgroundColor: colors.borderSoft }]} /> : null}
                </View>
              ))}
            </View>
          </View>
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

function recentLowPreview(batches: any[]) { return batches.slice(0, 4); }

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.md },
  page: { gap: spacing.md },
  heroGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  heroCard: { flexGrow: 1, flexBasis: "46%", minHeight: 92, borderRadius: radius.xl, borderWidth: 1, padding: spacing.md, gap: 2 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heroIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  heroLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase" },
  heroValue: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4, marginTop: spacing.xs },
  heroSub: { fontSize: 11, fontWeight: "600" },
  sparkWrap: { marginTop: spacing.xs, opacity: 0.9 },
  heroFoot: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs },
  dot: { width: 6, height: 6, borderRadius: 3 },
  footText: { fontSize: 11 },
  mission: { gap: spacing.sm },
  missionWide: { flexDirection: "row", gap: spacing.sm },
  missionLeft: { flex: 1, borderRadius: radius.xl, borderWidth: 1, padding: spacing.md },
  missionRight: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.md, minWidth: 160, alignItems: "center", gap: spacing.xs },
  missionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  missionTitle: { fontSize: 13, fontWeight: "800" },
  missionCount: { fontSize: 11 },
  missionSub: { fontSize: 11 },
  donutRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  legend: { gap: 4 },
  legRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legDot: { width: 8, height: 8, borderRadius: 4 },
  legText: { fontSize: 11, fontWeight: "600" },
  expiry: { fontSize: 11, fontWeight: "600", marginTop: spacing.xs },
  calm: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  calmText: { fontSize: 12, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, minHeight: 44 },
  rowIcon: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 13, fontWeight: "700" },
  rowSub: { fontSize: 11 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  chipText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  hairline: { height: 1 },
  commandBar: { flexDirection: "row", alignItems: "center", borderRadius: radius.xl, borderWidth: 1, padding: spacing.xs, gap: spacing.xs },
  cmd: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.sm, borderRadius: radius.pill },
  cmdText: { fontSize: 12, fontWeight: "700" },
  cmdSep: { width: 1, height: 20 },
  cockpit: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
  },
  addText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  cockpitHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cockpitTitle: { fontSize: 13, fontWeight: "800" },
  link: { fontSize: 12, fontWeight: "700" },
  productMiniList: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  miniCard: { flexGrow: 1, flexBasis: "46%", borderWidth: 1, borderRadius: radius.lg, padding: spacing.sm, gap: 4 },
  miniName: { fontSize: 12, fontWeight: "700" },
  miniMeta: { fontSize: 11 },
  panel: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.md, gap: spacing.xs },
  panelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  panelTitle: { fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
});
