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

/**
 * The product card, drawn for a 167px column.
 *
 * Two cards to a phone screen, which is the smallest width this has to look deliberate at,
 * and that number is what every decision below is measured against. The card used to run
 * about 315px tall there — nearly half the viewport for a single product — because a square
 * image sat under a name, a generic line, a price row that wrapped, a full sentence about
 * stock, and a 36px full-width button whose "Add to cart" label had roughly 150px to sit
 * in. It now runs about 255px, and the height came off the redundant rows rather than off
 * the photograph, which is the one part that was earning its space.
 *
 * Three things moved onto the image, where there was already room:
 *
 *   * the stock line was a sentence ("24 in stock") on its own row, which at 167px is the
 *     widest line on the card and its least useful. It is a pill on the photo now.
 *   * the add button was full width, so the label had to shrink until it was barely the
 *     label. It is a floating button, and the accessibility label still says what it is.
 *   * the out-of-stock state was a centred uppercase word *and* the stock line saying the
 *     same thing. One of the two had to go; the scrim stayed, because a greyed-out
 *     photograph is a thing people understand without reading.
 *
 * The soft-UI part is the recessed well the photo sits in, the two floating controls that
 * cast their own soft shadow above it, and a press that flattens the card's shadow rather
 * than fading it — pressing something should look like pushing it, which is the one cue
 * that separates soft UI from a flat rectangle with a border.
 */
function ProductCard({ product, compact, onPress }: ProductCardProps) {
  const colors = useThemeColors();
  const shadows = useShadows();
  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [adding, setAdding] = useState(false);
  const [pressed, setPressed] = useState(false);
  const fav = isFavorite(product.id);

  const outOfStock = product.stock === 0;
  const lowStock = product.stock > 0 && product.stock <= config.lowStockThreshold;
  const discount = product.discountPercent ?? 0;
  const showsOriginal = !outOfStock && product.originalPrice != null && product.originalPrice > product.price;

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

  const stockTint = outOfStock ? colors.danger : lowStock ? colors.warning : colors.success;

  return (
    <View
      style={[
        styles.card,
        compact && styles.compact,
        {
          backgroundColor: colors.backgroundAlt,
          borderColor: colors.borderSoft,
          // Pressing flattens the lift rather than fading the card. It is the one cue that
          // makes a soft surface read as pressable, and it costs one style swap.
          ...(pressed ? shadows.none : shadows.sm),
        },
      ]}
    >
      <View style={[styles.imageWrap, { backgroundColor: colors.background }]}>
        <ProductImage
          uri={product.image || product.primaryImage}
          recyclingKey={product.id}
          style={styles.image}
          contentFit="contain"
        />

        {/*
          Navigation overlay — a sibling of the two controls below, never their parent, so
          the card never renders a button inside a button.
        */}
        <Pressable
          onPress={() => onPress?.(product)}
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={`View ${product.name} details`}
        />

        {/* Out of stock: a scrim, not a caption. The stock pill below says the same words. */}
        {outOfStock ? (
          <View
            style={[styles.outScrim, { backgroundColor: colors.backgroundAlt, opacity: 0.86 }]}
            pointerEvents="none"
          />
        ) : null}

        {!outOfStock ? (
          <View style={[styles.stockPill, { backgroundColor: colors.backgroundAlt, borderColor: colors.borderSoft }]}>
            <View style={[styles.dot, { backgroundColor: stockTint }]} />
            <Text style={[styles.stockText, { color: lowStock ? colors.warning : colors.textMuted }]} numberOfLines={1}>
              {lowStock ? `Only ${product.stock} left` : `${product.stock} in stock`}
            </Text>
          </View>
        ) : null}

        {/* Add to cart, floating on the photo. A 32px target with a 6px hitSlop is 44px. */}
        <Pressable
          onPress={handleAdd}
          disabled={outOfStock}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={outOfStock ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
          style={({ pressed: down }) => [
            styles.addFab,
            {
              backgroundColor: outOfStock ? colors.borderSoft : colors.primary,
              borderColor: outOfStock ? colors.borderLight : colors.borderSoft,
              opacity: outOfStock ? 0.7 : down ? 0.85 : 1,
              transform: [{ scale: down && !outOfStock ? 0.94 : 1 }],
              ...shadows.md,
            },
          ]}
        >
          <Icon
            name={outOfStock || adding ? "block" : "add-shopping-cart"}
            size={15}
            color={outOfStock ? colors.textMuted : colors.white}
          />
        </Pressable>

        {/* Favourite, above the add button in the same corner stack. */}
        <Pressable
          onPress={handleFav}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={fav ? `Remove ${product.name} from favorites` : `Add ${product.name} to favorites`}
          style={({ pressed: down }) => [
            styles.favPill,
            {
              backgroundColor: fav ? colors.danger : colors.backgroundAlt,
              borderColor: fav ? colors.danger : colors.borderSoft,
              opacity: down ? 0.85 : 1,
              ...shadows.md,
            },
          ]}
        >
          <Icon name={fav ? "favorite" : "favorite-border"} size={13} color={fav ? colors.white : colors.textMuted} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => onPress?.(product)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
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

          {/*
            One line, always. It was `flexWrap: "wrap"`, which at 167px means a price, a
            strikethrough original and a discount badge do not fit side by side and the row
            becomes two — so the cards in a row came out different heights and the grid looked
            broken rather than ragged. Truncating is the lesser cost.
          */}
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.text }]} numberOfLines={1}>
              {formatCurrency(product.price)}
            </Text>
            {showsOriginal ? (
              <Text style={[styles.original, { color: colors.textMuted }]} numberOfLines={1}>
                {formatCurrency(product.originalPrice as number)}
              </Text>
            ) : null}
            {discount > 0 && !outOfStock ? (
              <View style={[styles.discountBadge, { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.discountText, { color: colors.accent }]}>-{discount}%</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
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
  /**
   * The photo sits in a well one step back from the card — `background` under
   * `backgroundAlt` — instead of in a second rounded rectangle 4px inside the first. The old
   * inset was `padding: 4` with `radius.lg` on the image inside a `radius.xl` card, and two
   * rounded rectangles that close together read as a mistake rather than as depth. The well
   * gets the depth for free and hands back 8px.
   */
  imageWrap: {
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  favPill: {
    position: "absolute",
    top: spacing.xs + 2,
    right: spacing.xs + 2,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  outScrim: {
    ...StyleSheet.absoluteFill,
  },
  /**
   * The two floating controls share a corner, so they get a corner stack rather than two
   * independent `top`/`right` pairs that drift apart the moment either size changes.
   */
  addFab: {
    position: "absolute",
    right: spacing.xs + 2,
    bottom: spacing.xs + 2,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  stockPill: {
    position: "absolute",
    left: spacing.xs + 2,
    bottom: spacing.xs + 2,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingLeft: 6,
    paddingRight: spacing.sm,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    zIndex: 1,
  },
  dot: { width: 5, height: 5, borderRadius: radius.pill },
  stockText: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.tiny,
  },
  content: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  name: {
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * 1.3,
    // Reserved rather than grown, so two cards in a row stay the same height whatever their
    // names are.
    minHeight: 34,
  },
  generic: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.tiny,
    lineHeight: fontSize.tiny * 1.3,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  price: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.bodySmall,
    lineHeight: fontSize.bodySmall * 1.2,
  },
  original: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.tiny,
    textDecorationLine: "line-through",
    flexShrink: 1,
  },
  discountBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  discountText: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.tiny,
  },
});

export default memo(ProductCard);
