import { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import spacing from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { radius } from "../../constants/sizes";
import type { Product } from "../../types/product";
import ProductImage from "./ProductImage";
import DiscountBadge from "./DiscountBadge";
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
 * The product card, drawn for a ~167px column.
 *
 * Two cards to a phone screen, which is the smallest width this has to look deliberate at,
 * and that number is what every decision below is measured against. The card used to run
 * about 315px tall there — nearly half the viewport for a single product — because a square
 * image sat under a name, a generic line, a price row that wrapped, a full sentence about
 * stock, and a 36px full-width button whose "Add to cart" label had roughly 150px to sit
 * in. The height came off the redundant rows rather than off the photograph, which is the
 * one part that was earning its space.
 *
 * What is *not* on the card is policy rather than omission: the pharmacy does not publish
 * stock levels to customers, so there is no count, no "In stock", no "Only a few left" and
 * no out-of-stock scrim. An unavailable product is one whose add button is disabled, and
 * that disabled state has to carry the meaning on its own.
 *
 * Visually it is the app's card rule: white on the off-white page, no border, no shadow —
 * the lightness step is the separation, and a hairline around every card in a two-column
 * grid is edge noise at this density. The photograph sits in a well one step back from the
 * card (`background` under `backgroundAlt`) so the image has a stage without a second
 * rounded rectangle inside the first. Press feedback is a small opacity dip on the card
 * plus the scale on the floating controls.
 */
function ProductCard({ product, compact, onPress }: ProductCardProps) {
  const colors = useThemeColors();
  const { addItem } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [adding, setAdding] = useState(false);
  const [pressed, setPressed] = useState(false);
  const fav = isFavorite(product.id);

  const outOfStock = product.stock === 0;

  /**
   * The reduction the two prices prove, in percent — and nothing else.
   *
   * `discountPercent` on the row is the *admin's* figure and it is allowed to disagree
   * with the prices (a row can sit at price = original with a percentage still attached,
   * which is a data problem to fix, not a claim to publish). So the badge and the
   * strikethrough both hang off the same condition — the original being strictly higher
   * than what the customer pays — and the percentage is derived from those two numbers.
   *
   * Two consequences that matter: a row with a stale percentage and an unchanged price
   * shows no badge at all rather than "-10%" beside an unchanged price, and if the number
   * is ever restated the badge follows the prices by itself. Same rule the cart uses in
   * `sumBasket`, so the card and the total can never disagree about what was saved.
   */
  const original = product.originalPrice;
  const showsOriginal = !outOfStock && original != null && original > product.price;
  const offPercent = showsOriginal ? Math.round((1 - product.price / original) * 100) : 0;

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
          opacity: pressed ? 0.92 : 1,
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

        {/*
          The discount badge lives here rather than in the price row for two reasons. It
          has to be readable at a glance before any text, and in the price row it was the
          third thing competing for 150px of width — which is why the row had to truncate
          and why the cards in a row came out different heights. Top-left is the only free
          corner: favourite is top-right, add-to-cart is bottom-right.
        */}
        <DiscountBadge percent={offPercent} />

        {/*
          No stock indicator. The scrim and the pill that used to sit here are both gone:
          a greyed-out photograph and a coloured dot reading "In stock" are stock signals,
          and the pharmacy does not publish stock levels to customers. What is left is the
          add button below, which is disabled when the product cannot be bought — the only
          thing on the card that depends on stock, and a purchase control rather than a
          readout. Its disabled styling carries the meaning, so it stays legible.
        */}

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
              backgroundColor: outOfStock ? colors.backgroundAlt : colors.primary,
              borderColor: outOfStock ? colors.borderLight : colors.borderSoft,
              opacity: outOfStock ? 0.7 : down ? 0.85 : 1,
              transform: [{ scale: down && !outOfStock ? 0.94 : 1 }],
            },
          ]}
        >
          <Icon
            name={outOfStock || adding ? "block" : "add-shopping-cart"}
            size={15}
            // `textInverse`, not `white`: the primary fill is deep teal in light mode and
            // light sage in dark, so its glyph has to invert with it.
            color={outOfStock ? colors.textMuted : colors.textInverse}
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
              borderColor: fav ? colors.danger : colors.borderLight,
              opacity: down ? 0.85 : 1,
            },
          ]}
        >
          <Icon
            name={fav ? "favorite" : "favorite-border"}
            size={13}
            color={fav ? colors.textInverse : colors.textMuted}
          />
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
          {/*
            Two things on this line now, where there used to be three. What you pay first
            and largest; what it used to cost struck through beside it, and only when it is
            genuinely higher. The percentage moved to the corner of the photograph, so the
            row fits at 167px without truncating and both figures stay whole.
          */}
          <View style={styles.priceRow}>
            <Text
              style={[
                styles.price,
                { color: showsOriginal ? colors.accent : colors.text },
              ]}
              numberOfLines={1}
            >
              {formatCurrency(product.price)}
            </Text>
            {showsOriginal ? (
              <Text style={[styles.original, { color: colors.textMuted }]} numberOfLines={1}>
                {formatCurrency(original as number)}
              </Text>
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
  content: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xxs,
  },
  name: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.tight,
    // Reserved rather than grown, so two cards in a row stay the same height whatever their
    // names are.
    minHeight: 38,
  },
  generic: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.normal,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  /**
   * One step above the product name, because on a card whose whole job is "what does this
   * cost" the price is the figure people scan for. The name stays the largest piece of
   * *text* through its weight and its reserved two lines; the price wins on size alone.
   */
  price: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * lineHeight.tight,
  },
  original: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.tiny,
    textDecorationLine: "line-through",
    flexShrink: 1,
  },
});

export default memo(ProductCard);
