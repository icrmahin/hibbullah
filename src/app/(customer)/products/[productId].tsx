import { router, useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../../providers/ThemeProvider";
import Screen from "../../../components/common/Screen";
import ScreenHeader from "../../../components/common/ScreenHeader";
import Button from "../../../components/common/Button";
import EmptyState from "../../../components/common/EmptyState";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import ProductImage from "../../../components/products/ProductImage";
import ResponsiveContainer from "../../../components/common/ResponsiveContainer";
import QuantitySelector from "../../../components/cart/QuantitySelector";
import spacing from "../../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../../constants/typography";
import { radius } from "../../../constants/sizes";
import { useResponsive } from "../../../hooks/useResponsive";
import { useBottomInset } from "../../../hooks/useBottomInset";
import { useCart } from "../../../hooks/useCart";
import { useProduct } from "../../../hooks/useProducts";
import { formatCurrency } from "../../../utils/currency";
import { normalizeError } from "../../../utils/errorHandling";

export default function ProductDetailScreen() {
  const colors = useThemeColors();
  const bottomInset = useBottomInset();
  const params = useLocalSearchParams<{ productId: string }>();
  const productId = params.productId as string;
  const { product, loading, error, reload } = useProduct(productId);
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { addItem, items } = useCart();
  const { isDesktop } = useResponsive();

  if (loading) {
    return (
      <Screen header={<ScreenHeader title="" onBack={() => goBack()} />}>
        <LoadingState label="Loading product" />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen header={<ScreenHeader title="" onBack={() => goBack()} />}>
        <ErrorState message={error} onRetry={reload} />
      </Screen>
    );
  }

  if (!product) {
    return (
      <Screen header={<ScreenHeader title="" onBack={() => goBack()} />}>
        <EmptyState title="Product not found" message="This medicine is no longer available." actionLabel="Browse products" onAction={() => router.replace("/(customer)/(tabs)/products")} />
      </Screen>
    );
  }

  const handleAddToCart = async () => {
    setAdding(true);
    setFeedback(null);
    try {
      await addItem(product.id, quantity);
      setFeedback(`${product.name} added to your cart.`);
    } catch (e) {
      setFeedback(normalizeError(e).message);
    } finally {
      setAdding(false);
    }
  };

  const handleCancel = () => goBack();

  // "You have 3 in the cart" — only when this product is already in the cart, so a returning
  // customer sees their un-ordered quantity before tapping Add again.
  const cartItem = items.find((i) => i.productId === productId || i.product?.id === productId);
  const cartHint = cartItem && cartItem.quantity > 0 ? (
    <View style={[styles.cartHint, { backgroundColor: colors.successSoft, borderColor: colors.successBorder }]}>
      <Text style={[styles.cartHintText, { color: colors.success }]}>You have {cartItem.quantity} in the cart</Text>
    </View>
  ) : null;

  const qtySelector = (
    <View style={styles.quantityRow}>
      <Text style={[styles.qtyLabel, { color: colors.text }]}>Quantity</Text>
      <QuantitySelector value={quantity} onChange={setQuantity} min={1} max={product.stock || 99} />
    </View>
  );

  // One render of the name, price, quantity and actions, shared by the wide and the
  // stacked layout — only the image column beside it differs by width.
  const details = (
    <>
      <Text style={[styles.name, { color: colors.text }]}>{product.name}</Text>
      <View style={styles.priceRow}>
        <Text style={[styles.price, { color: colors.text }]}>{formatCurrency(product.price)}</Text>
        {product.originalPrice ? <Text style={[styles.original, { color: colors.textMuted }]}>{formatCurrency(product.originalPrice)}</Text> : null}
      </View>
      {/*
        No stock readout here. This row used to carry a badge reading "In stock"
        or "Out of stock" plus a low-stock hint, and both are gone: the pharmacy
        does not publish stock levels to customers. The quantity selector and the
        add button below are the parts that depend on stock, and they are controls
        rather than information — which is why the button's label still changes to
        "Out of stock" when the product cannot be bought. A disabled button with
        no stated reason is worse than a stock line, so that one stays.
      */}
      {qtySelector}
      {feedback ? <Text style={[styles.feedback, { color: feedback.includes("added") ? colors.success : colors.danger }]}>{feedback}</Text> : null}
      {cartHint}
      <View style={styles.actionsRow}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" variant="secondary" onPress={handleCancel} fullWidth />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={product.stock > 0 ? "Add to cart" : "Out of stock"} onPress={handleAddToCart} loading={adding} disabled={product.stock === 0} fullWidth />
        </View>
      </View>
    </>
  );

  return (
    <Screen header={<ScreenHeader title="" onBack={() => goBack()} />}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <ResponsiveContainer maxWidth={isDesktop ? 960 : 1320}>
          {isDesktop ? (
            <View style={styles.desktopLayout}>
              <View style={styles.imageColumn}>
                <ProductImage uri={product.image} recyclingKey={product.id} style={styles.imageDesktop} />
                {product.secondaryImage ? (
                  <ProductImage
                    uri={product.secondaryImage}
                    recyclingKey={`${product.id}-2`}
                    style={styles.imageSecondary}
                  />
                ) : null}
              </View>
              <View style={styles.detailsColumn}>{details}</View>
            </View>
          ) : (
            <>
              <ProductImage uri={product.image} recyclingKey={product.id} style={styles.image} />
              {product.secondaryImage ? (
                <ProductImage
                  uri={product.secondaryImage}
                  recyclingKey={`${product.id}-2`}
                  style={styles.imageSecondary}
                />
              ) : null}
              {details}
            </>
          )}
        </ResponsiveContainer>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.lg, gap: spacing.md },
  desktopLayout: { flexDirection: "row", gap: spacing.xxxl },
  imageColumn: { flex: 1 },
  detailsColumn: { flex: 1, gap: spacing.md },
  // The placeholder behind a product photo. `imageSlot` rather than a hex literal, which
  // was `#1A2420` — a dark *dark-mode* surface baked into a style that both themes use, so
  // light mode showed a near-black rectangle behind every product with no photo.
  image: { width: "100%", height: 280, borderRadius: radius.xl },
  imageDesktop: { width: "100%", height: 380, borderRadius: radius.xl },
  /** The second picture stacks under the first rather than in a carousel. */
  imageSecondary: {
    width: "100%",
    height: 220,
    marginTop: spacing.md,
    borderRadius: radius.xl,
  },
  name: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.title2,
    lineHeight: fontSize.title2 * lineHeight.tight,
    letterSpacing: -0.2,
  },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  price: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.title2,
    lineHeight: fontSize.title2 * lineHeight.tight,
  },
  original: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
    textDecorationLine: "line-through",
  },
  quantityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  qtyLabel: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
  },
  feedback: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.caption,
    lineHeight: fontSize.caption * lineHeight.normal,
    textAlign: "center",
  },
  cartHint: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
  cartHintText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  actionsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
});
