/* eslint-disable react-hooks/set-state-in-effect -- data fetching and derived state sync require setState inside effects */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/utils/navigation';
import AdminHeader from '../../../components/admin/AdminHeader';
import Button from '../../../components/common/Button';
import EmptyState from '../../../components/common/EmptyState';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import StatusBadge from '../../../components/common/StatusBadge';
import { useThemeColors } from '../../../providers/ThemeProvider';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';
import { fetchAdminOrderById, updateOrderStatus } from '../../../services/admin';
import type { Order, OrderStatus } from '../../../types/order';
import { formatCurrency } from '../../../utils/currency';
import { formatDateTime } from '../../../utils/date';
import { normalizeError } from '../../../utils/errorHandling';

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

function toneForStatus(status: OrderStatus): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'DELIVERED') return 'success';
  if (status === 'CANCELLED' || status === 'RETURNED') return 'danger';
  if (status === 'PENDING') return 'warning';
  return 'info';
}

export default function AdminOrderDetailScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ orderId: string }>();
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  // FIX: load was created inline each render while the effect only listed orderId —
  // react-hooks/exhaustive-deps flagged the missing load. Memoized on orderId.
  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminOrderById(orderId);
      setOrder(data);
    } catch (e) {
      setError(normalizeError(e).message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTransition = async (next: OrderStatus) => {
    if (!order) return;
    setUpdating(next);
    setActionError(null);
    try {
      await updateOrderStatus(order.id, next);
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
        <AdminHeader title="Order" subtitle="Review order details" />
        <LoadingState label="Loading order" />
      </SafeAreaView>
    );
  }
  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Order" subtitle="Review order details" />
        <ErrorState message={error} onRetry={load} />
      </SafeAreaView>
    );
  }
  if (!order) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Order" subtitle="Review order details" />
        <EmptyState title="Order not found" message="This order may have been removed." actionLabel="Back to orders" onAction={() => goBack()} />
      </SafeAreaView>
    );
  }

  const nextStatuses = TRANSITIONS[order.status] || [];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title={order.orderNumber} subtitle="Review order details" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Text style={[styles.customer, { color: colors.text }]}>{order.customerName}</Text>
          <StatusBadge label={order.status} tone={toneForStatus(order.status)} />
          <Text style={[styles.meta, { color: colors.textMuted }]}>Placed: {formatDateTime(order.createdAt)}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>Total: {formatCurrency(order.total)} · Subtotal {formatCurrency(order.subtotal)} · Delivery {formatCurrency(order.deliveryFee)}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>Address: {order.address}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>Payment: {order.paymentMethod}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Products</Text>
          {order.items.length === 0 ? (
            <Text style={[styles.meta, { color: colors.textMuted }]}>No items.</Text>
          ) : (
            order.items.map((item) => (
              <View key={item.id} style={styles.row}>
                <Text style={[styles.itemName, { color: colors.text }]}>{item.productName}</Text>
                <Text style={[styles.itemMeta, { color: colors.textMuted }]}>{item.quantity} × {formatCurrency(item.unitPrice)} · {formatCurrency(item.total)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Timeline</Text>
          {(order.timeline || []).map((step) => (
            <View key={`${step.label}-${step.time}`} style={{ marginBottom: spacing.sm }}>
              <Text style={[styles.itemName, { color: colors.text }]}>{step.label}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>{formatDateTime(step.time)} {step.note ? `· ${step.note}` : ''}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.borderLight, backgroundColor: colors.background }]}>
        {actionError ? <Text style={[styles.actionError, { color: colors.danger }]}>{actionError}</Text> : null}
        {nextStatuses.length === 0 ? (
          <Text style={[styles.meta, { color: colors.textMuted, textAlign: 'center' }]}>No further transitions for {order.status}</Text>
        ) : (
          nextStatuses.map((next) => (
            <Button
              key={next}
              title={next === 'CANCELLED' ? 'Cancel order' : next === 'CONFIRMED' ? 'Confirm order' : next === 'PROCESSING' ? 'Mark processing' : next === 'OUT_FOR_DELIVERY' ? 'Out for delivery' : next === 'DELIVERED' ? 'Mark delivered' : next}
              variant={next === 'CANCELLED' ? 'secondary' : 'primary'}
              onPress={() => handleTransition(next)}
              loading={updating === next}
              disabled={!!updating}
              fullWidth
            />
          ))
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  card: { borderRadius: 16, borderWidth: 1, padding: spacing.lg },
  customer: { fontSize: typography.h3, fontWeight: '700', marginBottom: spacing.sm },
  meta: { fontSize: typography.bodySmall, marginTop: spacing.sm },
  sectionTitle: { fontSize: typography.h3, fontWeight: '700', marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm, gap: spacing.sm },
  itemName: { fontSize: typography.body, flex: 1 },
  itemMeta: { fontSize: typography.bodySmall },
  footer: { padding: spacing.lg, gap: spacing.md, borderTopWidth: 1 },
  actionError: { fontSize: typography.bodySmall, textAlign: 'center' },
});
