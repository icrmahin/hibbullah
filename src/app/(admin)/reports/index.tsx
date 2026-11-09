/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goBack } from '@/utils/navigation';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import ResponsiveContainer from '../../../components/common/ResponsiveContainer';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import Icon from '../../../components/common/Icon';
import Button from '../../../components/common/Button';
import Input from '../../../components/common/Input';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useBottomInset } from '../../../hooks/useBottomInset';
import spacing from '../../../constants/spacing';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';
import { formatCurrency } from '../../../utils/currency';
import { fetchReports } from '../../../services/reports';
import { fetchOrdersByDateRange } from '../../../services/orders';
import { generateAndShareSalesReport } from '../../../lib/financial-report';
import { radius } from '../../../constants/sizes';

/** The detail reports this screen is the front door for — both were registered routes
 *  nothing linked to. */
const REPORT_LINKS = [
  { label: 'Sales report', href: '/(admin)/reports/sales' },
  { label: 'Inventory report', href: '/(admin)/reports/inventory' },
] as const;

/** Kinds of report the admin can generate. Purchase reports are blocked because the
 *  system stores no supplier purchase transactions (see phase-3C note). */
type ReportKind = 'monthly-sales' | 'yearly-sales' | 'monthly-purchase' | 'yearly-purchase'

const REPORT_KINDS: { kind: ReportKind; label: string; blocked: boolean }[] = [
  { kind: 'monthly-sales', label: 'Monthly sales report', blocked: false },
  { kind: 'yearly-sales', label: 'Yearly sales report', blocked: false },
  { kind: 'monthly-purchase', label: 'Monthly purchase report', blocked: true },
  { kind: 'yearly-purchase', label: 'Yearly purchase report', blocked: true },
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** First and last day (inclusive) of a calendar month as ISO date strings. */
function monthBounds(year: number, monthIndex: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, monthIndex, 1))
  const end = new Date(Date.UTC(year, monthIndex + 1, 0))
  const toISODate = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return { start: toISODate(start), end: toISODate(end) }
}

/** First and last day (inclusive) of a calendar year as ISO date strings. */
function yearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}

/** Build a monthly breakdown (Jan–Dec) for a yearly report. */
function monthlyBreakdownForYear(
  ordersByMonth: Map<number, { orderCount: number; deliveredRevenue: number; totalOrderValue: number }>,
): Array<{ month: string; orderCount: number; deliveredRevenue: number; totalOrderValue: number }> {
  return MONTHS.map((monthName, index) => {
    const data = ordersByMonth.get(index) || { orderCount: 0, deliveredRevenue: 0, totalOrderValue: 0 }
    return {
      month: monthName,
      orderCount: data.orderCount,
      deliveredRevenue: data.deliveredRevenue,
      totalOrderValue: data.totalOrderValue,
    }
  })
}

/** One level deep: fall back to the admin dashboard when there is nothing to pop. */
const onBack = () => goBack('/(admin)')

