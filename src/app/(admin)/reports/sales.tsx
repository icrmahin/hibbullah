/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { goBack } from '@/utils/navigation';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import ResponsiveContainer from '../../../components/common/ResponsiveContainer';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useBottomInset } from '../../../hooks/useBottomInset';
import spacing from '../../../constants/spacing';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';
import { formatCurrency } from '../../../utils/currency';
import { fetchSalesReport } from '../../../services/reports';
import { radius } from '../../../constants/sizes';

/** One level deep: fall back to the admin dashboard when there is nothing to pop. */
const onBack = () => goBack('/(admin)');

export default function AdminSalesReportScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState({ revenue: 0, deliveredOrders: 0, discounts: 0 });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSalesReport());
    } catch (e: any) {
      setError(e.message || 'Failed to load sales report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Sales report" subtitle="Revenue overview" onBack={onBack} />}>
        <LoadingState label="Loading sales report" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Sales report" subtitle="Revenue overview" onBack={onBack} />}>
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  }

  const rows = [
    { label: 'Revenue', value: formatCurrency(data.revenue) },
    { label: 'Delivered orders', value: String(data.deliveredOrders) },
    { label: 'Discounts given', value: formatCurrency(data.discounts) },
  ];

  return (
    <Screen header={<ScreenHeader title="Sales report" subtitle="Revenue overview" onBack={onBack} />}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        <ResponsiveContainer sidebarAware>
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
        </ResponsiveContainer>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.lg, gap: spacing.md },
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
