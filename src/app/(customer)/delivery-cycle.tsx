import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '@/utils/navigation';
import { useThemeColors } from '../../providers/ThemeProvider';
import SoftHeader from '../../components/common/SoftHeader';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import Button from '../../components/common/Button';
import spacing from '../../constants/spacing';
import { useDeliveryCycle } from '../../hooks/useDeliveryCycle';
import { useOrders } from '../../hooks/useOrders';
import { formatCurrency } from '../../utils/currency';
import { formatDateTime } from '../../utils/date';

export default function DeliveryCycleScreen() {
  const colors = useThemeColors();
  const { cycle, loading, error, reload, create } = useDeliveryCycle();
  const { orders } = useOrders();
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SoftHeader title="Delivery cycle" onBack={() => goBack()} />
        <LoadingState label="Loading delivery cycle" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SoftHeader title="Delivery cycle" onBack={() => goBack()} />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  if (!cycle) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <SoftHeader title="Delivery cycle" onBack={() => goBack()} />
        <ScrollView contentContainerStyle={styles.container}>
          <EmptyState title="No active cycle" message="Start a 24-hour delivery cycle to group your orders." />
          {createError ? <Text style={[styles.error, { color: colors.danger }]}>{createError}</Text> : null}
          <Button
            title={creating ? "Starting..." : "Start cycle"}
            onPress={async () => {
              setCreating(true);
              setCreateError(null);
              try {
                await create();
              } catch (e: any) {
                setCreateError(e.message || 'Failed to start cycle');
              } finally {
                setCreating(false);
              }
            }}
            loading={creating}
            disabled={creating}
            fullWidth
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // cycle.products now comes from delivery_cycle_items join; fallback to pending orders filtered by cycle window if still empty
  const cycleProducts = (cycle as any).products as any[]
  const pendingOrders = orders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED' || o.status === 'PROCESSING')

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <SoftHeader title="Delivery cycle" onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Active order cycle</Text>
          <StatusBadge label={cycle.status} tone={cycle.status === 'PENDING' ? 'warning' : 'info'} />
          <Text style={[styles.meta, { color: colors.textMuted }]}>Start: {formatDateTime(cycle.startedAt)}</Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>Closes: {formatDateTime(cycle.closesAt)}</Text>
          <Text style={[styles.total, { color: colors.text }]}>Estimated total: {formatCurrency(cycle.estimatedTotal)}</Text>
          {cycleProducts.length > 0 ? (
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <Text style={[styles.meta, { color: colors.text, fontWeight: '700' }]}>Products in cycle ({cycleProducts.length})</Text>
              {cycleProducts.map((p: any) => (
                <View key={p.id} style={styles.row}>
                  <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>{p.name} × {p.quantity ?? 1}</Text>
                  <Text style={[styles.itemPrice, { color: colors.text }]}>{p.price ? formatCurrency(p.price * (p.quantity ?? 1)) : ''}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Pending orders in window ({pendingOrders.length})</Text>
          <Text style={[styles.meta, { color: colors.textMuted, marginBottom: spacing.sm }]}>Orders with status PENDING/CONFIRMED/PROCESSING created after {formatDateTime(cycle.startedAt)}</Text>
          {pendingOrders.length === 0 ? (
            <Text style={[styles.meta, { color: colors.textMuted }]}>No pending orders. New orders will be grouped here.</Text>
          ) : (
            pendingOrders.map((order) => (
              <View key={order.id} style={styles.row}>
                <Text style={[styles.itemName, { color: colors.text }]}>{order.orderNumber}</Text>
                <Text style={[styles.itemPrice, { color: colors.text }]}>{formatCurrency(order.total)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  card: { borderRadius: 16, borderWidth: 1, padding: spacing.lg },
  title: { fontSize: 20, fontWeight: '700', marginBottom: spacing.md },
  meta: { fontSize: 12, marginTop: spacing.sm },
  total: { marginTop: spacing.md, fontWeight: '700' },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  itemName: { flex: 1 },
  itemPrice: { color: '#3D4A46' },
  error: { fontSize: 12, textAlign: 'center' },
});
