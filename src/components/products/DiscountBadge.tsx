import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight, letterSpacing } from "../../constants/typography";

/**
 * `10% OFF` — the corner badge on the photograph, and the one number here the app works
 * out for itself.
 *
 * The caller derives the percentage from the two prices, never from `discountPercent` on
 * the row: a stored percentage sitting next to a price that has not moved would advertise
 * a saving the customer cannot take. `0` means "there is nothing to claim" and the badge
 * disappears rather than rendering `0% OFF`.
 *
 * Top-left of the image is the only corner left free. The favourite sits top-right and the
 * add-to-cart control bottom-right, so a badge here never covers a tappable thing and the
 * three never fight for the same pixels.
 */
export default function DiscountBadge({ percent }: { percent: number }) {
  const colors = useThemeColors();

  if (!(percent > 0)) return null;

  return (
    <View
      style={[styles.badge, { backgroundColor: colors.primarySoft }]}
      accessibilityLabel={`${percent} percent off`}
    >
      <Text style={[styles.text, { color: colors.accent }]}>{percent}% OFF</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    // Pinned to the photo's top-left corner, inside the image edges — never covering
    // the favourite/add stack top-right or the tappable photo beneath it. Absolute
    // (not in-flow) so it takes no layout space from the photograph.
    position: "absolute",
    top: spacing.xs + 2,
    left: spacing.xs + 2,
    zIndex: 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  text: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.tight,
    letterSpacing: letterSpacing.wide,
  },
});
