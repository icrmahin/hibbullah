import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import EmptyState from '../../../components/common/EmptyState';
import ResponsiveContainer from '../../../components/common/ResponsiveContainer';
import SearchBar from '../../../components/common/SearchBar';
import StatusBadge from '../../../components/common/StatusBadge';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useResponsive } from '../../../hooks/useResponsive';
import { useAdminOrders } from '../../../hooks/useAdmin';
import { useBottomInset } from '../../../hooks/useBottomInset';
import spacing from '../../../constants/spacing';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';
import { radius } from '../../../constants/sizes';
import type { Order } from '../../../types/order';

/** One order row — defined once and shared by the grid and the list branch. */
function OrderRow({ order }: { order: Order }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.row, { backgroundColor: colors.backgroundAlt }]}>
      <View style={styles.rowContent}>
        <Text style={[styles.orderNumber, { color: colors.text }]}>{order.orderNumber}</Text>
        <Text style={[styles.customer, { color: colors.textMuted }]}>{order.customerName}</Text>
      </View>
      <StatusBadge
        label={order.status}
        tone={order.status === 'PENDING' ? 'warning' : order.status === 'DELIVERED' ? 'success' : 'info'}
      />
      <Text
        style={[styles.link, { color: colors.accent }]}
        onPress={() =>
          router.push({ pathname: '/(admin)/orders/[orderId]', params: { orderId: order.id } })
        }
      >
        Review
      </Text>
    </View>
  );
}

export default function AdminOrdersScreen() {
  const bottomInset = useBottomInset();
  const { data: orders, loading, error, reload } = useAdminOrders();
  // One-up on a phone, growing to three on a desktop — see `useResponsive` for why this
  // is not the product grid's `columns`.
  const { listColumns } = useResponsive();
  const [query, setQuery] = useState('');

  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  // The count is only worth showing when there is something to count: on the first pass
  // through the loading branch the list is empty, so `${orders.length} total` always read
  // "0 total". The error branch keeps its own "live" subtitle.
  const listSubtitle = orders.length > 0 ? `${time} · ${orders.length} orders` : time;

  if (loading) {
    return (
      <Screen
        header={
          <ScreenHeader
            title="Orders"
            subtitle={orders.length > 0 ? `${time} · ${orders.length} total` : time}
          />
        }
      >
        <LoadingState label="Loading orders" />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen header={<ScreenHeader title="Orders" subtitle={`${time} · live`} />}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  const filtered = orders.filter(
    (order) =>
      order.orderNumber.toLowerCase().includes(query.toLowerCase()) ||
      order.customerName.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Screen header={<ScreenHeader title="Orders" subtitle={listSubtitle} />}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        <ResponsiveContainer sidebarAware>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search order or customer" />
          {filtered.length === 0 ? (
            <EmptyState
              title="No orders found"
              message={
                orders.length === 0
                  ? "Customer orders will appear here."
                  : "Try a different search."
              }
            />
          ) : listColumns > 1 ? (
            <View style={styles.grid}>
              {filtered.map((order) => (
                <View key={order.id} style={[styles.gridItem, { flexBasis: `${100 / listColumns - 1}%` }]}>
                  <OrderRow order={order} />
                </View>
              ))}
            </View>
          ) : (
            filtered.map((order) => <OrderRow key={order.id} order={order} />)
          )}
        </ResponsiveContainer>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // ResponsiveContainer owns the 16px gutter, so the screen keeps only the top padding.
  container: { paddingTop: spacing.lg, gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridItem: { marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowContent: { flex: 1, gap: spacing.xxs },
  orderNumber: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
  },
  customer: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  link: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
});
