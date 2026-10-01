import { router } from "expo-router";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../../providers/ThemeProvider";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import EmptyState from "../../../components/common/EmptyState";
import ErrorState from "../../../components/common/ErrorState";
import LoadingState from "../../../components/common/LoadingState";
import OrderCard from "../../../components/orders/OrderCard";
import spacing from "../../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../../constants/typography";
import { useResponsive } from "../../../hooks/useResponsive";
import { useBottomInset } from "../../../hooks/useBottomInset";
import { useOrders } from "../../../hooks/useOrders";

export default function CustomerOrdersScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const { orders, loading, error, reload } = useOrders();
  // One-up on a phone, growing to three on a desktop — see `useResponsive` for why this
  // is not the product grid's `columns`. A hook, so it belongs with the others and not
  // below the loading and error returns.
  const { listColumns } = useResponsive();


  useEffect(() => {
    reload();
  }, [reload]);

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Your Orders" />}>
        <LoadingState label="Loading your orders" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="Your Orders" />}>
        <ErrorState title="Could not load your orders" message={error} onRetry={reload} />
      </Screen>
    );
  }

  if (orders.length === 0) {
    return (
      <Screen header={<ScreenHeader title="Your Orders" subtitle="No orders yet" />}>
        <EmptyState
          title="No orders yet"
          message="Your deliveries will appear here. Customer controls: view & track only."
          actionLabel="Browse"
          onAction={() => router.push("/(customer)/(tabs)/products")}
          icon="receipt-long"
        />
      </Screen>
    );
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title="Your Orders"
          subtitle={`Track ${orders.length} ${orders.length === 1 ? "delivery" : "deliveries"} · customer view`}
        />
      }
    >
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        {listColumns > 1 ? (
          <View style={styles.grid}>
            {orders.map((order) => (
              <View key={order.id} style={[styles.gridItem, { flexBasis: `${100 / listColumns - 1}%` }]}>
                <OrderCard order={order} onPress={(item) => router.push({ pathname: "/(customer)/order/[orderId]", params: { orderId: item.id } })} />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.list}>
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onPress={(item) => router.push({ pathname: "/(customer)/order/[orderId]", params: { orderId: item.id } })} />
            ))}
          </View>
        )}

        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Customer: tap to track. For changes contact support — admin handles status.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  gridItem: { marginBottom: spacing.md },
  list: { gap: spacing.md },
  hint: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
