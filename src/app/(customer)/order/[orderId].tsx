import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/utils/navigation';
import { useThemeColors } from '../../../providers/ThemeProvider';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import StatusBadge from '../../../components/common/StatusBadge';
import CartSummary from '../../../components/cart/CartSummary';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import EmptyState from '../../../components/common/EmptyState';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import spacing from '../../../constants/spacing';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';
import { radius } from '../../../constants/sizes';
import { useOrder } from '../../../hooks/useOrders';
import { useAuth } from '../../../hooks/useAuth';
import { useBottomInset } from '../../../hooks/useBottomInset';
import { createReturnRequests } from '../../../services/returns';
import { formatCurrency } from '../../../utils/currency';
import { formatDateTime } from '../../../utils/date';
import { statusTone } from '../../../utils/statusTone';

export default function CustomerOrderDetailScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
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
      <Screen header={<ScreenHeader title="Order" onBack={() => goBack()} />}>
        <LoadingState label="Loading order" />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen header={<ScreenHeader title="Order" onBack={() => goBack()} />}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }
  if (!order) {
    return (
      <Screen header={<ScreenHeader title="Order" onBack={() => goBack()} />}>
        <EmptyState title="Order not found" message="This order may have been removed." actionLabel="Back to orders" onAction={() => goBack()} />
      </Screen>
    );
  }

  const tone = statusTone(order?.status ?? '');

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
        // `it.id` is the order line, and naming it is what lets the shop put the units back
        // on approval. Sending only the product name left the database with a string to
        // match on and nowhere to restock from.
        items: toReturn.map((it) => ({ productName: it.productName, quantity: it.quantity, orderItemId: it.id, productId: it.productId })),
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
    <Screen header={<ScreenHeader title={order.orderNumber} onBack={() => goBack()} />}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        {/* One card level: the card carries the surface, the hairline inside it separates. */}
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
          <Text style={[styles.title, { color: colors.text }]}>Order summary</Text>
          <StatusBadge label={order.status} tone={tone} />
          <Text style={[styles.meta, { color: colors.textMuted }]}>Placed {formatDateTime(order.createdAt)}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>Delivery address: {order.address}</Text>
          {order.customerNote ? (
            <Text style={[styles.meta, { color: colors.textMuted }]}>Note: {order.customerNote}</Text>
          ) : null}
          <Text style={[styles.meta, { color: colors.textMuted }]}>Payment: Cash on Delivery</Text>
        </View>
        {/* The four money rows are the shared CartSummary — same arithmetic language as
            cart and checkout. A record, not a second copy of the rows. */}
        <CartSummary
          summary={{
            subtotal: order.subtotal,
            discount: order.discount,
            deliveryFee: order.deliveryFee,
            total: order.total,
          }}
        />
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
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
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
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
          <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Return</Text>
            {returnSuccess ? (
              <Text style={[styles.meta, { color: colors.success }]}>Return requested for {order.items.length > 1 ? `${order.items.filter((it) => selectedReturnIds.size === 0 || selectedReturnIds.has(it.id)).length} item(s)` : 'item'}. Admin will review.</Text>
            ) : showReturn ? (
              <View style={{ gap: spacing.md }}>
                <Text style={[styles.meta, { color: colors.textMuted }]}>Select items to return (defaults to all)</Text>
                {order.items.map((it) => {
                  const selected = selectedReturnIds.size === 0 ? true : selectedReturnIds.has(it.id);
                  return (
                    <View key={it.id} style={[styles.returnItem, { borderColor: selected ? colors.accent : colors.borderLight, backgroundColor: selected ? colors.primarySoft : colors.backgroundAlt }]}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  // The card rule: white surface on the off-white page — the lightness step is the
  // separation, so there is no border around a card and no shadow under it.
  card: { borderRadius: radius.lg, padding: spacing.lg },
  title: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: -0.2,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: -0.2,
    marginBottom: spacing.md,
  },
  meta: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: spacing.sm,
  },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, gap: spacing.md },
  itemName: {
    flex: 1,
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  itemMeta: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  itemTotal: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  timelineRow: { marginBottom: spacing.md },
  timelineLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  timelineTime: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  timelineNote: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: spacing.xs,
  },
  // A selectable control inside the return card: 1px hairline, primarySoft when selected.
  returnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
});
