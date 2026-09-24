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
import StatusBadge from '../../../components/common/StatusBadge';
import Button from '../../../components/common/Button';
import { useThemeColors } from '../../../providers/ThemeProvider';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';
import { fetchReturnById, updateReturnStatus } from '../../../services/returns';
import { normalizeError } from '../../../utils/errorHandling';

export default function AdminReturnDetailScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ returnId: string }>();
  const returnId = params.returnId as string;
  const [item, setItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async () => {
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
  };

  useEffect(() => {
    load();
  }, [returnId]);

  const handleUpdate = async (status: 'APPROVED' | 'REJECTED' | 'PROCESSED') => {
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
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Return" subtitle="Return request" />
        <LoadingState label="Loading return" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Return" subtitle="Return request" />
        <ErrorState message={error} onRetry={load} />
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Return" subtitle="Return request" />
        <EmptyState
          title="Return not found"
          message="This request may have been removed."
          actionLabel="Back to returns"
          onAction={() => goBack()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title={`Return ${item.id.slice(0, 8)}`} subtitle="Return request" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Text style={[styles.label, { color: colors.text }]}>Customer</Text>
          <Text style={[styles.value, { color: colors.textMuted }]}>{item.customerName}</Text>
          <Text style={[styles.label, { color: colors.text }]}>Order</Text>
          <Text style={[styles.value, { color: colors.textMuted }]}>{item.orderId}</Text>
          <Text style={[styles.label, { color: colors.text }]}>Product</Text>
          <Text style={[styles.value, { color: colors.textMuted }]}>{item.productName} × {item.quantity}</Text>
          <Text style={[styles.label, { color: colors.text }]}>Reason</Text>
          <Text style={[styles.value, { color: colors.textMuted }]}>{item.reason}</Text>
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
  badgeRow: { marginTop: spacing.md },
  actions: { gap: spacing.md },
  error: { fontSize: 12, textAlign: 'center' },
});
