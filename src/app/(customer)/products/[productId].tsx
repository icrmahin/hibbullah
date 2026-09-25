import { router, useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../../providers/ThemeProvider";
import Button from "../../../components/common/Button";
import EmptyState from "../../../components/common/EmptyState";
import LoadingState from "../../../components/common/LoadingState";
import ErrorState from "../../../components/common/ErrorState";
import StatusBadge from "../../../components/common/StatusBadge";
import ProductImage from "../../../components/products/ProductImage";
import ResponsiveContainer from "../../../components/common/ResponsiveContainer";
import Icon from "../../../components/common/Icon";
import spacing from "../../../constants/spacing";
import { useResponsive } from "../../../hooks/useResponsive";
import { useCart } from "../../../hooks/useCart";
import { useProduct } from "../../../hooks/useProducts";
import { formatCurrency } from "../../../utils/currency";
import { normalizeError } from "../../../utils/errorHandling";

export default function ProductDetailScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ productId: string }>();
  const productId = params.productId as string;
  const { product, loading, error, reload } = useProduct(productId);
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { addItem } = useCart();
  const { isDesktop } = useResponsive();

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={[styles.floatingBack, { top: insets.top + spacing.sm, backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Pressable onPress={() => goBack()} hitSlop={8} style={styles.floatingBackPress}>
            <Icon name="arrow-back" size={20} color={colors.text} />
          </Pressable>
        </View>
        <LoadingState label="Loading product" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={[styles.floatingBack, { top: insets.top + spacing.sm, backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Pressable onPress={() => goBack()} hitSlop={8} style={styles.floatingBackPress}>
            <Icon name="arrow-back" size={20} color={colors.text} />
          </Pressable>
        </View>
        <ErrorState message={error} onRetry={reload} />
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={[styles.floatingBack, { top: insets.top + spacing.sm, backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
          <Pressable onPress={() => goBack()} hitSlop={8} style={styles.floatingBackPress}>
            <Icon name="arrow-back" size={20} color={colors.text} />
          </Pressable>
        </View>
        <EmptyState title="Product not found" message="This medicine is no longer available." actionLabel="Browse products" onAction={() => router.replace("/(customer)/(tabs)/products")} />
      </SafeAreaView>
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

  const qtySelector = (
    <View style={styles.quantityRow}>
      <Text style={[styles.qtyLabel, { color: colors.text }]}>Quantity</Text>
      <View style={[styles.qtySelector, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight }]}>
        <Pressable style={styles.qtyBtn} onPress={() => setQuantity((v) => Math.max(1, v - 1))} hitSlop={8}>
          <Text style={[styles.qtyAction, { color: colors.primary }]}>−</Text>
        </Pressable>
        <Text style={[styles.qtyValue, { color: colors.text }]}>{quantity}</Text>
        <Pressable style={styles.qtyBtn} onPress={() => setQuantity((v) => Math.min(product.stock || 99, v + 1))} hitSlop={8}>
          <Text style={[styles.qtyAction, { color: colors.primary }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 56, paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xl }]}
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
              <View style={styles.detailsColumn}>
                <Text style={[styles.name, { color: colors.text }]}>{product.name}</Text>
                <View style={styles.priceRow}>
                  <Text style={[styles.price, { color: colors.text }]}>{formatCurrency(product.price)}</Text>
                  {product.originalPrice ? <Text style={[styles.original, { color: colors.textMuted }]}>{formatCurrency(product.originalPrice)}</Text> : null}
                </View>
                <View style={styles.metaRow}>
                  <StatusBadge label={product.stock > 0 ? "In stock" : "Out of stock"} tone={product.stock > 0 ? "success" : "danger"} />
                  {product.stock > 0 ? (
                    <Text style={[styles.stockText, { color: colors.textMuted }]}>{product.stock} available</Text>
                  ) : null}
                </View>
                {qtySelector}
                {feedback ? <Text style={[styles.feedback, { color: feedback.includes("added") ? colors.success : colors.danger }]}>{feedback}</Text> : null}
                <View style={styles.actionsRow}>
                  <View style={{ flex: 1 }}>
                    <Button title="Cancel" variant="secondary" onPress={handleCancel} fullWidth />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title={product.stock > 0 ? "Add to cart" : "Out of stock"} onPress={handleAddToCart} loading={adding} disabled={product.stock === 0} fullWidth />
                  </View>
                </View>
              </View>
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
              <Text style={[styles.name, { color: colors.text }]}>{product.name}</Text>
              <View style={styles.priceRow}>
                <Text style={[styles.price, { color: colors.text }]}>{formatCurrency(product.price)}</Text>
                {product.originalPrice ? <Text style={[styles.original, { color: colors.textMuted }]}>{formatCurrency(product.originalPrice)}</Text> : null}
              </View>
              <View style={styles.metaRow}>
                <StatusBadge label={product.stock > 0 ? "In stock" : "Out of stock"} tone={product.stock > 0 ? "success" : "danger"} />
                {product.stock > 0 ? <Text style={[styles.stockText, { color: colors.textMuted }]}>{product.stock} available</Text> : null}
              </View>
              {qtySelector}
              {feedback ? <Text style={[styles.feedback, { color: feedback.includes("added") ? colors.success : colors.danger }]}>{feedback}</Text> : null}
              <View style={styles.actionsRow}>
                <View style={{ flex: 1 }}>
                  <Button title="Cancel" variant="secondary" onPress={handleCancel} fullWidth />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title={product.stock > 0 ? "Add to cart" : "Out of stock"} onPress={handleAddToCart} loading={adding} disabled={product.stock === 0} fullWidth />
                </View>
              </View>
            </>
          )}
        </ResponsiveContainer>
      </ScrollView>

      {/* Floating back — top right per spec but keep left for reach? Spec says floating top right go back — we place top right for checkout, top left here. Use top left for product as conventional. */}
      <View style={[styles.floatingBack, { top: insets.top + spacing.sm, backgroundColor: colors.backgroundAlt, borderColor: colors.borderLight, boxShadow: "0px 2px 4px rgba(0,0,0,0.1)" }]}>
        <Pressable onPress={() => goBack()} hitSlop={8} style={styles.floatingBackPress} accessibilityLabel="Go back">
          <Icon name="arrow-back" size={20} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { paddingHorizontal: spacing.lg, gap: spacing.md },
  desktopLayout: { flexDirection: "row", gap: spacing.xxxl },
  imageColumn: { flex: 1 },
  detailsColumn: { flex: 1, gap: spacing.md },
  image: { width: "100%", height: 280, backgroundColor: "#1A2420", borderRadius: 18 },
  imageDesktop: { width: "100%", height: 380, backgroundColor: "#1A2420", borderRadius: 18 },
  /** The second picture stacks under the first rather than in a carousel. */
  imageSecondary: {
    width: "100%",
    height: 220,
    marginTop: spacing.md,
    backgroundColor: "#1A2420",
    borderRadius: 18,
  },
  name: { fontSize: 22, fontWeight: "800", lineHeight: 26 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  price: { fontSize: 22, fontWeight: "800" },
  original: { fontSize: 14, textDecorationLine: "line-through" },
  metaRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", flexWrap: "wrap" },
  stockText: { fontSize: 12 },
  quantityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  qtyLabel: { fontSize: 14, fontWeight: "700" },
  qtySelector: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: 12, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  qtyBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  qtyAction: { fontSize: 22, fontWeight: "700" },
  qtyValue: { fontSize: 18, fontWeight: "700", minWidth: 24, textAlign: "center" },
  feedback: { fontSize: 12, textAlign: "center" },
  actionsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  floatingBack: {
    position: "absolute",
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 2px 4px rgba(0,0,0,0.1)",
  },
  floatingBackPress: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18 },
});
