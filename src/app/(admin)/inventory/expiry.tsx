import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AdminHeader from '../../../components/admin/AdminHeader';
import EmptyState from '../../../components/common/EmptyState';
import ErrorState from '../../../components/common/ErrorState';
import LoadingState from '../../../components/common/LoadingState';
import colors from '../../../constants/colors';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';
import { getExpiringBatches } from '../../../services/admin/batchService';
import type { InventoryItem } from '../../../types/inventory';
import { formatDate } from '../../../utils/date';
import { normalizeError } from '../../../utils/errorHandling';

export default function ExpiryManagementScreen() {
  const [batches, setBatches] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBatches(await getExpiringBatches(90));
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState label="Checking expiring batches" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <AdminHeader title="Expiry" subtitle="Monitor expiring batches" />
      <ScrollView contentContainerStyle={styles.container}>
        {error ? (
          <ErrorState title="Could not load expiring batches" message={error} onRetry={load} />
        ) : batches.length === 0 ? (
          <EmptyState title="Nothing expiring" message="No batches expire within the next 90 days." />
        ) : (
          batches.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.heading}>{item.productName}</Text>
              <Text style={styles.meta}>Batch: {item.batchNumber}</Text>
              <Text style={styles.meta}>Expiry: {formatDate(item.expiryDate ?? "")}</Text>
              <Text style={styles.meta}>Qty: {item.quantity}</Text>
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
  heading: { color: colors.text, fontWeight: '700' },
  meta: { color: colors.textMuted, marginTop: spacing.xs },
});