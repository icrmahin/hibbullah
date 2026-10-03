import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import AnimatedPressable from "./AnimatedPressable";
import Icon from "./Icon";

type UpdateBannerProps = {
  onDismiss: () => void;
};

/**
 * One-line staged-update notice, in the StatusBadge visual language: soft
 * info fill, 1px border, Material icon, compact text, dismiss button.
 * Rendered in-flow at the top of the root view so it never overlaps the
 * screen header or the bottom navigation; returns its own space when it
 * unmounts.
 */
export default function UpdateBanner({ onDismiss }: UpdateBannerProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[styles.bar, { backgroundColor: colors.primarySoft, borderColor: colors.borderLight }]}
      accessibilityRole="alert"
      accessibilityLabel="Update ready. It will install the next time you open the app."
    >
      <Icon name="system-update" size={18} color={colors.accent} />
      <Text style={[styles.text, { color: colors.text }]} numberOfLines={2}>
        Update ready — installs next time you open the app.
      </Text>
      <AnimatedPressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss update notice"
        hitSlop={8}
      >
        <Icon name="close" size={18} color={colors.textMuted} />
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    fontFamily: fontFamily.pjsMedium,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
});
