import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../../providers/ThemeProvider";
import CartItemRow from "../../../components/cart/CartItem";
import CartSummary from "../../../components/cart/CartSummary";
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

  // One money block for both layouts: the four money rows are the shared
  // `CartSummary` (the same block checkout renders), wrapped here with the
  // cart's own title and the flat-fee note. Discount reads in text colour
  // with its minus sign everywhere — the one place it was success-green now
  // matches checkout and order detail.
  const summaryCard = (
    <View style={styles.summaryWrap}>
      <Text style={[styles.summaryTitle, { color: colors.text }]}>Summary</Text>
      <CartSummary summary={summary} />
      <Text style={[styles.summaryNote, { color: colors.textMuted }]}>
        Flat {formatCurrency(config.deliveryFees.insideDhaka)} delivery · Dhaka only for now.
      </Text>
    </View>
  );

  // Checkout dominates; continuing to shop stays available but quiet.
  // One shared column for both layouts so the hierarchy cannot drift.
  const actions = (
    <View style={styles.actionsColumn}>
      <Button
        title={isDesktop ? `Checkout · ${formatCurrency(summary.total)}` : "Checkout"}
        onPress={() => router.push("/(customer)/checkout")}
        disabled={items.length === 0}
        fullWidth
      />
      <Button
        title="Continue shopping"
        variant="ghost"
        onPress={() => router.push("/(customer)/(tabs)/products")}
        fullWidth
      />
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
              {items.map((item, index) => (
                <CartItemRow key={item.id} item={item} onQuantity={(q) => updateQuantity(item.id, q)} onRemove={() => removeCartItem(item.id)} isLast={index === items.length - 1} />
              ))}
            </View>
            <View style={styles.summaryColumn}>
              {summaryCard}
              {actions}
            </View>
          </View>
        ) : (
          <View style={styles.mobileStack}>
            <View style={styles.itemsList}>
              {items.map((item, index) => (
                <CartItemRow key={item.id} item={item} onQuantity={(q) => updateQuantity(item.id, q)} onRemove={() => removeCartItem(item.id)} isLast={index === items.length - 1} />
              ))}
            </View>
            {summaryCard}
            {actions}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg },
  error: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  desktopLayout: { flexDirection: "row", gap: spacing.xl },
  itemsColumn: { flex: 2 },
  summaryColumn: { flex: 1, gap: spacing.md },
  mobileStack: { gap: spacing.lg, flex: 1 },
  itemsList: {},
  summaryWrap: { gap: spacing.sm },
  summaryTitle: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    letterSpacing: -0.2,
    marginBottom: spacing.xs,
  },
  summaryNote: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
  },
  actionsColumn: { gap: spacing.sm },
});
