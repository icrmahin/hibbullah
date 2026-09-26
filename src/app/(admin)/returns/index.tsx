/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AdminHeader from '../../../components/admin/AdminHeader';
import EmptyState from '../../../components/common/EmptyState';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import StatusBadge from '../../../components/common/StatusBadge';
import { useThemeColors } from '../../../providers/ThemeProvider';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';
import { fetchReturns } from '../../../services/returns';
import { formatDateTime } from '../../../utils/date';

export default function AdminReturnsScreen() {
  const colors = useThemeColors();
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoized so the error state can offer a retry. The load used to live inline in the
  // effect, which left nowhere to call it from once a fetch had failed.
  const load = React.useCallback(async () => {
    setLoading(true);
    // Cleared up front rather than only on success: clearing it in the `then` would leave
    // a stale message behind, and the screen renders `error` in preference to the list, so
    // a later successful load would still be showing the old failure.
    setError(null);
    try {
      setReturns(await fetchReturns());
    } catch (err: any) {
      setError(err?.message || 'Failed to load returns');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Returns" subtitle="Customer return requests" />
        <LoadingState label="Loading returns" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Returns" subtitle="Customer return requests" />
        <ErrorState message={error} onRetry={load} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title="Returns" subtitle="Customer return requests" />
      <ScrollView contentContainerStyle={styles.container}>
        {returns.length === 0 ? (
          <EmptyState title="No returns" message="Return requests will appear here." />
        ) : (
          returns.map((item) => (
            <View
              key={item.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.backgroundAlt,
                  borderColor: colors.borderLight,
                },
              ]}
            >
              <Text style={[styles.order, { color: colors.text }]}>{item.productName} · {item.customerName}</Text>
              {/* Quantity and age are what an admin triages on: two returns for one tablet
                  and two hundred are different problems, and the card showed neither. The
                  unit price is deliberately not here — `return_requests` does not carry one,
                  and it would have to be joined in from the order line to be shown. */}
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {`Qty ${item.quantity}`} · {formatDateTime(item.createdAt)}
              </Text>
              <Text style={[styles.reason, { color: colors.textMuted }]}>{item.reason}</Text>
              <View style={styles.footer}>
                <StatusBadge
                  label={item.status}
                  tone={item.status === 'APPROVED' || item.status === 'PROCESSED' ? 'success' : item.status === 'REJECTED' ? 'danger' : 'warning'}
                />
                <Text
                  style={[styles.link, { color: colors.primary }]}
                  onPress={() =>
                    router.push({
                      pathname: '/(admin)/returns/[returnId]',
                      params: { returnId: item.id },
                    })
                  }
                >
                  Details
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.lg,
  },
  order: { fontSize: typography.body, fontWeight: '700' },
  meta: { fontSize: typography.bodySmall, marginTop: spacing.xs },
  reason: { fontSize: typography.bodySmall, marginTop: spacing.xs, marginBottom: spacing.sm },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontWeight: '700' },
});
