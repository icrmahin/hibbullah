/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/utils/navigation';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import ResponsiveContainer from '../../../components/common/ResponsiveContainer';
import EmptyState from '../../../components/common/EmptyState';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import Button from '../../../components/common/Button';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { useConfirm } from '../../../hooks/useConfirm';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useBottomInset } from '../../../hooks/useBottomInset';
import spacing from '../../../constants/spacing';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';
import { formatCurrency } from '../../../utils/currency';
import { fetchCustomerById, setCustomerBlocked, type CustomerRecord } from '../../../services/customers';
import { radius } from '../../../constants/sizes';

/** One level deep: fall back to the admin dashboard when there is nothing to pop. */
const onBack = () => goBack('/(admin)');

export default function AdminCustomerDetailScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const params = useLocalSearchParams<{ customerId: string }>();
  const customerId = params.customerId as string;
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const { confirm, confirmDialogProps } = useConfirm();

  // FIX: load was a fresh function per render but the effect only depended on customerId,
  // tripping react-hooks/exhaustive-deps. Memoized it so the dependency list is correct.
  const load = useCallback(async () => {
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
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Customer" subtitle="Customer overview" onBack={onBack} />}>
        <LoadingState label="Loading customer" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Customer" subtitle="Customer overview" onBack={onBack} />}>
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  }

  if (!customer) {
    return (
      <Screen header={<ScreenHeader title="Customer" subtitle="Customer overview" onBack={onBack} />}>
        <EmptyState
          title="Customer not found"
          message="This account may have been removed."
          actionLabel="Back to customers"
          onAction={() => goBack()}
        />
      </Screen>
    );
  }

  // The label/value fields, styled exactly as the return detail screen styles its own.
  const details = [
    { label: 'Name', value: customer.name },
    { label: 'Email', value: customer.email || '—' },
    { label: 'Phone', value: customer.phone || '—' },
    { label: 'Status', value: customer.isBlocked ? 'Blocked' : 'Active', danger: customer.isBlocked },
    { label: 'Orders', value: String(customer.orderCount) },
    { label: 'Total spending', value: formatCurrency(customer.totalSpent) },
  ];

  const handleToggleBlock = async () => {
    if (!customer || toggling) return;
    const blocking = !customer.isBlocked;
    const ok = await confirm({
      title: blocking ? 'Block this account?' : 'Unblock this account?',
      message: blocking
        ? `${customer.name} will be signed out and refused at login. Their orders stay intact.`
        : `${customer.name} will be able to sign in and use the app again.`,
      confirmLabel: blocking ? 'Block' : 'Unblock',
      cancelLabel: 'Cancel',
      destructive: blocking,
    });
    if (!ok) return;
    setToggling(true);
    try {
      await setCustomerBlocked(customer.id, blocking);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to update account status');
    } finally {
      setToggling(false);
    }
  };

  return (
    <Screen header={<ScreenHeader title={customer?.name ?? "Customer"} subtitle="Customer overview" onBack={onBack} />}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        <ResponsiveContainer sidebarAware maxWidth={960}>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
          {details.map((field, index) => (
            <View
              key={field.label}
              style={[
                styles.field,
                index < details.length - 1 && styles.fieldDivider,
                index < details.length - 1 && { borderBottomColor: colors.borderSoft },
              ]}
            >
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{field.label}</Text>
              <Text style={[styles.fieldValue, { color: 'danger' in field && field.danger ? colors.danger : colors.textMuted }]}>{field.value}</Text>
            </View>
          ))}
        </View>
        <Button
          title={customer.isBlocked ? 'Unblock account' : 'Block account'}
          variant={customer.isBlocked ? 'secondary' : 'danger'}
          onPress={handleToggleBlock}
          loading={toggling}
          disabled={toggling}
          fullWidth
        />
        <ConfirmDialog {...confirmDialogProps} />
        </ResponsiveContainer>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.lg, gap: spacing.lg },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  field: { paddingVertical: spacing.sm, gap: spacing.xxs },
  fieldDivider: { borderBottomWidth: 1 },
  fieldLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
  },
  fieldValue: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
});
