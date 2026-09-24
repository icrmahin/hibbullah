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

export default function AdminReturnsScreen() {
  const colors = useThemeColors();
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchReturns()
      .then((data) => {
        if (cancelled) return;
        setReturns(data);
        setLoading(false);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load returns');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        <ErrorState message={error} />
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
  reason: { fontSize: typography.bodySmall, marginTop: spacing.xs, marginBottom: spacing.sm },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontWeight: '700' },
});
