import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useAdminInventory } from "../../../hooks/useAdmin";
import { useBottomInset } from "../../../hooks/useBottomInset";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import EmptyState from "../../../components/common/EmptyState";
import InventoryStatus from "../../../components/admin/InventoryStatus";
import spacing from "../../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../../constants/typography";
import { radius } from "../../../constants/sizes";

export default function AdminInventoryScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const { data, loading, error, reload } = useAdminInventory();
  const items = (data || []).map((row: any) => ({
    id: row.id,
    productId: row.product_id ?? row.productId,
    productName: row.products?.name ?? row.productName ?? 'Unknown',
    batchNumber: row.batch_number ?? row.batchNumber,
    quantity: row.quantity,
    status: row.status,
    expiryDate: row.expiry_date ?? row.expiryDate,
  }));

  // The compact header pill every admin screen shares — not a full-height Button, which
  // sat proud of the 44px header row.
  const headerAction = (
    <Pressable
      onPress={() => router.push("/(admin)/inventory/adjustment")}
      style={({ pressed }) => [
        styles.headerAction,
        { backgroundColor: colors.primarySoft },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Adjust stock"
    >
      <Text style={[styles.headerActionText, { color: colors.accent }]}>Adjust</Text>
    </Pressable>
  );

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Inventory" subtitle="Stock overview" />}>
        <LoadingState label="Loading inventory" />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen header={<ScreenHeader title="Inventory" subtitle="Stock overview" />}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  return (
    <Screen header={<ScreenHeader title="Inventory" subtitle="Stock overview" action={headerAction} />}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        {items.length === 0 ? (
          <EmptyState title="No inventory" message="No stock batches found." />
        ) : (
          items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.productName}`}
              disabled={!item.productId}
              onPress={() => {
                if (!item.productId) return;
                router.push({
                  pathname: "/(admin)/products/[productId]",
                  params: { productId: String(item.productId) },
                });
              }}
              style={[styles.row, { backgroundColor: colors.backgroundAlt }]}
            >
              <View style={styles.rowMain}>
                <Text style={[styles.name, { color: colors.text }]}>{item.productName}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>{item.batchNumber} {item.expiryDate ? `· Exp ${item.expiryDate}` : ''}{item.productId ? ' · tap to manage' : ''}</Text>
              </View>
              <View style={styles.rowStats}>
                <Text style={[styles.qty, { color: colors.accent }]}>{item.quantity}</Text>
                <InventoryStatus status={item.status} />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerAction: {
    height: 34,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  headerActionText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  pressed: { opacity: 0.7 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowMain: { flex: 1, gap: spacing.xxs },
  rowStats: { alignItems: 'flex-end', gap: spacing.xs },
  name: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  meta: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  qty: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
});
