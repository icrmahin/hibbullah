import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import AdminHeader from '../../../components/admin/AdminHeader';
import EmptyState from '../../../components/common/EmptyState';
import ErrorState from '../../../components/common/ErrorState';
import LoadingState from '../../../components/common/LoadingState';
import colors from '../../../constants/colors';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';
import { getCustomerById } from '../../../services/admin/customerService';
import type { CustomerRecord } from '../../../services/mockData';
import { formatCurrency } from '../../../utils/currency';
import { normalizeError } from '../../../utils/errorHandling';

export default function AdminCustomerDetailScreen() {
  const params = useLocalSearchParams<{ customerId: string }>();
  const customerId = params.customerId;

  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const item = await getCustomerById(customerId);
      if (!item) {
        setError("Customer not found.");
        setCustomer(null);
        return;
      }
      setCustomer(item);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState label="Loading customer" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <AdminHeader title={customer?.name ?? "Customer"} subtitle="Customer overview" />

      {error ? (
        <View style={styles.errorWrap}>
          <ErrorState title="Could not load customer" message={error} onRetry={load} />
        </View>
      ) : !customer ? (
        <EmptyState
          title="Customer not found"
          message="This account may have been removed."
          actionLabel="Back to customers"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.card}>
            <Text style={styles.label}>Phone</Text>
            <Text style={styles.value}>{customer.phone}</Text>
            <Text style={styles.label}>Orders</Text>
            <Text style={styles.value}>{customer.orderCount}</Text>
            <Text style={styles.label}>Total spending</Text>
            <Text style={styles.value}>{formatCurrency(customer.totalSpent)}</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  errorWrap: { padding: spacing.lg },
  card: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  label: { color: colors.text, fontSize: typography.bodySmall, fontWeight: '700', marginTop: spacing.md },
  value: { color: colors.textMuted, fontSize: typography.body, marginTop: spacing.xs },
});