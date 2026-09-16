import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AdminHeader from '../../../components/admin/AdminHeader';
import ErrorState from '../../../components/common/ErrorState';
import LoadingState from '../../../components/common/LoadingState';
import colors from '../../../constants/colors';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';
import { getInventoryReport } from '../../../services/admin/reportService';
import { formatCurrency } from '../../../utils/currency';
import { normalizeError } from '../../../utils/errorHandling';

export default function AdminInventoryReportScreen() {
  const [lowStock, setLowStock] = useState<number | null>(null);
  const [outOfStock, setOutOfStock] = useState<number | null>(null);
  const [expired, setExpired] = useState<number | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const report = await getInventoryReport();
      setLowStock(report.lowStock);
      setOutOfStock(report.outOfStock);
      setExpired(report.expired);
      setValue(report.inventoryValue);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState label="Loading inventory report" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <AdminHeader title="Inventory report" subtitle="Stock movement summary" />
      <ScrollView contentContainerStyle={styles.container}>
        {error ? (
          <ErrorState title="Could not load inventory report" message={error} onRetry={load} />
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Low-stock items</Text>
              <Text style={styles.value}>{lowStock !== null ? `${lowStock} products` : "—"}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Out of stock</Text>
              <Text style={styles.value}>{outOfStock !== null ? String(outOfStock) : "—"}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Expired batches</Text>
              <Text style={styles.value}>{expired !== null ? String(expired) : "—"}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Inventory value</Text>
              <Text style={styles.value}>{value !== null ? formatCurrency(value) : "—"}</Text>
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