import { StyleSheet, Text, View } from "react-native";
import colors from "../../constants/colors";
import sizes from "../../constants/sizes";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";

export default function DiscountBadge({ percent }: { percent: number }) {
  return (
    <View style={styles.badge} accessibilityLabel={`${percent} percent discount`}>
      <Text style={styles.text}>-{percent}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.goldSoft,
    borderRadius: sizes.borderRadius.pill,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  text: {
    color: colors.gold,
    fontSize: typography.caption2,
    fontWeight: "600",
  },
});
