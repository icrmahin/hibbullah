import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Sparkline from "../../components/admin/Sparkline";
import StockDonut from "../../components/admin/StockDonut";
import Screen from "../../components/common/Screen";
import ScreenHeader from "../../components/common/ScreenHeader";
import EmptyState from "../../components/common/EmptyState";
import ResponsiveContainer from "../../components/common/ResponsiveContainer";
import StatusBadge from "../../components/common/StatusBadge";
import InventoryStatus from "../../components/admin/InventoryStatus";
import Icon from "../../components/common/Icon";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useResponsive } from "../../hooks/useResponsive";
import { useAdmin } from "../../hooks/useAdmin";
import { useBottomInset } from "../../hooks/useBottomInset";
import LoadingState from "../../components/common/LoadingState";
import ErrorState from "../../components/common/ErrorState";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, letterSpacing, lineHeight } from "../../constants/typography";
import { formatCurrency } from "../../utils/currency";
import { formatShortDate } from "../../utils/date";
import type { IconName } from "../../components/common/Icon";

function timeNow(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AdminDashboardScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const { dashboard, loading, error, reload } = useAdmin();
  const { isWide } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);

  // The empty state says "Pull to retry", so the gesture has to exist. One handler, one
  // control, shared by both scroll views on this screen — the promise is kept rather than
  // the copy changed.
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void reload().finally(() => setRefreshing(false));
      }}
    />
  );

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Dashboard" subtitle={timeNow() + " · loading"} />}>
        <LoadingState label="Loading dashboard" />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen header={<ScreenHeader title="Dashboard" subtitle={timeNow() + " · error"} />}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  if (!dashboard) {
    return (
      <Screen header={<ScreenHeader title="Dashboard" subtitle={timeNow() + " · no data"} />}>
        <ScrollView
          contentContainerStyle={styles.stateScroll}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          <EmptyState title="No dashboard data" message="Dashboard returned no data. Pull to retry or check connection." actionLabel="Retry" onAction={reload} />
        </ScrollView>
      </Screen>
    );
  }

  const {
    totalSalesQty,
    totalSalesRevenue,
    totalEarning,
    grossProfit,
    returnedProfit,
    unpricedItems,
    unpricedQty,
    unlinkedReturns,
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
    <Screen
      header={
        <ScreenHeader
          title="Dashboard"
          subtitle={`${time} · live`}
          action={
            <Pressable
              onPress={() => open("/(admin)/products/add")}
              style={({ pressed }) => [
                styles.addPill,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add product"
            >
              {/* Was `color="#fff"`. The pill's fill is `colors.primary`, which is a dark
                  brand-cast surface in dark mode and a deep teal in light — so a fixed white
                  glyph is right in light mode and wrong in dark, where the label colour for a
                  fill is near-black. `textInverse` is the palette's name for exactly that. */}
              <Icon name="add" size={16} color={colors.textInverse} />
              <Text style={[styles.addText, { color: colors.textInverse }]}>Add</Text>
            </Pressable>
          }
        />
      }
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        <ResponsiveContainer sidebarAware maxWidth={isWide ? 1200 : 960}>
          <View style={styles.page}>
            {/* ===== Hero 4 — Sales > Earning > Orders > Stock ===== */}
            <View style={styles.heroGrid}>
              {/* Sales — primary */}
              <Pressable
                onPress={() => open("/(admin)/orders")}
                style={({ pressed }) => [styles.heroCard, { backgroundColor: colors.backgroundAlt }, pressed && styles.pressed]}
              >
                <View style={styles.heroTop}>
                  <View style={[styles.heroIcon, { backgroundColor: colors.primarySoft }]}>
                    <Icon name="trending-up" size={16} color={colors.accent} />
                  </View>
                  <Text style={[styles.heroLabel, { color: colors.textMuted }]}>Sales</Text>
                </View>
                <Text style={[styles.heroValue, { color: colors.text }]}>{totalSalesQty}</Text>
                <Text style={[styles.heroSub, { color: colors.textMuted }]}>{totalSalesQty === 1 ? "item sold" : "items sold"} · {formatCurrency(totalSalesRevenue)}</Text>
                <View style={styles.sparkWrap}>
                  <Sparkline data={salesTrend} color={colors.accent} />
                </View>
              </Pressable>

              {/* Earning — profit, not revenue. The sub-line says which figure it is and
                  what came off it, because a number a shopkeeper cannot account for is a
                  number they stop trusting. */}
              <Pressable
                onPress={() => open("/(admin)/orders")}
                style={({ pressed }) => [styles.heroCard, { backgroundColor: colors.backgroundAlt }, pressed && styles.pressed]}
              >
                <View style={styles.heroTop}>
                  <View style={[styles.heroIcon, { backgroundColor: colors.successSoft }]}>
                    <Icon name="payments" size={16} color={colors.success} />
                  </View>
                  <Text style={[styles.heroLabel, { color: colors.textMuted }]}>Earning</Text>
                </View>
                <Text style={[styles.heroValue, { color: colors.text }]}>{formatCurrency(totalEarning)}</Text>
                <Text style={[styles.heroSub, { color: colors.success }]}>
                  {returnedProfit > 0
                    ? `profit after ${formatCurrency(returnedProfit)} returned`
                    : "profit on delivered orders · 30d"}
                </Text>
                {unpricedItems > 0 ? (
                  // The old figure filled a missing cost price in as 80% of the sale price
                  // and reported the difference as earnings. Rather than guess, the
                  // database counts these and leaves them out — and says so, because a
                  // quietly low number is its own kind of lie.
                  //
                  // "Earnings exclude" rather than "N products have no cost price set",
                  // because the number counts products that were *sold* in the window and
                  // left out of this figure, not unpriced products sitting in the catalog.
                  // The second wording was the one that was here, and it sent the owner to
                  // a product list holding a different number of products than the one on
                  // screen. `unpricedQty` — how many units of money are missing — is what
                  // makes the warning feel like an amount rather than a chore.
                  <Text
                    style={[styles.heroWarn, { color: colors.warning }]}
                    onPress={() => open("/(admin)/products")}
                    accessibilityRole="link"
                  >
                    {`Earnings exclude ${unpricedItems} ${unpricedItems === 1 ? "product" : "products"} sold with no cost price set${
                      unpricedQty > 0 ? ` · ${unpricedQty} ${unpricedQty === 1 ? "unit" : "units"}` : ""
                    }`}
                  </Text>
                ) : null}
                {unlinkedReturns > 0 ? (
                  <Text style={[styles.heroWarn, { color: colors.warning }]} onPress={() => open("/(admin)/returns")} accessibilityRole="link">
                    {unlinkedReturns} returned {unlinkedReturns === 1 ? "unit is" : "units are"} not counted back
                  </Text>
                ) : null}
                <View style={styles.sparkWrap}>
                  <Sparkline data={earningTrend} color={colors.success} />
                </View>
              </Pressable>

              {/* Orders */}
              <Pressable
                onPress={() => open("/(admin)/orders")}
                style={({ pressed }) => [styles.heroCard, { backgroundColor: colors.backgroundAlt }, pressed && styles.pressed]}
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
                style={({ pressed }) => [styles.heroCard, { backgroundColor: colors.backgroundAlt }, pressed && styles.pressed]}
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
              <View style={[styles.missionLeft, { backgroundColor: colors.backgroundAlt }]}>
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
                        <View style={[styles.rowIcon, { backgroundColor: colors.primarySoft }]}>
                          <Icon name={it.icon} size={16} color={colors.accent} />
                        </View>
                        <View style={styles.rowMain}>
                          <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{it.title}</Text>
                          <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{it.sub}</Text>
                        </View>
                        {/* A solid accent border, not `colors.primary + "22"`. An
                            alpha-appended hex is not solid, and on a near-black page the
                            resulting 13% wash is a hairline of noise rather than an edge.
                            `borderFocus` *is* the accent in both palettes, so this reads
                            the same at full strength. */}
                        <View style={[styles.chip, { borderColor: colors.borderFocus, backgroundColor: colors.primarySoft }]}>
                          <Text style={[styles.chipText, { color: colors.accent }]}>{it.action}</Text>
                        </View>
                      </Pressable>
                      {idx < fixNow.length - 1 ? <View style={[styles.hairline, { backgroundColor: colors.borderSoft }]} /> : null}
                    </View>
                  ))
                )}
              </View>

              <View style={[styles.missionRight, { backgroundColor: colors.backgroundAlt }]}>
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

            {/* ===== Command bar ===== */}
            <View style={[styles.commandBar, { backgroundColor: colors.backgroundAlt }]}>
              <Pressable onPress={() => open("/(admin)/products/add")} style={styles.cmd}><Icon name="add" size={16} color={colors.accent} /><Text style={[styles.cmdText, { color: colors.text }]}>Add</Text></Pressable>
              <View style={[styles.cmdSep, { backgroundColor: colors.borderSoft }]} />
              <Pressable onPress={() => open("/(admin)/orders")} style={styles.cmd}><Icon name="receipt-long" size={16} color={colors.textMuted} /><Text style={[styles.cmdText, { color: colors.textMuted }]}>Orders</Text></Pressable>
              <Pressable onPress={() => open("/(admin)/products")} style={styles.cmd}><Icon name="inventory-2" size={16} color={colors.textMuted} /><Text style={[styles.cmdText, { color: colors.textMuted }]}>Products</Text></Pressable>
              <Pressable onPress={() => open("/(admin)/inventory")} style={styles.cmd}><Icon name="warehouse" size={16} color={colors.textMuted} /><Text style={[styles.cmdText, { color: colors.textMuted }]}>Stock</Text></Pressable>
            </View>

            {/* ===== Product cockpit — rows, not cards inside the card ===== */}
            <View style={[styles.cockpit, { backgroundColor: colors.backgroundAlt }]}>
              <View style={styles.cockpitHead}>
                <Text style={[styles.cockpitTitle, { color: colors.text }]}>Products</Text>
                <Pressable onPress={() => open("/(admin)/products")}><Text style={[styles.link, { color: colors.accent }]}>Manage →</Text></Pressable>
              </View>
              {recentLowPreview(lowStockBatches).map((p: any, idx: number, arr: any[]) => (
                <View key={p.id}>
                  <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => open(`/admin/products/${p.product_id}`)}>
                    <View style={styles.rowMain}>
                      <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{p.productName}</Text>
                      <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>Batch {p.batchNumber} · {p.quantity} left</Text>
                    </View>
                    <InventoryStatus status={p.status} />
                  </Pressable>
                  {idx < arr.length - 1 ? <View style={[styles.hairline, { backgroundColor: colors.borderSoft }]} /> : null}
                </View>
              ))}
              {lowStockBatches.length === 0 ? <Text style={[styles.calmText, { color: colors.textMuted }]}>No fraying stock</Text> : null}
            </View>

            {/* Recent orders — keep one compact list */}
            <View style={[styles.panel, { backgroundColor: colors.backgroundAlt }]}>
              <View style={styles.panelHead}>
                <Text style={[styles.panelTitle, { color: colors.text }]}>Latest orders</Text>
                <Pressable onPress={() => open("/(admin)/orders")}><Text style={[styles.link, { color: colors.accent }]}>View all</Text></Pressable>
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
    </Screen>
  );
}

