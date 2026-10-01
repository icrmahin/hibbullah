/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/utils/navigation';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import EmptyState from '../../../components/common/EmptyState';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import StatusBadge from '../../../components/common/StatusBadge';
import Button from '../../../components/common/Button';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useBottomInset } from '../../../hooks/useBottomInset';
import spacing from '../../../constants/spacing';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';
import { fetchReturnById, updateReturnStatus } from '../../../services/returns';
import { normalizeError } from '../../../utils/errorHandling';
import { useConfirm } from '../../../hooks/useConfirm';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { radius } from '../../../constants/sizes';

/** One level deep: fall back to the admin dashboard when there is nothing to pop. */
const onBack = () => goBack('/(admin)');

export default function AdminReturnDetailScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const params = useLocalSearchParams<{ returnId: string }>();
  const returnId = params.returnId as string;
  const [item, setItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirm, confirmDialogProps } = useConfirm();

  // FIX: load was inline per render while the effect listed only returnId —
  // react-hooks/exhaustive-deps flagged the missing load. Memoized on returnId.
  const load = useCallback(async () => {
    if (!returnId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReturnById(returnId);
      setItem(data);
    } catch (e) {
      setError(normalizeError(e).message);
    } finally {
      setLoading(false);
    }
  }, [returnId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpdate = async (status: 'APPROVED' | 'REJECTED' | 'PROCESSED') => {
    // Both of these are one-way from the customer's point of view: a rejected return closes
    // the request, and an approved one is what the customer is told to expect. Neither was
    // behind a confirmation while every other destructive action in the app was — a
    // mis-tap on a full-width button decided a refund.
    if (status === 'APPROVED') {
      const ok = await confirm({
        title: 'Approve this return?',
        message: `${item?.quantity ?? 0} × ${item?.productName ?? 'item'} will be accepted back from ${
          item?.customerName ?? 'the customer'
        }. The customer is notified straight away.`,
        confirmLabel: 'Approve',
      });
      if (!ok) return;
    }
    if (status === 'REJECTED') {
      const ok = await confirm({
        title: 'Reject this return?',
        message: `The request from ${item?.customerName ?? 'the customer'} will be declined. This is the end of the request, so it cannot be reopened from here.`,
        confirmLabel: 'Reject',
        destructive: true,
      });
      if (!ok) return;
    }
    setUpdating(status);
    setActionError(null);
    try {
      await updateReturnStatus(returnId, status);
      await load();
    } catch (e) {
      setActionError(normalizeError(e).message);
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Return" subtitle="Return request" onBack={onBack} />}>
        <LoadingState label="Loading return" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Return" subtitle="Return request" onBack={onBack} />}>
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  }

  if (!item) {
    return (
      <Screen header={<ScreenHeader title="Return" subtitle="Return request" onBack={onBack} />}>
        <EmptyState
          title="Return not found"
          message="This request may have been removed."
          actionLabel="Back to returns"
          onAction={() => goBack()}
        />
      </Screen>
    );
  }

  // The label/value fields, styled exactly as the customer detail screen styles its own.
  const details = [
    { label: 'Customer', value: item.customerName },
    { label: 'Order', value: item.orderId },
    { label: 'Product', value: `${item.productName} × ${item.quantity}` },
    { label: 'Reason', value: item.reason },
  ];

  return (
    <Screen header={<ScreenHeader title={`Return ${item.id.slice(0, 8)}`} subtitle="Return request" onBack={onBack} />}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
          {details.map((field) => (
            <View
              key={field.label}
              style={[styles.field, styles.fieldDivider, { borderBottomColor: colors.borderSoft }]}
            >
              <Text style={[styles.fieldLabel, { color: colors.text }]}>{field.label}</Text>
              <Text style={[styles.fieldValue, { color: colors.textMuted }]}>{field.value}</Text>
            </View>
          ))}
          <View style={styles.badgeRow}>
            <StatusBadge
              label={item.status}
              tone={item.status === 'APPROVED' || item.status === 'PROCESSED' ? 'success' : item.status === 'REJECTED' ? 'danger' : 'warning'}
            />
          </View>
        </View>
        {actionError ? <Text style={[styles.error, { color: colors.danger }]}>{actionError}</Text> : null}
        {item.status === 'PENDING' ? (
          <View style={styles.actions}>
            <Button title="Approve" onPress={() => handleUpdate('APPROVED')} loading={updating === 'APPROVED'} disabled={!!updating} fullWidth />
            <Button title="Reject" variant="secondary" onPress={() => handleUpdate('REJECTED')} loading={updating === 'REJECTED'} disabled={!!updating} fullWidth />
          </View>
        ) : item.status === 'APPROVED' ? (
          <Button title="Mark processed" onPress={() => handleUpdate('PROCESSED')} loading={updating === 'PROCESSED'} disabled={!!updating} fullWidth />
        ) : null}
      </ScrollView>
      <ConfirmDialog {...confirmDialogProps} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
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
  badgeRow: { marginTop: spacing.md },
  actions: { gap: spacing.md },
  error: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: 'center',
  },
});
