import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import AdminHeader from '../../../components/admin/AdminHeader';
import Button from '../../../components/common/Button';
import EmptyState from '../../../components/common/EmptyState';
import ErrorState from '../../../components/common/ErrorState';
import LoadingState from '../../../components/common/LoadingState';
import StatusBadge from '../../../components/common/StatusBadge';
import colors from '../../../constants/colors';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';
import {
  cancelOrder,
  confirmOrder,
  getAdminOrderById,
} from '../../../services/admin/orderManagementService';
import type { Order, OrderStatus } from '../../../types/order';
import { formatCurrency } from '../../../utils/currency';
import { normalizeError } from '../../../utils/errorHandling';

export default function AdminOrderDetailScreen() {
  const params = useLocalSearchParams<{ orderId: string }>();
  const orderId = params.orderId;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState<OrderStatus | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const item = await getAdminOrderById(orderId);
      if (!item) {
        setError("Order not found.");
        setOrder(null);
        return;
      }
      setOrder(item);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (next: OrderStatus) => {
    if (!order) return;
    setActing(next);
    setActionError(null);
    try {
      if (next === "CONFIRMED") await confirmOrder(order.id);
      else if (next === "CANCELLED") await cancelOrder(order.id);
      await load();
    } catch (err) {
      setActionError(normalizeError(err).message);
    } finally {
      setActing(null);
    }
  };

  if (loading) return <LoadingState label="Loading order" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <AdminHeader title={order?.orderNumber ?? "Order"} subtitle="Review order details" />

      {error ? (
        <View style={styles.errorWrap}>
          <ErrorState title="Could not load order" message={error} onRetry={load} />
        </View>
      ) : !order ? (
        <EmptyState
          title="Order not found"
          message="This order may have been removed."
          actionLabel="Back to orders"
          onAction={() => router.back()}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.card}>
              <Text style={styles.customer}>{order.customerName}</Text>
              <StatusBadge label={order.status} tone={order.status === 'PENDING' ? 'warning' : order.status === 'DELIVERED' ? 'success' : 'info'} />
              <Text style={styles.meta}>Total: {formatCurrency(order.total)}</Text>
              <Text style={styles.meta}>Address: {order.address}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Products</Text>
              {order.items.map((item) => (
                <View key={item.id} style={styles.row}>
                  <Text style={styles.itemName}>{item.productName}</Text>
                  <Text style={styles.itemMeta}>{item.quantity} × {formatCurrency(item.unitPrice)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
            <Button
              title={acting === "CONFIRMED" ? "Confirming…" : "Confirm order"}
              onPress={() => runAction("CONFIRMED")}
              loading={acting === "CONFIRMED"}
              disabled={order.status === "DELIVERED" || order.status === "CANCELLED" || order.status === "RETURNED"}
              fullWidth
            />
            <Button
              title={acting === "CANCELLED" ? "Cancelling…" : "Cancel order"}
              variant="secondary"
              onPress={() => runAction("CANCELLED")}
              loading={acting === "CANCELLED"}
              disabled={order.status === "DELIVERED" || order.status === "CANCELLED" || order.status === "RETURNED"}
              fullWidth
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  errorWrap: { padding: spacing.lg },
  card: { backgroundColor: colors.backgroundAlt, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  customer: { color: colors.text, fontSize: typography.h3, fontWeight: '700', marginBottom: spacing.sm },
  meta: { color: colors.textMuted, fontSize: typography.bodySmall, marginTop: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: typography.h3, fontWeight: '700', marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  itemName: { color: colors.text, fontSize: typography.body, flex: 1 },
  itemMeta: { color: colors.textMuted, fontSize: typography.bodySmall },
  footer: {
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  actionError: { color: colors.danger, fontSize: typography.bodySmall, textAlign: "center" },
});