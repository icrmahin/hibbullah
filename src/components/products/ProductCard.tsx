import { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import spacing from "../../constants/spacing";
import config from "../../constants/config";
import { fontFamily, fontSize } from "../../constants/typography";
import { radius } from "../../constants/sizes";
import type { Product } from "../../types/product";
import ProductImage from "./ProductImage";
import Icon from "../common/Icon";
import { formatCurrency } from "../../utils/currency";
import { useCart } from "../../providers/CartProvider";
import { useFavorites } from "../../providers/FavoritesProvider";

type ProductCardProps = {
  product: Product;
  compact?: boolean;
  onPress?: (product: Product) => void;
};

function ProductCard({ product, compact, onPress }: ProductCardProps) {
  const colors = useThemeColors();
  const shadows = useShadows();
  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [adding, setAdding] = useState(false);
  const fav = isFavorite(product.id);

  const outOfStock = product.stock === 0;
  const lowStock = product.stock > 0 && product.stock <= config.lowStockThreshold;
  const discount = product.discountPercent ?? 0;

  const handleAdd = async () => {
    if (outOfStock || adding) return;
    setAdding(true);
    try {
      await addItem(product.id, 1);
    } catch {
      // silent
    } finally {
      setAdding(false);
    }
  };

  const handleFav = async () => {
    try {
      await toggleFavorite(product.id);
    } catch {}
  };

  return (
    <View
      style={[
        styles.card,
        compact && styles.compact,
        {
          backgroundColor: colors.backgroundAlt,
          borderColor: colors.borderSoft,
          ...shadows.sm,
        },
      ]}
    >
      {/* One solid background — image and details share same card backgroundAlt, nested compact */}
      <View style={[styles.imageWrap, { backgroundColor: colors.backgroundAlt }]}>
        <ProductImage uri={product.image || product.primaryImage} recyclingKey={product.id} style={styles.image} contentFit="contain" />
        {/* Overlay Pressable for navigation — sibling to fav pill, not parent, avoids <button><button> */}
        <Pressable
          onPress={() => onPress?.(product)}
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={`View ${product.name} details`}
        />
        {/* Favorite pill — absolute top-right, above overlay */}
        <Pressable
          onPress={handleFav}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={fav ? `Remove ${product.name} from favorites` : `Add ${product.name} to favorites`}
          style={({ pressed }) => [
            styles.favPill,
            {
              backgroundColor: fav ? colors.danger : colors.backgroundAlt,
              borderColor: fav ? colors.danger : colors.borderLight,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Icon name={fav ? "favorite" : "favorite-border"} size={14} color={fav ? colors.white : colors.textMuted} />
        </Pressable>
        {outOfStock ? (
          <View style={[styles.outOverlay, { backgroundColor: colors.backgroundAlt + "CC" }]} pointerEvents="none">
            <Text style={[styles.outText, { color: colors.text }]}>Out of stock</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={() => onPress?.(product)}
        style={styles.contentPressable}
        accessibilityRole="button"
        accessibilityLabel={`View ${product.name} details`}
      >
        <View style={styles.content}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
            {product.name}
          </Text>

          {product.genericName ? (
            <Text style={[styles.generic, { color: colors.textMuted }]} numberOfLines={1}>
              {product.genericName}
            </Text>
          ) : null}

          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.text }]} numberOfLines={1}>
              {formatCurrency(product.price)}
            </Text>
            {product.originalPrice && product.originalPrice > product.price ? (
              <Text style={[styles.original, { color: colors.textMuted }]} numberOfLines={1}>
                {formatCurrency(product.originalPrice)}
              </Text>
            ) : null}
            {discount > 0 ? (
              <View style={[styles.discountBadge, { backgroundColor: colors.primarySoft, borderColor: colors.primary + "22" }]}>
                <Text style={[styles.discountText, { color: colors.primary }]}>-{discount}%</Text>
              </View>
            ) : null}
          </View>

          {/* Stock indicator dot + text */}
          <View style={styles.stockRow}>
            <View
              style={[
                styles.dot,
                { backgroundColor: outOfStock ? colors.danger : lowStock ? colors.warning : colors.success },
              ]}
            />
            <Text
              style={[
                styles.stockText,
                { color: outOfStock ? colors.danger : lowStock ? colors.warning : colors.textMuted },
              ]}
              numberOfLines={1}
            >
              {outOfStock ? "Out of stock" : lowStock ? `Only ${product.stock} left` : `${product.stock} in stock`}
            </Text>
          </View>
        </View>
      </Pressable>

      {/* Full-width pill Add to cart — not icon */}
      <View style={styles.addWrap}>
        <Pressable
          onPress={handleAdd}
          disabled={outOfStock || adding}
          accessibilityRole="button"
          accessibilityLabel={`Add ${product.name} to cart`}
          style={({ pressed }) => [
            styles.addButton,
            {
              backgroundColor: outOfStock ? colors.borderLight : colors.primary,
              borderColor: outOfStock ? colors.borderLight : colors.primary,
              opacity: outOfStock ? 0.6 : pressed ? 0.88 : 1,
            },
          ]}
        >
          <Icon name={outOfStock ? "block" : "add-shopping-cart"} size={14} color={outOfStock ? colors.textMuted : colors.white} />
          <Text style={[styles.addText, { color: outOfStock ? colors.textMuted : colors.white }]}>
            {adding ? "Adding..." : outOfStock ? "Out of stock" : "Add to cart"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  compact: { marginBottom: 0 },
  contentPressable: { flex: 1 },
  // One solid nested card — image and details share same background, compact padding
  imageWrap: {
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xs,
    backgroundColor: "transparent",
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: radius.lg,
  },
  favPill: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    boxShadow: "0px 2px 4px rgba(0,0,0,0.08)",
  },
  outOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  outText: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.caption,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  content: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  name: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * 1.35,
    minHeight: 36,
  },
  generic: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * 1.3,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
    flexWrap: "wrap",
  },
  price: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.callout,
    lineHeight: fontSize.callout * 1.2,
  },
  original: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.micro,
    textDecorationLine: "line-through",
  },
  discountBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  discountText: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.micro,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  stockText: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.micro,
  },
  addWrap: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, paddingTop: spacing.xs },
  addButton: {
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  addText: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.footnote,
  },
});

export default memo(ProductCard);
