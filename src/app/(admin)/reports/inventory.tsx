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
import { fetchInventoryReport } from '../../../services/reports';

export default function AdminInventoryReportScreen() {
  const colors = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState({ lowStock: 0, outOfStock: 0, expiring: 0, inventoryValue: 0 });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchInventoryReport());
    } catch (e: any) {
      setError(e.message || 'Failed to load inventory report');
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
        <AdminHeader title="Inventory report" subtitle="Stock movement summary" />
        <LoadingState label="Loading inventory report" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Inventory report" subtitle="Stock movement summary" />
        <ErrorState message={error} onRetry={load} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title="Inventory report" subtitle="Stock movement summary" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Low-stock items</Text>
          <Text style={[styles.value, { color: colors.text }]}>{`${data.lowStock} products`}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Out of stock</Text>
          <Text style={[styles.value, { color: colors.text }]}>{String(data.outOfStock)}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Expiring (90 days)</Text>
          <Text style={[styles.value, { color: colors.text }]}>{String(data.expiring)}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Inventory value</Text>
          <Text style={[styles.value, { color: colors.text }]}>{formatCurrency(data.inventoryValue)}</Text>
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
