/* eslint-disable react-hooks/set-state-in-effect -- data fetching requires setState inside effects */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Screen from '../../../components/common/Screen';
import ScreenHeader from '../../../components/common/ScreenHeader';
import ResponsiveContainer from '../../../components/common/ResponsiveContainer';
import EmptyState from '../../../components/common/EmptyState';
import LoadingState from '../../../components/common/LoadingState';
import ErrorState from '../../../components/common/ErrorState';
import StatusBadge from '../../../components/common/StatusBadge';
import { useThemeColors } from '../../../providers/ThemeProvider';
import { useBottomInset } from '../../../hooks/useBottomInset';
import spacing from '../../../constants/spacing';
import { fontFamily, fontSize, lineHeight } from '../../../constants/typography';
import { fetchReturns } from '../../../services/returns';
import { formatDateTime } from '../../../utils/date';
import { statusTone } from '../../../utils/statusTone';
import { radius } from '../../../constants/sizes';

export default function AdminReturnsScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
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
      <Screen header={<ScreenHeader title="Returns" subtitle="Customer return requests" />}>
        <LoadingState label="Loading returns" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Returns" subtitle="Customer return requests" />}>
        <ErrorState message={error} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen header={<ScreenHeader title="Returns" subtitle="Customer return requests" />}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        <ResponsiveContainer sidebarAware>
        {returns.length === 0 ? (
          <EmptyState title="No returns" message="Return requests will appear here." />
        ) : (
          returns.map((item) => (
            <View key={item.id} style={[styles.card, { backgroundColor: colors.backgroundAlt }]}>
              <Text style={[styles.order, { color: colors.text }]}>{item.productName} · {item.customerName}</Text>
              {/* Quantity and age are what an admin triages on: two returns for one tablet
                  and two hundred are different problems, and the card showed neither. The
                  unit price is deliberately not here — `return_requests` does not carry one,
                  and it would have to be joined in from the order line to be shown. */}
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {`Qty ${item.quantity}`} · {formatDateTime(item.createdAt)}
              </Text>
              <Text style={[styles.reason, { color: colors.textMuted }]}>{item.reason}</Text>
              {/* What the approval actually did to the stock. A return can be approved and
                  still put nothing back — it has to name an order line, and an older row or
                  a request for more units than were sold will not. That used to be a silent
                  no-op, and the shop had no way to see the stock quietly draining away. */}
              {item.restockNote ? (
                <Text
                  style={[
                    styles.restockNote,
                    { color: /^NOT restocked/i.test(item.restockNote) ? colors.danger : colors.textMuted },
                  ]}
                >
                  {item.restockNote}
                </Text>
              ) : null}
              <View style={styles.footer}>
                <StatusBadge
                  label={item.status}
                  tone={statusTone(item.status)}
                />
                <Text
                  style={[styles.link, { color: colors.accent }]}
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
  order: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
  },
  meta: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
    marginTop: spacing.xs,
  },
  reason: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  // The outcome of the approval, in the database's own words. Kept at the same size as the
  // reason above it: it is bookkeeping detail the admin needs, not a headline.
  restockNote: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    fontStyle: 'italic',
  },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
});
