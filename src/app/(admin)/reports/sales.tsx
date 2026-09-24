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
import { fetchSalesReport } from '../../../services/reports';

export default function AdminSalesReportScreen() {
  const colors = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState({ revenue: 0, deliveredOrders: 0, discounts: 0 });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSalesReport());
    } catch (e: any) {
      setError(e.message || 'Failed to load sales report');
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
        <AdminHeader title="Sales report" subtitle="Revenue overview" />
        <LoadingState label="Loading sales report" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Sales report" subtitle="Revenue overview" />
        <ErrorState message={error} onRetry={load} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title="Sales report" subtitle="Revenue overview" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Revenue</Text>
          <Text style={[styles.value, { color: colors.text }]}>{formatCurrency(data.revenue)}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Delivered orders</Text>
          <Text style={[styles.value, { color: colors.text }]}>{String(data.deliveredOrders)}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Discounts given</Text>
          <Text style={[styles.value, { color: colors.text }]}>{formatCurrency(data.discounts)}</Text>
        </View>
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
