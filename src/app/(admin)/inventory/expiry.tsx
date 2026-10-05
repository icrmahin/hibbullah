import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { goBack } from '@/utils/navigation';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import ResponsiveContainer from '../../../components/common/ResponsiveContainer';
import EmptyState from '../../../components/common/EmptyState';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useAdminInventory } from '../../../hooks/useAdmin';
import { useBottomInset } from '../../../hooks/useBottomInset';
import spacing from '../../../constants/spacing';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';
import { config } from '../../../constants/config';
import { formatDate } from '../../../utils/date';
import { radius } from '../../../constants/sizes';

/** One level deep: fall back to the admin dashboard when there is nothing to pop. */
const onBack = () => goBack('/(admin)');

export default function ExpiryManagementScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const { data, loading, error, reload } = useAdminInventory();

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Expiry" subtitle="Monitor expiring batches" onBack={onBack} />}>
        <LoadingState label="Loading expiry" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Expiry" subtitle="Monitor expiring batches" onBack={onBack} />}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  // The window comes from config rather than a literal, because this screen and the
  // reports screen answer the same question — what is expiring soon — and they were
  // answering it differently: 90 days here, config's 60 everywhere else. An admin who
  // compared the two numbers had no way to tell which was the real threshold.
  const now = new Date();
  const inWindow = new Date(now.getTime() + config.expiryWarningDays * 24 * 60 * 60 * 1000);
  const batches = (data || [])
    .map((row: any) => ({
      id: row.id,
      productName: row.products?.name ?? 'Unknown',
      batchNumber: row.batch_number,
      quantity: row.quantity,
      expiryDate: row.expiry_date,
    }))
    .filter((b) => b.expiryDate && new Date(b.expiryDate) <= inWindow)
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

  return (
    <Screen header={<ScreenHeader title="Expiry" subtitle="Monitor expiring batches" onBack={onBack} />}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        <ResponsiveContainer sidebarAware>
        {batches.length === 0 ? (
          <EmptyState
            title="Nothing expiring"
            message={`No batches expire within the next ${config.expiryWarningDays} days.`}
          />
        ) : (
          batches.map((item) => (
            <View key={item.id} style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
              <Text style={[styles.heading, { color: colors.text }]}>{item.productName}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>Batch: {item.batchNumber}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>Expiry: {formatDate(item.expiryDate ?? "")}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>Qty: {item.quantity}</Text>
            </View>
          ))
        )}
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
  heading: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: -0.2,
  },
  meta: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
    marginTop: spacing.xs,
  },
});
