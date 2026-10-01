/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import Icon from '../../../components/common/Icon';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useBottomInset } from '../../../hooks/useBottomInset';
import spacing from '../../../constants/spacing';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';
import { formatCurrency } from '../../../utils/currency';
import { fetchReports } from '../../../services/reports';
import { radius } from '../../../constants/sizes';

/** The detail reports this screen is the front door for — both were registered routes
 *  nothing linked to. */
const REPORT_LINKS = [
  { label: 'Sales report', href: '/(admin)/reports/sales' },
  { label: 'Inventory report', href: '/(admin)/reports/inventory' },
] as const;

export default function AdminReportsScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState({ revenue: 0, deliveredOrders: 0, discounts: 0 });
  const [inventory, setInventory] = useState({ lowStock: 0, outOfStock: 0, expiring: 0, inventoryValue: 0 });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { sales: s, inventory: inv } = await fetchReports();
      setSales(s);
      setInventory(inv);
    } catch (e: any) {
      setError(e.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Reports" subtitle="High-level performance" />}>
        <LoadingState label="Loading reports" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Reports" subtitle="High-level performance" />}>
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  }

  const reports = [
    { label: "Revenue", value: formatCurrency(sales.revenue) },
    { label: "Delivered orders", value: String(sales.deliveredOrders) },
    { label: "Discounts given", value: formatCurrency(sales.discounts) },
    { label: "Low stock", value: String(inventory.lowStock) },
    { label: "Out of stock", value: String(inventory.outOfStock) },
  ];

  // One card of rows: five stacked bordered cards with 22px bold numbers became a single
  // white surface with hairline-separated rows, the way every other list in the app reads.
  return (
    <Screen header={<ScreenHeader title="Reports" subtitle="High-level performance" />}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        <View style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
          {reports.map((r, index) => (
            <React.Fragment key={r.label}>
              {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.borderSoft }]} /> : null}
              <View style={styles.metricRow}>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>{r.label}</Text>
                <Text style={[styles.metricValue, { color: colors.text }]}>{r.value}</Text>
              </View>
            </React.Fragment>
          ))}
          {REPORT_LINKS.map((link) => (
            <React.Fragment key={link.href}>
              <View style={[styles.divider, { backgroundColor: colors.borderSoft }]} />
              <Pressable
                onPress={() => router.push(link.href)}
                style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={link.label}
              >
                <Text style={[styles.navLabel, { color: colors.text }]}>{link.label}</Text>
                <Icon name="chevron-right" size={18} color={colors.textMuted} />
              </Pressable>
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
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  navLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  pressed: { opacity: 0.7 },
});
