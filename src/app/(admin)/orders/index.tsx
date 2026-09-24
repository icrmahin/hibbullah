import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AdminHeader from '../../../components/admin/AdminHeader';
import EmptyState from '../../../components/common/EmptyState';
import ResponsiveContainer from '../../../components/common/ResponsiveContainer';
import SearchBar from '../../../components/common/SearchBar';
import StatusBadge from '../../../components/common/StatusBadge';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useResponsive } from '../../../hooks/useResponsive';
import { useAdminOrders } from '../../../hooks/useAdmin';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';

export default function AdminOrdersScreen() {
  const colors = useThemeColors();
  const { isMobile, isTablet, columns } = useResponsive();
  const { data: orders, loading, error, reload } = useAdminOrders();
  const [query, setQuery] = useState('');

  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Orders" subtitle={`${time} · ${orders.length} total`} />
        <LoadingState label="Loading orders" />
      </SafeAreaView>
    );
  }
  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Orders" subtitle={`${time} · live`} />
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  const filtered = orders.filter(
    (order) =>
      order.orderNumber.toLowerCase().includes(query.toLowerCase()) ||
      order.customerName.toLowerCase().includes(query.toLowerCase()),
  );

  const gridColumns = isMobile ? 1 : isTablet ? 2 : Math.min(columns, 3);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title="Orders" subtitle={`${time} · ${orders.length} orders`} />
      <ScrollView contentContainerStyle={styles.container}>
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
          ) : gridColumns > 1 ? (
            <View style={styles.grid}>
              {filtered.map((order) => (
                <View key={order.id} style={[styles.gridItem, { flexBasis: `${100 / gridColumns - 1}%` }]}>
                  <View
                    style={[styles.row, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}
                  >
                    <View style={styles.rowContent}>
                      <Text style={[styles.orderNumber, { color: colors.text }]}>{order.orderNumber}</Text>
                      <Text style={[styles.customer, { color: colors.textMuted }]}>{order.customerName}</Text>
                    </View>
                    <StatusBadge label={order.status} tone={order.status === 'PENDING' ? 'warning' : order.status === 'DELIVERED' ? 'success' : 'info'} />
                    <Text
                      style={[styles.link, { color: colors.primary }]}
                      onPress={() => router.push({ pathname: '/(admin)/orders/[orderId]', params: { orderId: order.id } })}
                    >
                      Review
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            filtered.map((order) => (
              <View
                key={order.id}
                style={[styles.row, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}
              >
                <View style={styles.rowContent}>
                  <Text style={[styles.orderNumber, { color: colors.text }]}>{order.orderNumber}</Text>
                  <Text style={[styles.customer, { color: colors.textMuted }]}>{order.customerName}</Text>
                </View>
                <StatusBadge label={order.status} tone={order.status === 'PENDING' ? 'warning' : order.status === 'DELIVERED' ? 'success' : 'info'} />
                <Text
                  style={[styles.link, { color: colors.primary }]}
                  onPress={() => router.push({ pathname: '/(admin)/orders/[orderId]', params: { orderId: order.id } })}
                >
                  Review
                </Text>
              </View>
            ))
          )}
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridItem: { marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowContent: { flex: 1, gap: spacing.xxs },
  orderNumber: { fontSize: typography.body, fontWeight: '700' },
  customer: { fontSize: typography.caption },
  link: { fontWeight: '700' },
});
