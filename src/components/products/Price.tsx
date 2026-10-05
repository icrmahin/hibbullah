import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { formatCurrency } from "../../utils/currency";

type PriceProps = {
  price: number;
  /** Shown struck through only when genuinely higher than `price`. */
  originalPrice?: number;
  /** `card` for grids and rows (17/10), `large` for detail headers (20/13). */
  size?: "card" | "large";
  style?: ViewStyle;
  numberOfLines?: number;
};

/**
 * The one price rendering. What you pay first and largest; what it used to
 * cost struck through beside it, and only when it is genuinely higher — the
 * percentage lives on the `DiscountBadge`, never in this row.
 *
 * A discounted price is the accent ink, a plain price is body text: price is
 * the figure people scan for, so the saving reads before any label does.
 */
export default function Price({ price, originalPrice, size = "card", style, numberOfLines }: PriceProps) {
  const colors = useThemeColors();
  const showsOriginal = originalPrice != null && originalPrice > price;

  return (
    <View style={[styles.row, style]} accessibilityLabel={`Price ${formatCurrency(price)}`}>
      <Text
        style={[size === "large" ? styles.priceLarge : styles.price, { color: showsOriginal ? colors.accent : colors.text }]}
        numberOfLines={numberOfLines}
      >
        {formatCurrency(price)}
      </Text>
      {showsOriginal ? (
        <Text style={[size === "large" ? styles.originalLarge : styles.original, { color: colors.textMuted }]} numberOfLines={numberOfLines}>
          {formatCurrency(originalPrice)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  price: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.body,
    lineHeight: fontSize.body * lineHeight.tight,
  },
  original: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.tiny,
    lineHeight: fontSize.tiny * lineHeight.normal,
    textDecorationLine: "line-through",
    flexShrink: 1,
  },
  priceLarge: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.title2,
    lineHeight: fontSize.title2 * lineHeight.tight,
  },
  originalLarge: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
    textDecorationLine: "line-through",
    flexShrink: 1,
  },
});
