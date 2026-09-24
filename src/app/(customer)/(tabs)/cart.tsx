import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../../providers/ThemeProvider";
import CartItemRow from "../../../components/cart/CartItem";
import Button from "../../../components/common/Button";
import EmptyState from "../../../components/common/EmptyState";
import ErrorState from "../../../components/common/ErrorState";
import LoadingState from "../../../components/common/LoadingState";
import ResponsiveContainer from "../../../components/common/ResponsiveContainer";
import spacing from "../../../constants/spacing";
import { useResponsive } from "../../../hooks/useResponsive";
import { useCart } from "../../../hooks/useCart";
import { formatCurrency } from "../../../utils/currency";
import { normalizeError } from "../../../utils/errorHandling";

export default function CustomerCartScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { items, summary, loading, loadError, setQuantity, removeItem, reload } = useCart();
  const [error, setError] = useState<string | null>(null);
  const { isDesktop } = useResponsive();

  const updateQuantity = async (itemId: string, quantity: number) => {
    setError(null);
    try {
      await setQuantity(itemId, quantity);
    } catch (nextError) {
      setError(normalizeError(nextError).message);
    }
  };

  const removeCartItem = async (itemId: string) => {
    setError(null);
    try {
      await removeItem(itemId);
    } catch (nextError) {
      setError(normalizeError(nextError).message);
    }
  };

  if (loading) return <LoadingState label="Loading your cart" />;

  if (loadError) {
    return (
      <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <ErrorState
          title="Could not load your cart"
          message={`${loadError}\n\nIf the database was just set up, tap Retry.`}
          onRetry={reload}
        />
      </View>
    );
  }

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md, paddingBottom: Math.max(insets.bottom, spacing.lg) + 24 }]}>
        <ResponsiveContainer>
          {/* In-content title — no top bar */}
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: colors.text }]}>Your Cart</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {items.length === 0 ? "No items yet" : `${items.length} ${items.length === 1 ? "item" : "items"} · soft and secure`}
            </Text>
          </View>

          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          {items.length === 0 ? (
            <EmptyState
              title="Your cart is empty"
              message="Add medicines from the catalogue to begin."
              actionLabel="Browse"
              onAction={() => router.push("/(customer)/(tabs)/products")}
            />
          ) : isDesktop ? (
            <View style={styles.desktopLayout}>
              <View style={styles.itemsColumn}>
                {items.map((item) => (
                  <CartItemRow key={item.id} item={item} onQuantity={(q) => updateQuantity(item.id, q)} onRemove={() => removeCartItem(item.id)} />
                ))}
              </View>
              <View style={styles.summaryColumn}>
                <View style={[styles.summaryBox, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
                  <Text style={[styles.summaryTitle, { color: colors.text }]}>Summary</Text>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Subtotal</Text>
                    <Text style={[styles.summaryValue, { color: colors.text }]}>{formatCurrency(summary.subtotal)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Discount</Text>
                    <Text style={[styles.summaryValue, { color: colors.success }]}>-{formatCurrency(summary.discount)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Delivery</Text>
                    <Text style={[styles.summaryValue, { color: colors.text }]}>{formatCurrency(summary.deliveryFee)}</Text>
                  </View>
                  <View style={[styles.summaryRow, styles.totalRow, { borderTopColor: colors.borderLight }]}>
                    <Text style={[styles.totalText, { color: colors.text }]}>Total</Text>
                    <Text style={[styles.totalText, { color: colors.text }]}>{formatCurrency(summary.total)}</Text>
                  </View>
                </View>
                <View style={styles.actionsRow}>
                  <View style={{ flex: 1 }}>
                    <Button title="Shop" variant="secondary" onPress={() => router.push("/(customer)/(tabs)/products")} fullWidth />
                  </View>
                  <View style={{ flex: 1.2 }}>
                    <Button title={`Checkout · ${formatCurrency(summary.total)}`} onPress={() => router.push("/(customer)/checkout")} disabled={items.length === 0} fullWidth />
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.mobileStack}>
              <View style={styles.itemsList}>
                {items.map((item) => (
                  <CartItemRow key={item.id} item={item} onQuantity={(q) => updateQuantity(item.id, q)} onRemove={() => removeCartItem(item.id)} />
                ))}
              </View>
              <View style={[styles.summaryBox, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
                <Text style={[styles.summaryTitle, { color: colors.text }]}>Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Subtotal</Text>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>{formatCurrency(summary.subtotal)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Discount</Text>
                  <Text style={[styles.summaryValue, { color: colors.success }]}>-{formatCurrency(summary.discount)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Delivery</Text>
                  <Text style={[styles.summaryValue, { color: colors.text }]}>{formatCurrency(summary.deliveryFee)}</Text>
                </View>
                <View style={[styles.summaryRow, styles.totalRow, { borderTopColor: colors.borderLight }]}>
                  <Text style={[styles.totalText, { color: colors.text }]}>Total</Text>
                  <Text style={[styles.totalText, { color: colors.text }]}>{formatCurrency(summary.total)}</Text>
                </View>
              </View>
              <View style={styles.actionsRow}>
                <View style={{ flex: 1 }}>
                  <Button title="Shop" variant="secondary" onPress={() => router.push("/(customer)/(tabs)/products")} fullWidth />
                </View>
                <View style={{ flex: 1.2 }}>
                  <Button title="Checkout" onPress={() => router.push("/(customer)/checkout")} disabled={items.length === 0} fullWidth />
                </View>
              </View>
            </View>
          )}
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
  subtitle: { fontSize: 12 },
  error: { fontSize: 12 },
  desktopLayout: { flexDirection: "row", gap: spacing.xl },
  itemsColumn: { flex: 2, gap: spacing.md },
  summaryColumn: { flex: 1, gap: spacing.md },
  mobileStack: { gap: spacing.lg },
  itemsList: { gap: spacing.md },
  summaryBox: { borderRadius: 16, borderWidth: 1, padding: spacing.lg, gap: spacing.xs },
  summaryTitle: { fontWeight: "700", fontSize: 14, marginBottom: spacing.sm },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xs },
  totalRow: { marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1 },
  totalText: { fontWeight: "800", fontSize: 14 },
  summaryLabel: { fontSize: 12 },
  summaryValue: { fontSize: 12, fontWeight: "600" },
  actionsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
});
