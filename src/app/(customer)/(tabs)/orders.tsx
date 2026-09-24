import { router } from "expo-router";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../../providers/ThemeProvider";
import EmptyState from "../../../components/common/EmptyState";
import ErrorState from "../../../components/common/ErrorState";
import LoadingState from "../../../components/common/LoadingState";
import ResponsiveContainer from "../../../components/common/ResponsiveContainer";
import OrderCard from "../../../components/orders/OrderCard";
import spacing from "../../../constants/spacing";
import typography from "../../../constants/typography";
import { useResponsive } from "../../../hooks/useResponsive";
import { useOrders } from "../../../hooks/useOrders";

export default function CustomerOrdersScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { orders, loading, error, reload } = useOrders();
  const { isMobile, isTablet, columns } = useResponsive();

  useEffect(() => {
    reload();
  }, [reload]);

  if (loading) return <LoadingState label="Loading your orders" />;
  if (error) return <ErrorState title="Could not load your orders" message={error} onRetry={reload} />;

  const gridColumns = isMobile ? 1 : isTablet ? 2 : Math.min(columns, 3);

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: Math.max(insets.bottom, spacing.lg) + 24 }]}>
        <ResponsiveContainer>
          {/* In-content header — customer side soft, no admin controls */}
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: colors.text }]}>Your Orders</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {orders.length === 0 ? "No orders yet" : `Track ${orders.length} ${orders.length === 1 ? "delivery" : "deliveries"} · customer view`}
            </Text>
          </View>

          {orders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              message="Your deliveries will appear here. Customer controls: view & track only."
              actionLabel="Browse"
              onAction={() => router.push("/(customer)/(tabs)/products")}
            />
          ) : gridColumns > 1 ? (
            <View style={styles.grid}>
              {orders.map((order) => (
                <View key={order.id} style={[styles.gridItem, { flexBasis: `${100 / gridColumns - 1}%` }]}>
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

          {orders.length > 0 ? <Text style={[styles.hint, { color: colors.textMuted }]}>Customer: tap to track. For changes contact support — admin handles status.</Text> : null}
        </ResponsiveContainer>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  titleBlock: { gap: 2, marginBottom: spacing.xs },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: typography.caption, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  gridItem: { marginBottom: spacing.md },
  list: { gap: spacing.md },
  hint: { fontSize: 11, textAlign: "center", marginTop: spacing.sm },
});
