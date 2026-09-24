import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AdminHeader from '../../../components/admin/AdminHeader';
import EmptyState from '../../../components/common/EmptyState';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useAdminInventory } from '../../../hooks/useAdmin';
import spacing from '../../../constants/spacing';
import { formatDate } from '../../../utils/date';

export default function ExpiryManagementScreen() {
  const colors = useThemeColors();
  const { data, loading, error, reload } = useAdminInventory();

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Expiry" subtitle="Monitor expiring batches" />
        <LoadingState label="Loading expiry" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Expiry" subtitle="Monitor expiring batches" />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  const now = new Date();
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const batches = (data || [])
    .map((row: any) => ({
      id: row.id,
      productName: row.products?.name ?? 'Unknown',
      batchNumber: row.batch_number,
      quantity: row.quantity,
      expiryDate: row.expiry_date,
    }))
    .filter((b) => b.expiryDate && new Date(b.expiryDate) <= in90)
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title="Expiry" subtitle="Monitor expiring batches" />
      <ScrollView contentContainerStyle={styles.container}>
        {batches.length === 0 ? (
          <EmptyState title="Nothing expiring" message="No batches expire within the next 90 days." />
        ) : (
          batches.map((item) => (
            <View
              key={item.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.backgroundAlt,
                  borderColor: colors.borderLight,
                },
              ]}
            >
              <Text style={[styles.heading, { color: colors.text }]}>{item.productName}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>Batch: {item.batchNumber}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>Expiry: {formatDate(item.expiryDate ?? "")}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>Qty: {item.quantity}</Text>
            </View>
          ))
        )}
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
  heading: { fontWeight: '700' },
  meta: { marginTop: spacing.xs },
});
