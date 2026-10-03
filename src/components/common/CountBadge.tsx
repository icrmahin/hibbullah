import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { fontFamily, fontSize } from "../../constants/typography";

/**
 * The dot's diameter. The radius below is derived from it (`BADGE_SIZE / 2`) rather than
 * typed as a literal, so the chip stays a true circle: a hard-coded 8 only happened to be
 * right while the dot was 16px, and drifted the moment the size moved.
 */
const BADGE_SIZE = 16;

type CountBadgeProps = {
  /** The number to show. Zero or less renders nothing — an absent badge, not a "0". */
  count: number;
  /**
   * `neutral` (the default) for counts that are not urgent, `danger` for unread markers.
   * A count is not an action, so the neutral tone is a plain chip; the accent colour is
   * never spent here.
   */
  tone?: "neutral" | "danger";
};

/**
 * A small count dot pinned over an icon — cart contents, unread notifications.
 *
 * One shared component because the same off-centre defect had been copied into two
 * headers: a 10px glyph inside a 14–16px pill with no line height and no horizontal
 * alignment, so the number sat low and left of centre. Here the line box is exactly the
 * dot's height, the text is centred on both axes, and multi-digit counts widen the pill
 * instead of clipping (capped at "99+").
 */
export default function CountBadge({ count, tone = "neutral" }: CountBadgeProps) {
  const colors = useThemeColors();
  if (count <= 0) return null;
  return (
    <View
      style={[styles.badge, { backgroundColor: tone === "danger" ? colors.danger : colors.text }]}
      // The parent control already announces the count in its own accessibility label,
      // so a bare "3" in here would only be read twice.
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text style={[styles.text, { color: colors.textInverse }]}>{count > 99 ? "99+" : String(count)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    paddingHorizontal: 2,
    borderRadius: BADGE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: fontFamily.pjsBold,
    fontSize: fontSize.tiny,
    // The line box is the dot's height, which is what puts the glyph's optical centre in
    // the circle's centre instead of resting on the bottom edge.
    lineHeight: BADGE_SIZE,
    textAlign: "center",
  },
});