function recentLowPreview(batches: any[]) { return batches.slice(0, 4); }

const styles = StyleSheet.create({
  // Horizontal padding belongs to ResponsiveContainer, so the 16px gutter exists once.
  scroll: { paddingTop: spacing.sm, gap: spacing.md },
  stateScroll: { flexGrow: 1 },
  page: { gap: spacing.md },
  heroGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  heroCard: { flexGrow: 1, flexBasis: "46%", minHeight: 92, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xxs },
  heroTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heroIcon: { width: 26, height: 26, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  heroLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
    letterSpacing: letterSpacing.wide,
  },
  heroValue: {
    fontFamily: fontFamily.soraBold,
    fontSize: fontSize.title2,
    lineHeight: fontSize.title2 * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
    marginTop: spacing.xs,
  },
  heroSub: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
  },
  // The caveat under a headline figure. Sized like the sub-label so it reads as a footnote
  // to the number above it rather than as a second metric competing with it.
  heroWarn: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
    marginTop: spacing.xxs,
  },
  sparkWrap: { marginTop: spacing.xs, opacity: 0.9 },
  heroFoot: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  footText: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
  },
  mission: { gap: spacing.sm },
  missionWide: { flexDirection: "row", gap: spacing.sm },
  missionLeft: { flex: 1, borderRadius: radius.lg, padding: spacing.md },
  missionRight: { borderRadius: radius.lg, padding: spacing.md, minWidth: 160, alignItems: "center", gap: spacing.xs },
  missionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  missionTitle: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  missionCount: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
  },
  missionSub: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
  },
  donutRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  legend: { gap: spacing.xs },
  legRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  legDot: { width: 8, height: 8, borderRadius: radius.pill },
  legText: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
  },
  expiry: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
    marginTop: spacing.xs,
  },
  calm: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  calmText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, minHeight: 44 },
  rowIcon: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  rowMain: { flex: 1, gap: spacing.xxs },
  rowTitle: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
  },
  rowSub: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  chipText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  hairline: { height: 1 },
  commandBar: { flexDirection: "row", alignItems: "center", borderRadius: radius.lg, padding: spacing.xs, gap: spacing.xs },
  cmd: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.sm, borderRadius: radius.pill },
  cmdText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  cmdSep: { width: 1, height: 20 },
  cockpit: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: radius.pill,
  },
  addText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  cockpitHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cockpitTitle: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  link: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  panel: { borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  panelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  panelTitle: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
});
