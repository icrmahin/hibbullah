import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminHeader from "../../../components/admin/AdminHeader";
import Button from "../../../components/common/Button";
import { useThemeColors } from "../../../providers/ThemeProvider";
import { useAdminInventory } from "../../../hooks/useAdmin";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import EmptyState from "../../../components/common/EmptyState";
import InventoryStatus from "../../../components/admin/InventoryStatus";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";

export default function AdminInventoryScreen() {
  const colors = useThemeColors();
  const { data, loading, error, reload } = useAdminInventory();
  const items = (data || []).map((row: any) => ({
    id: row.id,
    productName: row.products?.name ?? row.productName ?? 'Unknown',
    batchNumber: row.batch_number ?? row.batchNumber,
    quantity: row.quantity,
    status: row.status,
    expiryDate: row.expiry_date ?? row.expiryDate,
  }));

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Inventory" subtitle="Stock overview" />
        <LoadingState label="Loading inventory" />
      </SafeAreaView>
    );
  }
  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Inventory" subtitle="Stock overview" />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader
        title="Inventory"
        subtitle="Stock overview"
        action={
          <Button
            title="Adjust"
            onPress={() => router.push("/(admin)/inventory/adjustment")}
          />
        }
      />
      <ScrollView contentContainerStyle={styles.container}>
        {items.length === 0 ? (
          <EmptyState title="No inventory" message="No stock batches found." />
        ) : (
          items.map((item) => (
            <View
              key={item.id}
              style={[
                styles.row,
                {
                  backgroundColor: colors.backgroundAlt,
                  borderColor: colors.borderLight,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{item.productName}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>{item.batchNumber} {item.expiryDate ? `· Exp ${item.expiryDate}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[styles.qty, { color: colors.primary }]}>{item.quantity}</Text>
                <InventoryStatus status={item.status} />
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
  },
  name: { fontWeight: "700" },
  meta: { fontSize: typography.caption },
  qty: { fontWeight: "700" },
});
