/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { goBack } from '@/utils/navigation';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useBottomInset } from '../../../hooks/useBottomInset';
import spacing from '../../../constants/spacing';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';
import { formatCurrency } from '../../../utils/currency';
import { fetchInventoryReport } from '../../../services/reports';
import { config } from '../../../constants/config';
import { radius } from '../../../constants/sizes';

/** One level deep: fall back to the admin dashboard when there is nothing to pop. */
const onBack = () => goBack('/(admin)');

export default function AdminInventoryReportScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState({ lowStock: 0, outOfStock: 0, expiring: 0, inventoryValue: 0 });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchInventoryReport());
    } catch (e: any) {
      setError(e.message || 'Failed to load inventory report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Inventory report" subtitle="Stock movement summary" onBack={onBack} />}>
        <LoadingState label="Loading inventory report" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Inventory report" subtitle="Stock movement summary" onBack={onBack} />}>
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  }

  const rows = [
    { label: 'Low-stock items', value: `${data.lowStock} products` },
    { label: 'Out of stock', value: String(data.outOfStock) },
    // The window is config's, not a stale 90-day literal: the threshold this number is
    // counted against is `config.expiryWarningDays`.
    { label: `Expiring (${config.expiryWarningDays} days)`, value: String(data.expiring) },
    { label: 'Inventory value', value: formatCurrency(data.inventoryValue) },
  ];

  return (
    <Screen header={<ScreenHeader title="Inventory report" subtitle="Stock movement summary" onBack={onBack} />}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
          {rows.map((r, index) => (
            <React.Fragment key={r.label}>
              {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.borderSoft }]} /> : null}
              <View style={styles.metricRow}>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{r.label}</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>{r.value}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  divider: { height: 1 },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  metricLabel: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
  },
  metricValue: {
    fontFamily: fontFamily.soraBold,
    fontSize: fontSize.title2,
    lineHeight: fontSize.title2 * lineHeight.tight,
    textAlign: 'right',
  },
});