export default function AdminReportsScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sales, setSales] = useState({ revenue: 0, deliveredOrders: 0, discounts: 0 });

  // Report generation state
  const [reportKind, setReportKind] = useState<ReportKind>('monthly-sales')
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getUTCFullYear()))
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(new Date().getUTCMonth())
  const [reportGenerating, setReportGenerating] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { sales: s } = await fetchReports()
      setSales(s)
    } catch (e: any) {
      setError(e.message || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const selectedKindDef = REPORT_KINDS.find((k) => k.kind === reportKind)!

  const isYearly = reportKind === 'yearly-sales' || reportKind === 'yearly-purchase'
  const { start, end } = isYearly
    ? yearBounds(Number(selectedYear))
    : monthBounds(Number(selectedYear), selectedMonthIndex)

  const periodLabel = isYearly
    ? selectedYear
    : `${MONTHS[selectedMonthIndex]} ${selectedYear}`

  const handleFetchAndDownload = async () => {
    setReportError(null)
    setReportGenerating(true)
    try {
      const orders = await fetchOrdersByDateRange(start, end)

      const kind = reportKind
      if (kind === 'monthly-sales') {
        await generateAndShareSalesReport({
          docTitle: 'Monthly Sales Report',
          subtitle: `Hibbullah — customer sales for ${periodLabel}`,
          reportingPeriod: `Month: ${periodLabel}`,
          asOf: new Date().toISOString(),
          orders,
          emptyMessage: `No customer orders were placed in ${periodLabel}.`,
          dialogTitle: `Monthly sales — ${periodLabel}`,
        })
      } else if (kind === 'yearly-sales') {
        // Build a monthly breakdown for the yearly report.
        const ordersByMonth = new Map<number, { orderCount: number; deliveredRevenue: number; totalOrderValue: number }>()
        for (const o of orders) {
          const d = new Date(o.createdAt)
          const monthIndex = d.getUTCMonth()
          const existing = ordersByMonth.get(monthIndex) || { orderCount: 0, deliveredRevenue: 0, totalOrderValue: 0 }
          const orderTotal = (o.items || []).reduce(
            (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
            0,
          )
          const statusUpper = (o.status || '').toUpperCase()
          existing.orderCount += 1
          if (statusUpper === 'DELIVERED') existing.deliveredRevenue += orderTotal
          if (statusUpper !== 'CANCELLED') existing.totalOrderValue += orderTotal
          ordersByMonth.set(monthIndex, existing)
        }
        await generateAndShareSalesReport({
          docTitle: 'Yearly Sales Report',
          subtitle: `Hibbullah — customer sales for ${selectedYear}`,
          reportingPeriod: `Year: ${selectedYear}`,
          asOf: new Date().toISOString(),
          orders,
          monthlyBreakdown: monthlyBreakdownForYear(ordersByMonth),
          emptyMessage: `No customer orders were placed in ${selectedYear}.`,
          dialogTitle: `Yearly sales — ${selectedYear}`,
        })
      } else {
        // Purchase reports are blocked: the system stores no supplier purchase
        // transactions. Show a clear message rather than a fake report.
        setReportError(
          'Purchase reports are not available: the system does not store supplier ' +
          'purchase transactions. A suppliers table and purchase-order module must be ' +
          'added before purchase reports can be generated.',
        )
      }
    } catch (e) {
      setReportError(e instanceof Error ? e.message : 'Could not generate the report.')
    } finally {
      setReportGenerating(false)
    }
  }

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Reports" subtitle="High-level performance" onBack={onBack} />}>
        <LoadingState label="Loading reports" />
      </Screen>
    )
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Reports" subtitle="High-level performance" onBack={onBack} />}>
        <ErrorState message={error} onRetry={load} />
      </Screen>
    )
  }

  const reports = [
    { label: 'Revenue', value: formatCurrency(sales.revenue) },
    { label: 'Delivered orders', value: String(sales.deliveredOrders) },
    { label: 'Discounts given', value: formatCurrency(sales.discounts) },
  ]

  return (
    <Screen header={<ScreenHeader title="Reports" subtitle="High-level performance" onBack={onBack} />}>
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

        {/* Sales reports section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Sales reports</Text>
          <View style={styles.kindRow}>
            {REPORT_KINDS.filter((k) => !k.blocked).map((k) => (
              <Pressable
                key={k.kind}
                onPress={() => setReportKind(k.kind)}
                style={[
                  styles.kindButton,
                  reportKind === k.kind
                    ? { borderWidth: 2, borderColor: colors.primary }
                    : { borderColor: colors.borderSoft },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: reportKind === k.kind }}
              >
                <Text style={[
                  styles.kindLabel,
                  reportKind === k.kind && { color: colors.textInverse },
                ]}>
                  {k.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Period selection */}
          <View style={styles.periodRow}>
            {isYearly ? (
              <View style={styles.periodField}>
                <Text style={[styles.periodLabel, { color: colors.textMuted }]}>Year</Text>
                <Input
                  value={selectedYear}
                  onChangeText={setSelectedYear}
                  keyboardType="numeric"
                  placeholder="YYYY"
                  error={/^\d{4}$/.test(selectedYear) ? undefined : 'Enter a year'}
                />
              </View>
            ) : (
              <>
                <View style={styles.periodField}>
                  <Text style={[styles.periodLabel, { color: colors.textMuted }]}>Month</Text>
                  <Input
                    value={String(selectedMonthIndex + 1)}
                    onChangeText={(t) => {
                      const n = Number(t)
                      if (!Number.isNaN(n) && n >= 1 && n <= 12) setSelectedMonthIndex(n - 1)
                    }}
                    keyboardType="numeric"
                    placeholder="MM"
                    error={!/^[1-9]$|^1[0-2]$/.test(String(selectedMonthIndex + 1)) ? '1–12' : undefined}
                  />
                </View>
                <View style={styles.periodField}>
                  <Text style={[styles.periodLabel, { color: colors.textMuted }]}>Year</Text>
                  <Input
                    value={selectedYear}
                    onChangeText={setSelectedYear}
                    keyboardType="numeric"
                    placeholder="YYYY"
                    error={/^\d{4}$/.test(selectedYear) ? undefined : 'Enter a year'}
                  />
                </View>
              </>
            )}
          </View>

          {reportError ? (
            <Text style={[styles.meta, { color: colors.danger }]}>{reportError}</Text>
          ) : null}
          <Button
            title={reportGenerating ? "Generating PDF..." : `Download ${selectedKindDef.label}`}
            onPress={handleFetchAndDownload}
            loading={reportGenerating}
            disabled={reportGenerating || selectedKindDef.blocked}
            fullWidth
          />
        </View>

        {/* Purchase reports section (blocked) */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Purchase reports</Text>
          <View style={styles.kindRow}>
            {REPORT_KINDS.filter((k) => k.blocked).map((k) => (
              <Pressable
                key={k.kind}
                onPress={() => setReportKind(k.kind)}
                style={[
                  styles.kindButton,
                  reportKind === k.kind && { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: reportKind === k.kind, disabled: true }}
                disabled
              >
                <Text style={[styles.kindLabel, { color: colors.textMuted }]}>{k.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.note, { color: colors.textMuted }]}>
            Purchase reports are not available. The system does not store supplier
            purchase transactions, so no genuine purchase data exists to report.
          </Text>
        </View>

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
        </ResponsiveContainer>
      </ScrollView>
    </Screen>
  )
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
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: -0.2,
    marginBottom: spacing.md,
  },
  kindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  kindButton: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  kindLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  periodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  periodField: {
    flex: 1,
    minWidth: 120,
  },
  periodLabel: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
    marginBottom: spacing.xs,
  },
  meta: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: spacing.sm,
  },
  note: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: spacing.sm,
  },
})
