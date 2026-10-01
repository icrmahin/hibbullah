import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { goBack } from '@/utils/navigation';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import EmptyState from '../../../components/common/EmptyState';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import StatusBadge from '../../../components/common/StatusBadge';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useAdminInventory } from '../../../hooks/useAdmin';
import { useBottomInset } from '../../../hooks/useBottomInset';
import spacing from '../../../constants/spacing';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';
import { radius } from '../../../constants/sizes';

/** One level deep: fall back to the admin dashboard when there is nothing to pop. */
const onBack = () => goBack('/(admin)');

export default function InventoryBatchesScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const { data, loading, error, reload } = useAdminInventory();

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Batches" subtitle="Track each batch independently" onBack={onBack} />}>
        <LoadingState label="Loading batches" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Batches" subtitle="Track each batch independently" onBack={onBack} />}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  const batches = (data || []).map((row: any) => ({
    id: row.id,
    productName: row.products?.name ?? 'Unknown',
    batchNumber: row.batch_number,
    quantity: row.quantity,
    status: row.status,
  }));

  return (
    <Screen header={<ScreenHeader title="Batches" subtitle="Track each batch independently" onBack={onBack} />}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        {batches.length === 0 ? (
          <EmptyState title="No batches" message="Product batches will appear here." />
        ) : (
          batches.map((item) => (
            <View key={item.id} style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
              <Text style={[styles.heading, { color: colors.text }]}>{item.batchNumber}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>{item.productName}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>Quantity: {item.quantity}</Text>
              <View style={styles.badgeRow}>
                <StatusBadge
                  label={item.status}
                  tone={item.status === 'out_of_stock' ? 'danger' : item.status === 'low' ? 'warning' : 'success'}
                />
              </View>
            </View>
          ))
        )}
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
  badgeRow: { marginTop: spacing.sm },
});
