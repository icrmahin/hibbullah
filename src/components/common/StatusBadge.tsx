import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";

type StatusBadgeProps = {
  label: string;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
};

export default function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  const colors = useThemeColors();

  const palette = {
    success: { bg: colors.successSoft, fg: colors.success, border: colors.successBorder, dot: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning, border: colors.warningBorder, dot: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerBorder, dot: colors.danger },
    info: { bg: colors.primarySoft, fg: colors.primary, border: colors.primaryMuted, dot: colors.primary },
    neutral: { bg: colors.background, fg: colors.textMuted, border: colors.border, dot: colors.textMuted },
  } as const;

  const p = palette[tone];

  return (
    <View
      style={[styles.badge, { backgroundColor: p.bg, borderColor: p.border }]}
      accessibilityLabel={label}
      accessibilityRole="text"
    >
      <View style={[styles.dot, { backgroundColor: p.dot }]} />
      <Text style={[styles.text, { color: p.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.tight,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});
