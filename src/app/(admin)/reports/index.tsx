import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AdminHeader from '../../../components/admin/AdminHeader';
import ErrorState from '../../../components/common/ErrorState';
import LoadingState from '../../../components/common/LoadingState';
import colors from '../../../constants/colors';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';
import { getInventoryReport, getSalesReport } from '../../../services/admin/reportService';
import { formatCurrency } from '../../../utils/currency';
import { normalizeError } from '../../../utils/errorHandling';

type ReportState = {
  revenue: number;
  ordersToday: number;
  avgOrderValue: number;
  lowStock: number;
  outOfStock: number;
};

export default function AdminReportsScreen() {
  const [report, setReport] = useState<ReportState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sales, inventory] = await Promise.all([getSalesReport(), getInventoryReport()]);
      const ordersCount = sales.deliveredCount;
      setReport({
        revenue: sales.totalRevenue,
        ordersToday: ordersCount,
        avgOrderValue: ordersCount > 0 ? Math.round(sales.totalRevenue / ordersCount) : 0,
        lowStock: inventory.lowStock,
        outOfStock: inventory.outOfStock,
      });
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState label="Loading reports" />;

  const reports = [
    { label: "Revenue", value: report ? formatCurrency(report.revenue) : "—" },
    { label: "Delivered orders", value: report ? String(report.ordersToday) : "—" },
    { label: "Avg order value", value: report ? formatCurrency(report.avgOrderValue) : "—" },
    { label: "Low stock", value: report ? String(report.lowStock) : "—" },
    { label: "Out of stock", value: report ? String(report.outOfStock) : "—" },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <AdminHeader title="Reports" subtitle="High-level performance" />
      <ScrollView contentContainerStyle={styles.container}>
        {error ? (
          <ErrorState title="Could not load reports" message={error} onRetry={load} />
        ) : (
          reports.map((report) => (
            <View key={report.label} style={styles.card}>
              <Text style={styles.label}>{report.label}</Text>
              <Text style={styles.value}>{report.value}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  label: { color: colors.textMuted, fontSize: typography.bodySmall },
  value: { color: colors.text, fontWeight: '700', marginTop: spacing.xs, fontSize: typography.h2 },
});