import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/utils/navigation';
import { useThemeColors } from '../../../providers/ThemeProvider';
import SoftHeader from '../../../components/common/SoftHeader';
import StatusBadge from '../../../components/common/StatusBadge';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import EmptyState from '../../../components/common/EmptyState';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import spacing from '../../../constants/spacing';
import { useOrder } from '../../../hooks/useOrders';
import { useAuth } from '../../../hooks/useAuth';
import { createReturnRequests } from '../../../services/returns';
import { formatCurrency } from '../../../utils/currency';
import { formatDateTime } from '../../../utils/date';

export default function CustomerOrderDetailScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ orderId: string }>();
  const orderId = params.orderId as string;
  const { order, loading, error, reload } = useOrder(orderId);
  const { user } = useAuth();
  const [showReturn, setShowReturn] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnSuccess, setReturnSuccess] = useState(false);
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SoftHeader title="Order" onBack={() => goBack()} />
        <LoadingState label="Loading order" />
      </SafeAreaView>
    );
  }
  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SoftHeader title="Order" onBack={() => goBack()} />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }
  if (!order) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SoftHeader title="Order" onBack={() => goBack()} />
        <EmptyState title="Order not found" message="This order may have been removed." actionLabel="Back to orders" onAction={() => goBack()} />
      </SafeAreaView>
    );
  }

  const tone = order?.status === 'DELIVERED' ? 'success' : order?.status === 'CANCELLED' ? 'danger' : order?.status === 'PENDING' ? 'warning' : 'info';

  const toggleReturnItem = (id: string) => {
    setSelectedReturnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleReturn = async () => {
    setReturnError(null);
    if (!returnReason.trim()) {
      setReturnError('Please enter a reason for the return.');
      return;
    }
    if (!user || !order) {
      setReturnError('Not signed in.');
      return;
    }
    const selected = order.items.filter((it) => selectedReturnIds.has(it.id));
    const toReturn = selected.length > 0 ? selected : order.items;
    if (toReturn.length === 0) {
      setReturnError('No items selected to return.');
      return;
    }
    setReturnSubmitting(true);
    try {
      await createReturnRequests({
        orderId: order.id,
        customerId: user.id,
        customerName: user.name || user.email || 'Customer',
        reason: returnReason.trim(),
        items: toReturn.map((it) => ({ productName: it.productName, quantity: it.quantity })),
      });
      setReturnSuccess(true);
      setShowReturn(false);
      setReturnReason("");
      setSelectedReturnIds(new Set());
    } catch (e: any) {
      setReturnError(e.message || 'Failed to request return. Only delivered orders can be returned.');
    } finally {
      setReturnSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title={order.orderNumber} onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Order summary</Text>
          <StatusBadge label={order.status} tone={tone as any} />
          <Text style={[styles.meta, { color: colors.textMuted }]}>Placed {formatDateTime(order.createdAt)}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>Delivery address: {order.address}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>Payment: Cash on Delivery</Text>
          <View style={[styles.totals, { borderTopColor: colors.borderLight }]}>
            <View style={styles.row}><Text style={[styles.label, { color: colors.textMuted }]}>Subtotal</Text><Text style={[styles.value, { color: colors.text }]}>{formatCurrency(order.subtotal)}</Text></View>
            <View style={styles.row}><Text style={[styles.label, { color: colors.textMuted }]}>Discount</Text><Text style={[styles.value, { color: colors.text }]}>-{formatCurrency(order.discount)}</Text></View>
            <View style={styles.row}><Text style={[styles.label, { color: colors.textMuted }]}>Delivery</Text><Text style={[styles.value, { color: colors.text }]}>{formatCurrency(order.deliveryFee)}</Text></View>
            <View style={[styles.row, styles.totalRow]}><Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text><Text style={[styles.totalValue, { color: colors.text }]}>{formatCurrency(order.total)}</Text></View>
          </View>
        </View>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Products</Text>
          {order.items.length === 0 ? (
            <Text style={[styles.meta, { color: colors.textMuted }]}>No items.</Text>
          ) : (
            order.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: colors.text }]}>{item.productName}</Text>
                  <Text style={[styles.itemMeta, { color: colors.textMuted }]}>{item.quantity} × {formatCurrency(item.unitPrice)} {item.discountPercent ? `· ${item.discountPercent}% off` : ''}</Text>
                </View>
                <Text style={[styles.itemTotal, { color: colors.text }]}>{formatCurrency(item.total)}</Text>
              </View>
            ))
          )}
        </View>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Timeline</Text>
          {(order.timeline || []).map((step) => (
            <View key={`${step.label}-${step.time}`} style={styles.timelineRow}>
              <Text style={[styles.timelineLabel, { color: colors.text }]}>{step.label}</Text>
              <Text style={[styles.timelineTime, { color: colors.textMuted }]}>{formatDateTime(step.time)}</Text>
              {step.note ? <Text style={[styles.timelineNote, { color: colors.textMuted }]}>{step.note}</Text> : null}
            </View>
          ))}
          {(!order.timeline || order.timeline.length === 0) ? <Text style={[styles.meta, { color: colors.textMuted }]}>No timeline events yet.</Text> : null}
        </View>
        {order.status === 'DELIVERED' ? (
          <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Return</Text>
            {returnSuccess ? (
              <Text style={[styles.meta, { color: colors.success }]}>Return requested for {order.items.length > 1 ? `${order.items.filter((it) => selectedReturnIds.size === 0 || selectedReturnIds.has(it.id)).length} item(s)` : 'item'}. Admin will review.</Text>
            ) : showReturn ? (
              <View style={{ gap: spacing.md }}>
                <Text style={[styles.meta, { color: colors.textMuted }]}>Select items to return (defaults to all)</Text>
                {order.items.map((it) => {
                  const selected = selectedReturnIds.size === 0 ? true : selectedReturnIds.has(it.id);
                  return (
                    <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: selected ? colors.primary : colors.borderLight, backgroundColor: selected ? colors.primarySoft : colors.backgroundAlt, borderRadius: 12, padding: spacing.sm }}>
                      <Text style={[styles.itemName, { color: colors.text, flex: 1 }]}>{it.productName} — {it.quantity} pcs</Text>
                      <Button title={selected ? 'Selected' : 'Select'} variant={selected ? 'primary' : 'secondary'} onPress={() => toggleReturnItem(it.id)} />
                    </View>
                  );
                })}
                <Input label="Reason" value={returnReason} onChangeText={setReturnReason} placeholder="e.g. Damaged, wrong item" multiline />
                {returnError ? <Text style={[styles.meta, { color: colors.danger }]}>{returnError}</Text> : null}
                <Button title={returnSubmitting ? "Submitting..." : `Submit return (${selectedReturnIds.size === 0 ? order.items.length : selectedReturnIds.size})`} onPress={handleReturn} loading={returnSubmitting} disabled={returnSubmitting} fullWidth />
                <Button title="Cancel" variant="secondary" onPress={() => setShowReturn(false)} fullWidth />
              </View>
            ) : (
              <View style={{ gap: spacing.md }}>
                {returnError ? <Text style={[styles.meta, { color: colors.danger }]}>{returnError}</Text> : null}
                <Button title="Request return" variant="secondary" onPress={() => setShowReturn(true)} fullWidth />
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  card: { borderRadius: 16, borderWidth: 1, padding: spacing.lg },
  title: { fontSize: 20, fontWeight: '700', marginBottom: spacing.md },
  meta: { fontSize: 12, marginTop: spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, gap: spacing.md },
  itemName: { flex: 1, fontWeight: '600' },
  itemMeta: { fontSize: 12 },
  itemTotal: { fontWeight: '700' },
  timelineRow: { marginBottom: spacing.md },
  timelineLabel: { fontWeight: '700', fontSize: 12 },
  timelineTime: { fontSize: 12 },
  timelineNote: { fontSize: 12, marginTop: spacing.xs },
  totals: { marginTop: spacing.md, borderTopWidth: 1, paddingTop: spacing.md, gap: spacing.xs },
  label: { fontSize: 12 },
  value: { fontSize: 12, fontWeight: '600' },
  totalRow: { marginTop: spacing.sm, borderTopWidth: 1, paddingTop: spacing.sm, borderTopColor: '#eee' },
  totalLabel: { fontWeight: '700' },
  totalValue: { fontWeight: '800', fontSize: 14 },
});
