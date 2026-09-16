import { router } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../components/admin/AdminHeader";
import AdminStatCard from "../../components/admin/AdminStatCard";
import InventoryStatus from "../../components/admin/InventoryStatus";
import Button from "../../components/common/Button";
import EmptyState from "../../components/common/EmptyState";
import LoadingState from "../../components/common/LoadingState";
import StatusBadge from "../../components/common/StatusBadge";
import config from "../../constants/config";
import colors from "../../constants/colors";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";
import { useAdmin } from "../../hooks/useAdmin";
import { useAuth } from "../../hooks/useAuth";
import { formatCurrency } from "../../utils/currency";
import { formatShortDate } from "../../utils/date";

type StatusTone = "success" | "warning" | "danger" | "info";
type IconName = SymbolViewProps["name"];

const ROW_ICON_SIZE = 18;

const ICONS = {
  orders: { ios: "shippingbox.fill", android: "inventory_2", web: "inventory_2" },
  processing: { ios: "arrow.triangle.2.circlepath", android: "sync", web: "sync" },
  stock: { ios: "exclamationmark.triangle.fill", android: "warning", web: "warning" },
  active: { ios: "checkmark.seal.fill", android: "verified", web: "verified" },
  returns: { ios: "arrow.uturn.backward", android: "assignment_return", web: "assignment_return" },
  pending: { ios: "clock.fill", android: "pending_actions", web: "pending_actions" },
  chevron: { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
} as const;

const QUICK_ACTIONS: {
  label: string;
  meta: string;
  route: string;
  icon: IconName;
}[] = [
  { label: "Add product", meta: "New medicine", route: "/(admin)/products/add", icon: { ios: "plus.circle.fill", android: "add_circle", web: "add_circle" } },
  { label: "Manage orders", meta: "Review queue", route: "/(admin)/orders", icon: ICONS.orders },
  { label: "Inventory", meta: "Stock levels", route: "/(admin)/inventory", icon: { ios: "archivebox.fill", android: "inventory", web: "inventory" } },
  { label: "Customers", meta: "Records", route: "/(admin)/customers", icon: { ios: "person.2.fill", android: "people", web: "people" } },
];

function toneForStatus(status: string): StatusTone {
  if (status === "DELIVERED") return "success";
  if (status === "PENDING") return "warning";
  if (status === "CANCELLED" || status === "RETURNED") return "danger";
  return "info";
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

type AttentionRowData = {
  key: string;
  icon: IconName;
  title: string;
  meta: string;
  status: ReactNode;
  actionLabel: string;
  onPress: () => void;
};

function SectionHead({
  index,
  title,
  linkLabel,
  onLink,
}: {
  index: string;
  title: string;
  linkLabel?: string;
  onLink?: () => void;
}) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionIndex}>{index}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionRule} />
      {linkLabel && onLink ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={linkLabel}
          onPress={onLink}
        >
          <Text style={styles.sectionLink}>{linkLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ActionChip({ label }: { label: string }) {
  return (
    <View style={styles.actionChip}>
      <Text style={styles.actionChipText}>{label}</Text>
    </View>
  );
}

export default function AdminDashboardScreen() {
  const { user } = useAuth();
  const { dashboard, loading } = useAdmin();
  const { width } = useWindowDimensions();

  const isCompact = width < 768;
  const isWide = width >= 1024;

  if (loading || !dashboard) return <LoadingState label="Loading dashboard" />;

  const {
    pendingOrders,
    processingOrders,
    activeProducts,
    lowStockProducts,
    attentionOrders,
    pendingReturns,
    lowStockBatches,
    expiringBatches,
    recentOrders,
    recentActivity,
  } = dashboard;

  const openRow = (href: string) => router.push(href as never);
  const openOrder = (orderId: string) =>
    router.push({ pathname: "/(admin)/orders/[orderId]", params: { orderId } });
  const openReturn = (returnId: string) =>
    router.push({
      pathname: "/(admin)/returns/[returnId]",
      params: { returnId },
    });

  const attention: AttentionRowData[] = [
    ...attentionOrders.map((order) => ({
      key: order.id,
      icon: ICONS.pending as IconName,
      title: `Order ${order.orderNumber} pending`,
      meta: `${order.customerName} · ${formatCurrency(order.total)}`,
      status: <StatusBadge label="Pending" tone="warning" />,
      actionLabel: "Review",
      onPress: () => openOrder(order.id),
    })),
    ...lowStockBatches.map((item) => ({
      key: item.id,
      icon: ICONS.stock as IconName,
      title: item.productName,
      meta: `Batch ${item.batchNumber} · Qty ${item.quantity}`,
      status: <InventoryStatus status={item.status} />,
      actionLabel: "Restock",
      onPress: () => openRow("/(admin)/inventory"),
    })),
    ...pendingReturns.map((entry) => ({
      key: entry.id,
      icon: ICONS.returns as IconName,
      title: entry.productName,
      meta: `${entry.customerName} · Qty ${entry.quantity}`,
      status: <StatusBadge label="Pending" tone="warning" />,
      actionLabel: "Decide",
      onPress: () => openReturn(entry.id),
    })),
  ];

  const snapshot = [
    ...lowStockBatches,
    ...expiringBatches.filter(
      (entry) => !lowStockBatches.some((item) => item.id === entry.id),
    ),
  ].slice(0, 5);

  return (
    <SafeAreaView style={styles.safeArea}>
      <AdminHeader
        title="Dashboard"
        subtitle={`${greeting()}, ${user?.name ?? "Admin"}`}
        action={
          <Button
            title="Add product"
            onPress={() => router.push("/(admin)/products/add")}
          />
        }
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View
          style={[
            styles.page,
            !isCompact && styles.pageTablet,
            isWide && styles.pageWide,
          ]}
        >
          {/* 01 — Key statistics */}
          <SectionHead index="01" title="Summary" />
          <View style={styles.grid}>
            {[
              {
                label: "Pending orders",
                value: pendingOrders,
                detail: "Awaiting review",
                accent: "gold" as const,
                icon: ICONS.pending,
              },
              {
                label: "Processing",
                value: processingOrders,
                detail: "Being fulfilled",
                accent: "neutral" as const,
                icon: ICONS.processing,
              },
              {
                label: "Low-stock products",
                value: lowStockProducts,
                detail: `Below ${config.lowStockThreshold} units`,
                accent: "gold" as const,
                icon: ICONS.stock,
              },
              {
                label: "Active products",
                value: activeProducts,
                detail: "In the catalogue",
                accent: "green" as const,
                icon: ICONS.active,
              },
            ].map((stat) => (
              <View
                key={stat.label}
                style={[styles.statCell, !isCompact && styles.statCellWide]}
              >
                <AdminStatCard
                  label={stat.label}
                  value={stat.value}
                  detail={stat.detail}
                  accent={stat.accent}
                  icon={stat.icon as IconName}
                />
              </View>
            ))}
          </View>

          {/* 02 — Actionable items */}
          <SectionHead index="02" title="Needs attention" />
          <View style={styles.panel}>
            {attention.length === 0 ? (
              <View style={styles.inlineNote}>
                <Text style={styles.inlineNoteText}>
                  Nothing needs your attention right now.
                </Text>
              </View>
            ) : (
              attention.map((item, index) => (
                <View key={item.key}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.listRow,
                      pressed && styles.pressed,
                    ]}
                    android_ripple={{ color: colors.ripple.primary }}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.actionLabel} ${item.title}`}
                    onPress={item.onPress}
                  >
                    <View style={styles.iconTile}>
                      <SymbolView
                        name={item.icon}
                        tintColor={colors.primary}
                        size={ROW_ICON_SIZE}
                      />
                    </View>
                    <View style={styles.listMain}>
                      <Text style={styles.listTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.listMeta} numberOfLines={1}>
                        {item.meta}
                      </Text>
                    </View>
                    {item.status}
                    <ActionChip label={item.actionLabel} />
                  </Pressable>
                  {index < attention.length - 1 ? (
                    <View style={styles.hairline} />
                  ) : null}
                </View>
              ))
            )}
          </View>

          {/* 03 — Fast paths */}
          <SectionHead index="03" title="Quick actions" />
          <View style={styles.actionGrid}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.label}
                style={({ pressed }) => [
                  styles.actionTile,
                  !isCompact && styles.actionTileWide,
                  pressed && styles.pressed,
                ]}
                android_ripple={{ color: colors.ripple.primary }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={() => openRow(action.route)}
              >
                <View style={styles.iconTile}>
                  <SymbolView
                    name={action.icon}
                    tintColor={colors.primary}
                    size={ROW_ICON_SIZE}
                  />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
                <Text style={styles.actionMeta}>{action.meta}</Text>
              </Pressable>
            ))}
          </View>

          {/* 04–05 — Two columns on wide screens */}
          <View style={[styles.body, isWide && styles.bodyWide]}>
            <View style={[styles.bodyCol, isWide && styles.bodyColLeft]}>
              <SectionHead
                index="04"
                title="Recent orders"
                linkLabel="View all"
                onLink={() => openRow("/(admin)/orders")}
              />
              <View style={styles.panel}>
                {recentOrders.length === 0 ? (
                  <EmptyState
                    title="No recent orders"
                    message="New customer orders will appear here."
                  />
                ) : (
                  recentOrders.map((order, index) => (
                    <View key={order.id}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.listRow,
                          pressed && styles.pressed,
                        ]}
                        android_ripple={{ color: colors.ripple.primary }}
                        accessibilityRole="button"
                        accessibilityLabel={`Review order ${order.orderNumber}`}
                        onPress={() => openOrder(order.id)}
                      >
                        <View style={styles.listMain}>
                          <Text style={styles.listTitle} numberOfLines={1}>
                            {order.orderNumber} · {formatCurrency(order.total)}
                          </Text>
                          <Text style={styles.listMeta} numberOfLines={1}>
                            {order.customerName} ·{" "}
                            {formatShortDate(order.createdAt)}
                          </Text>
                        </View>
                        <StatusBadge
                          label={order.status}
                          tone={toneForStatus(order.status)}
                        />
                        <SymbolView
                          name={ICONS.chevron}
                          tintColor={colors.textMuted}
                          size={16}
                        />
                      </Pressable>
                      {index < recentOrders.length - 1 ? (
                        <View style={styles.hairline} />
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            </View>

            <View style={[styles.bodyCol, isWide && styles.bodyColRight]}>
              <SectionHead
                index="05"
                title="Inventory snapshot"
                linkLabel="Manage"
                onLink={() => openRow("/(admin)/inventory")}
              />
              <View style={styles.panel}>
                {snapshot.length === 0 ? (
                  <View style={styles.inlineNote}>
                    <Text style={styles.inlineNoteText}>
                      All stock levels are healthy.
                    </Text>
                  </View>
                ) : (
                  snapshot.map((item, index) => {
                    const isExpiring = expiringBatches.some(
                      (entry) => entry.id === item.id,
                    );
                    return (
                      <View key={item.id}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.listRow,
                            pressed && styles.pressed,
                          ]}
                          android_ripple={{ color: colors.ripple.primary }}
                          accessibilityRole="button"
                          accessibilityLabel={`Review ${item.productName} stock`}
                          onPress={() => openRow("/(admin)/inventory")}
                        >
                          <View style={styles.listMain}>
                            <Text style={styles.listTitle} numberOfLines={1}>
                              {item.productName}
                            </Text>
                            <Text style={styles.listMeta} numberOfLines={1}>
                              {isExpiring && item.expiryDate
                                ? `Batch ${item.batchNumber} · Qty ${item.quantity} · Exp ${formatShortDate(item.expiryDate)}`
                                : `Batch ${item.batchNumber} · Qty ${item.quantity}`}
                            </Text>
                          </View>
                          <InventoryStatus status={item.status} />
                          <SymbolView
                            name={ICONS.chevron}
                            tintColor={colors.textMuted}
                            size={16}
                          />
                        </Pressable>
                        {index < snapshot.length - 1 ? (
                          <View style={styles.hairline} />
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>

              <SectionHead
                index="06"
                title="Recent activity"
                linkLabel="Audit log"
                onLink={() => openRow("/(admin)/audit")}
              />
              <View style={styles.panel}>
                {recentActivity.length === 0 ? (
                  <EmptyState
                    title="No activity yet"
                    message="Admin actions will be recorded here."
                  />
                ) : (
                  recentActivity.map((entry, index) => (
                    <View key={entry.id}>
                      <View style={styles.listRow}>
                        <View style={styles.listMain}>
                          <Text style={styles.listTitle} numberOfLines={1}>
                            {entry.action}
                          </Text>
                          <Text style={styles.listMeta} numberOfLines={1}>
                            {entry.actor} · {entry.recordType}
                          </Text>
                        </View>
                        <Text style={styles.rowDate}>
                          {formatShortDate(entry.timestamp)}
                        </Text>
                      </View>
                      {index < recentActivity.length - 1 ? (
                        <View style={styles.hairline} />
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            </View>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  page: { width: "100%", alignSelf: "center", gap: spacing.lg },
  pageTablet: { maxWidth: 860 },
  pageWide: { maxWidth: 1120 },

  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  sectionIndex: {
    color: colors.textMuted,
    fontSize: typography.caption2,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.footnote,
    fontWeight: "700",
    letterSpacing: typography.letterSpacing.tight,
  },
  sectionRule: { flex: 1, height: 1, backgroundColor: colors.borderLight },
  sectionLink: {
    color: colors.primary,
    fontSize: typography.footnote,
    fontWeight: "600",
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statCell: { flexGrow: 1, flexBasis: "46%" },
  statCellWide: { flexBasis: "22%" },

  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actionTile: {
    flexGrow: 1,
    flexBasis: "46%",
    minHeight: 68,
    backgroundColor: colors.backgroundAlt,
    borderRadius: sizes.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    gap: spacing.xs,
    justifyContent: "center",
  },
  actionTileWide: { flexBasis: "23%" },
  iconTile: {
    width: 28,
    height: 28,
    borderRadius: sizes.borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    color: colors.text,
    fontSize: typography.footnote,
    fontWeight: "600",
  },
  actionMeta: { color: colors.textMuted, fontSize: typography.caption2 },

  body: { flexDirection: "column", gap: spacing.lg },
  bodyWide: { flexDirection: "row", alignItems: "flex-start" },
  bodyCol: { flexDirection: "column", gap: spacing.lg, minWidth: 0 },
  bodyColLeft: { flex: 1.6 },
  bodyColRight: { flex: 1 },

  panel: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: sizes.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  listMain: { flex: 1, gap: spacing.xs },
  listTitle: {
    color: colors.text,
    fontSize: typography.footnote,
    fontWeight: "700",
  },
  listMeta: { color: colors.textMuted, fontSize: typography.caption2 },
  rowDate: {
    color: colors.textMuted,
    fontSize: typography.caption2,
    letterSpacing: 0.2,
  },
  actionChip: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: sizes.borderRadius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionChipText: {
    color: colors.primary,
    fontSize: typography.caption2,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  inlineNote: { paddingVertical: spacing.md, alignItems: "flex-start" },
  inlineNoteText: {
    color: colors.success,
    fontSize: typography.footnote,
    fontWeight: "600",
  },
  hairline: { height: 1, backgroundColor: colors.borderSoft },
  pressed: { opacity: 0.6, transform: [{ scale: 0.99 }] },
});
