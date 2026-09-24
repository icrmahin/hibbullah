/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AdminHeader from '../../../components/admin/AdminHeader';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import { useThemeColors } from '../../../providers/ThemeProvider';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';
import { formatCurrency } from '../../../utils/currency';
import { fetchSalesReport, fetchInventoryReport } from '../../../services/reports';

export default function AdminReportsScreen() {
  const colors = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState({ revenue: 0, deliveredOrders: 0, discounts: 0 });
  const [inventory, setInventory] = useState({ lowStock: 0, outOfStock: 0, expiring: 0, inventoryValue: 0 });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, inv] = await Promise.all([fetchSalesReport(), fetchInventoryReport()]);
      setSales(s);
      setInventory(inv);
    } catch (e: any) {
      setError(e.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Reports" subtitle="High-level performance" />
        <LoadingState label="Loading reports" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Reports" subtitle="High-level performance" />
        <ErrorState message={error} onRetry={load} />
      </SafeAreaView>
    );
  }

  const reports = [
    { label: "Revenue", value: formatCurrency(sales.revenue) },
    { label: "Delivered orders", value: String(sales.deliveredOrders) },
    { label: "Discounts given", value: formatCurrency(sales.discounts) },
    { label: "Low stock", value: String(inventory.lowStock) },
    { label: "Out of stock", value: String(inventory.outOfStock) },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title="Reports" subtitle="High-level performance" />
      <ScrollView contentContainerStyle={styles.container}>
        {reports.map((r) => (
          <View
            key={r.label}
            style={[
              styles.card,
              {
                backgroundColor: colors.backgroundAlt,
                borderColor: colors.borderLight,
              },
            ]}
          >
            <Text style={[styles.label, { color: colors.textMuted }]}>{r.label}</Text>
            <Text style={[styles.value, { color: colors.text }]}>{r.value}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.lg,
  },
  label: { fontSize: typography.bodySmall },
  value: { fontWeight: '700', marginTop: spacing.xs, fontSize: typography.h2 },
});
