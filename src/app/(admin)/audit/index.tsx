/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AdminHeader from '../../../components/admin/AdminHeader';
import EmptyState from '../../../components/common/EmptyState';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import { useThemeColors } from '../../../providers/ThemeProvider';
import spacing from '../../../constants/spacing';
import typography from '../../../constants/typography';
import { formatDateTime } from '../../../utils/date';
import { fetchAuditEntries } from '../../../services/audit';
import type { AuditEntry } from '../../../types/audit';

export default function AuditLogScreen() {
  const colors = useThemeColors();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuditEntries(50);
      setEntries(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Audit log" subtitle="Recent operational activity" />
        <LoadingState label="Loading audit log" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <AdminHeader title="Audit log" subtitle="Recent operational activity" />
        <ErrorState message={error} onRetry={load} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <AdminHeader title="Audit log" subtitle="Recent operational activity" />
      <ScrollView contentContainerStyle={styles.container}>
        {entries.length === 0 ? (
          <EmptyState title="No audit entries" message="Operational activity will appear here." />
        ) : (
          entries.map((entry) => (
            <View
              key={entry.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.backgroundAlt,
                  borderColor: colors.borderLight,
                },
              ]}
            >
              <Text style={[styles.action, { color: colors.text }]}>{entry.action} · {entry.recordType}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>{entry.actor}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>{formatDateTime(entry.timestamp)}</Text>
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
  action: { fontSize: typography.body, fontWeight: '700' },
  meta: { fontSize: typography.bodySmall, marginTop: spacing.xs },
});
