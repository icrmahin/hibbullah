import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AdminHeader from '../../../components/admin/AdminHeader';
import EmptyState from '../../../components/common/EmptyState';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import ResponsiveContainer from '../../../components/common/ResponsiveContainer';
import SearchBar from '../../../components/common/SearchBar';
import Button from '../../../components/common/Button';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useResponsive } from '../../../hooks/useResponsive';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';
import { formatCurrency } from '../../../utils/currency';
import { config } from '../../../constants/config';
import { fetchCustomers, type CustomerRecord } from '../../../services/customers';

/** One customer row. Identical in the grid and the list, so it is defined once. */
function CustomerRow({ customer }: { customer: CustomerRecord }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.row, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
      <View style={styles.rowContent}>
        <Text style={[styles.name, { color: colors.text }]}>{customer.name}</Text>
        <Text style={[styles.info, { color: colors.textMuted }]}>
          {customer.phone || customer.email || 'No contact details'} · {customer.orderCount}{' '}
          {customer.orderCount === 1 ? 'order' : 'orders'}
        </Text>
        {/* The RPC has always computed lifetime spend and the card has always dropped it,
            so the one number an admin opens a customer record to compare was never shown
            without opening each record in turn. */}
        {customer.totalSpent > 0 ? (
          <Text style={[styles.spent, { color: colors.textSecondary }]}>
            {formatCurrency(customer.totalSpent)} spent
          </Text>
        ) : null}
      </View>
      <Text
        style={[styles.link, { color: colors.primary }]}
        onPress={() =>
          router.push({
            pathname: '/(admin)/customers/[customerId]',
            params: { customerId: customer.id },
          })
        }
      >
        View
      </Text>
    </View>
  );
}

export default function AdminCustomersScreen() {
  const colors = useThemeColors();
  const { isMobile, isTablet, columns } = useResponsive();
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hasMore, setHasMore] = useState(false);

  // `fetchCustomers` asks for one row more than the page holds, so "is there another page"
  // is answered by the fetch instead of by a separate count query. The screen used to
  // request a bare 20 and had no way to ask for the 21st, so every customer past the first
  // page was unreachable — and nothing on screen hinted that, it just looked like a short
  // list of customers.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCustomers(query || undefined, {
        limit: config.defaultPageSize + 1,
        offset: 0,
      });
      setCustomers(data.slice(0, config.defaultPageSize));
      setHasMore(data.length > config.defaultPageSize);
    } catch (e: any) {
      setError(e.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const data = await fetchCustomers(query || undefined, {
        limit: config.defaultPageSize + 1,
        offset: customers.length,
      });
      setHasMore(data.length > config.defaultPageSize);
      // Keyed on id, not concatenated: a customer created between the two requests would
      // otherwise be appended a second time and appear twice in the list.
      setCustomers((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...data.slice(0, config.defaultPageSize).filter((c) => !seen.has(c.id))];
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load more customers');
    } finally {
      setLoadingMore(false);
    }
  }, [query, customers.length]);

  useEffect(() => {
    const t = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, load]);

  if (loading && customers.length === 0) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Customers" subtitle="Manage customer records" />
        <LoadingState label="Loading customers" />
      </SafeAreaView>
    );
  }

  if (error && customers.length === 0) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Customers" subtitle="Manage customer records" />
        <ErrorState message={error} onRetry={load} />
      </SafeAreaView>
    );
  }

  const filtered = customers;
  const gridColumns = isMobile ? 1 : isTablet ? 2 : Math.min(columns, 3);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title="Customers" subtitle="Manage customer records" />
      <ScrollView contentContainerStyle={styles.container}>
        <ResponsiveContainer sidebarAware>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search customer" />
          {filtered.length === 0 ? (
            <EmptyState
              title="No customers found"
              message={
                customers.length === 0 ? "Customer accounts will appear here." : "Try a different search."
              }
            />
          ) : gridColumns > 1 ? (
            <View style={styles.grid}>
              {filtered.map((customer) => (
                <View key={customer.id} style={[styles.gridItem, { flexBasis: `${100 / gridColumns - 1}%` }]}>
                  <CustomerRow customer={customer} />
                </View>
              ))}
            </View>
          ) : (
            filtered.map((customer) => <CustomerRow key={customer.id} customer={customer} />)
          )}
          {hasMore ? (
            <View style={styles.more}>
              <Button
                title="Load more customers"
                variant="secondary"
                onPress={() => void loadMore()}
                loading={loadingMore}
                disabled={loadingMore}
                fullWidth
              />
            </View>
          ) : null}
          {/* A partial page is the only honest signal that the list is complete; without it
              an admin with exactly 20 customers could not tell a full list from a
              truncated one. */}
          {!hasMore && filtered.length > 0 ? (
            <Text style={[styles.count, { color: colors.textMuted }]}>
              {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
            </Text>
          ) : null}
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
  name: { fontSize: typography.body, fontWeight: '700' },
  info: { fontSize: typography.caption },
  spent: { fontSize: typography.caption, fontWeight: '700' },
  link: { fontWeight: '700' },
  more: { marginTop: spacing.sm },
  count: { fontSize: typography.caption, textAlign: 'center' },
});
