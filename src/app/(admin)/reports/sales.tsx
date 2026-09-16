import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AdminHeader from '../../../components/admin/AdminHeader';
import ErrorState from '../../../components/common/ErrorState';
import LoadingState from '../../../components/common/LoadingState';
import colors from '../../../constants/colors';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';
import { getSalesReport } from '../../../services/admin/reportService';
import { formatCurrency } from '../../../utils/currency';
import { normalizeError } from '../../../utils/errorHandling';

export default function AdminSalesReportScreen() {
  const [revenue, setRevenue] = useState<number | null>(null);
  const [orders, setOrders] = useState<number | null>(null);
  const [discounts, setDiscounts] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const report = await getSalesReport();
      setRevenue(report.totalRevenue);
      setOrders(report.deliveredCount);
      setDiscounts(report.discounts);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState label="Loading sales report" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <AdminHeader title="Sales report" subtitle="Revenue overview" />
      <ScrollView contentContainerStyle={styles.container}>
        {error ? (
          <ErrorState title="Could not load sales report" message={error} onRetry={load} />
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Revenue</Text>
              <Text style={styles.value}>{revenue !== null ? formatCurrency(revenue) : "—"}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Delivered orders</Text>
              <Text style={styles.value}>{orders !== null ? String(orders) : "—"}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Discounts given</Text>
              <Text style={styles.value}>{discounts !== null ? formatCurrency(discounts) : "—"}</Text>
            </View>
          </>
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