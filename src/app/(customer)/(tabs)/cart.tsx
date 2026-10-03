import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../../providers/ThemeProvider";
import CartItemRow from "../../../components/cart/CartItem";
import Button from "../../../components/common/Button";
import EmptyState from "../../../components/common/EmptyState";
import ErrorState from "../../../components/common/ErrorState";
import LoadingState from "../../../components/common/LoadingState";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import spacing from "../../../constants/spacing";
import config from "../../../constants/config";
import { useResponsive } from "../../../hooks/useResponsive";
import { useBottomInset } from "../../../hooks/useBottomInset";
import { useCart } from "../../../hooks/useCart";
import { formatCurrency } from "../../../utils/currency";
import { normalizeError } from "../../../utils/errorHandling";
import { radius } from "../../../constants/sizes";
import { fontFamily, fontSize, lineHeight } from "../../../constants/typography";

export default function CustomerCartScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
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

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Your Cart" />}>
        <LoadingState label="Loading your cart" />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen header={<ScreenHeader title="Your Cart" />}>
        <ErrorState
          title="Could not load your cart"
          message={`${loadError}\n\nIf the database was just set up, tap Retry.`}
          onRetry={reload}
        />
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen header={<ScreenHeader title="Your Cart" subtitle="No items yet" />}>
        <EmptyState
          title="Your cart is empty"
          message="Add medicines from the catalogue to begin."
          actionLabel="Browse"
          onAction={() => router.push("/(customer)/(tabs)/products")}
          icon="shopping-cart"
        />
      </Screen>
    );
  }

  // One money block for both layouts: this used to be the same box copy-pasted into the
  // desktop and the mobile branch, two of everything that had to change in step.
  //
  // It is not `CartSummary` because this box has two rows that component cannot draw —
  // the delivery row and the note underneath it saying the fee is flat and Dhaka-only.
  const summaryCard = (
    <View style={[styles.summaryBox, { backgroundColor: colors.backgroundAlt }]}>
      <Text style={[styles.summaryTitle, { color: colors.text }]}>Summary</Text>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Subtotal</Text>
        <Text style={[styles.summaryValue, { color: colors.text }]}>
          {formatCurrency(summary.subtotal)}
        </Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Discount</Text>
        <Text style={[styles.summaryValue, { color: colors.success }]}>
          -{formatCurrency(summary.discount)}
        </Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Delivery</Text>
        <Text style={[styles.summaryValue, { color: colors.text }]}>
          {formatCurrency(summary.deliveryFee)}
        </Text>
      </View>
      <Text style={[styles.summaryNote, { color: colors.textMuted }]}>
        Flat {formatCurrency(config.deliveryFees.insideDhaka)} delivery · Dhaka only for now.
      </Text>
      <View style={[styles.summaryRow, styles.totalRow, { borderTopColor: colors.borderSoft }]}>
        <Text style={[styles.totalText, { color: colors.text }]}>Total</Text>
        <Text style={[styles.totalText, { color: colors.text }]}>{formatCurrency(summary.total)}</Text>
      </View>
    </View>
  );

  return (
    <Screen
      header={
        <ScreenHeader
          title="Your Cart"
          subtitle={`${items.length} ${items.length === 1 ? "item" : "items"} · soft and secure`}
        />
      }
    >
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}>
        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        {isDesktop ? (
          <View style={styles.desktopLayout}>
            <View style={styles.itemsColumn}>
              {items.map((item) => (
                <CartItemRow key={item.id} item={item} onQuantity={(q) => updateQuantity(item.id, q)} onRemove={() => removeCartItem(item.id)} />
              ))}
            </View>
            <View style={styles.summaryColumn}>
              {summaryCard}
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
            {summaryCard}
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
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg },
  error: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  desktopLayout: { flexDirection: "row", gap: spacing.xl },
  itemsColumn: { flex: 2, gap: spacing.md },
  summaryColumn: { flex: 1, gap: spacing.md },
  mobileStack: { gap: spacing.lg },
  itemsList: { gap: spacing.md },
  summaryBox: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  summaryTitle: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: -0.2,
    marginBottom: spacing.xs,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  summaryValue: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  summaryNote: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  totalRow: { marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1 },
  totalText: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: -0.2,
  },
  actionsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
});
