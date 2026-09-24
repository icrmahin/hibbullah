/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/utils/navigation';
import AdminHeader from '../../../components/admin/AdminHeader';
import EmptyState from '../../../components/common/EmptyState';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import { useThemeColors } from '../../../providers/ThemeProvider';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';
import { formatCurrency } from '../../../utils/currency';
import { fetchCustomerById, type CustomerRecord } from '../../../services/customers';

export default function AdminCustomerDetailScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ customerId: string }>();
  const customerId = params.customerId as string;
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCustomerById(customerId);
      setCustomer(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [customerId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Customer" subtitle="Customer overview" />
        <LoadingState label="Loading customer" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Customer" subtitle="Customer overview" />
        <ErrorState message={error} onRetry={load} />
      </SafeAreaView>
    );
  }

  if (!customer) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Customer" subtitle="Customer overview" />
        <EmptyState
          title="Customer not found"
          message="This account may have been removed."
          actionLabel="Back to customers"
          onAction={() => goBack()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title={customer?.name ?? "Customer"} subtitle="Customer overview" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Text style={[styles.label, { color: colors.text }]}>Name</Text>
          <Text style={[styles.value, { color: colors.textMuted }]}>{customer.name}</Text>
          <Text style={[styles.label, { color: colors.text }]}>Email</Text>
          <Text style={[styles.value, { color: colors.textMuted }]}>{customer.email || '—'}</Text>
          <Text style={[styles.label, { color: colors.text }]}>Phone</Text>
          <Text style={[styles.value, { color: colors.textMuted }]}>{customer.phone || '—'}</Text>
          <Text style={[styles.label, { color: colors.text }]}>Orders</Text>
          <Text style={[styles.value, { color: colors.textMuted }]}>{customer.orderCount}</Text>
          <Text style={[styles.label, { color: colors.text }]}>Total spending</Text>
          <Text style={[styles.value, { color: colors.textMuted }]}>{formatCurrency(customer.totalSpent)}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.lg,
  },
  label: { fontSize: typography.bodySmall, fontWeight: '700', marginTop: spacing.md },
  value: { fontSize: typography.body, marginTop: spacing.xs },
});
