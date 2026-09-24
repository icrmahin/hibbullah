import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";

export default function DiscountBadge({ percent }: { percent: number }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.badge, { backgroundColor: colors.goldSoft }]} accessibilityLabel={`${percent} percent discount`}>
      <Text style={[styles.text, { color: colors.gold }]}>-{percent}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: sizes.borderRadius.pill,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  text: {
    fontSize: typography.caption2,
    fontWeight: "600",
  },
});