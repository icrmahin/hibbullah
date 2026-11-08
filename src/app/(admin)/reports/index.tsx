/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import ResponsiveContainer from '../../../components/common/ResponsiveContainer';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import Icon from '../../../components/common/Icon';
import Button from '../../../components/common/Button';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useBottomInset } from '../../../hooks/useBottomInset';
import spacing from '../../../constants/spacing';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';
import { formatCurrency } from '../../../utils/currency';
import { fetchReports } from '../../../services/reports';
import { fetchAllCustomers } from '../../../services/customers';
import { fetchOrders } from '../../../services/orders';
import { generateAndShareAllCustomersReport } from '../../../lib/customer-statement';
import type { StatementCustomer } from '../../../lib/customer-statement-html';
import type { Order } from '../../../types/order';
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
  const [customers, setCustomers] = useState<StatementCustomer[]>([]);
  const [ordersByCustomer, setOrdersByCustomer] = useState<Record<string, Order[]>>({});
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ sales: s, inventory: inv }, allCustomers, allOrders] = await Promise.all([
        fetchReports(),
        fetchAllCustomers(),
        fetchOrders(),
      ]);
      setSales(s);
      setInventory(inv);
      setCustomers(
        allCustomers.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email ?? undefined,
          phone: c.phone ?? undefined,
        })),
      );
      // Group orders by customer so each customer's block shows only their own orders.
      const grouped: Record<string, Order[]> = {};
      for (const o of allOrders) {
        const key = o.customerId;
        grouped[key] = [...(grouped[key] || []), o];
      }
      setOrdersByCustomer(grouped);
    } catch (e: any) {
      setError(e.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownloadAllCustomers = async () => {
    setPdfError(null);
    setPdfGenerating(true);
    try {
      await generateAndShareAllCustomersReport({
        customers: customers.map((c) => ({
          ...c,
          orders: (ordersByCustomer[c.id] || []).slice().sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        })),
        asOf: new Date().toISOString(),
        dialogTitle: 'All customers report',
      });
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'Could not generate the all customers PDF.');
    } finally {
      setPdfGenerating(false);
    }
  };

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
        <ResponsiveContainer sidebarAware>
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
          {pdfError ? (
            <Text style={[styles.meta, { color: colors.danger }]}>{pdfError}</Text>
          ) : null}
          <Button
            title={pdfGenerating ? "Generating..." : "Download All Customers PDF"}
            onPress={handleDownloadAllCustomers}
            loading={pdfGenerating}
            disabled={pdfGenerating}
            variant="secondary"
            fullWidth
          />
          {REPORT_LINKS.map((link) => (
            <React.Fragment key={link.href}>
              <View style={[styles.divider, { backgroundColor: colors.borderSoft }]} />
              <Pressable
                onPress={() => router.push(link.href)}
                android_ripple={{ color: colors.ripple.primary, borderless: false }}
                style={styles.navRow}
                accessibilityRole="button"
                accessibilityLabel={link.label}
              >
                <Text style={[styles.navLabel, { color: colors.text }]}>{link.label}</Text>
                <Icon name="chevron-right" size={18} color={colors.textMuted} />
              </Pressable>
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
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    overflow: "hidden",
  },
  navLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  meta: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: spacing.sm,
  },
});
