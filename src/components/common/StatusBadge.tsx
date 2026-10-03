import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Icon, { type IconName } from "./Icon";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
};

/**
 * One status language: soft fill + 1px tone border + Material icon + uppercase label.
 * The icon carries the meaning on its own (no colour-only signalling), and every
 * status in the app — orders, inventory, returns, batches — renders through this,
 * so PENDING looks identical on the dashboard, the list and the detail screen.
 */
const ICONS: Record<StatusTone, IconName> = {
  success: "check-circle",
  warning: "warning",
  danger: "error",
  info: "info",
  neutral: "info-outline",
};

export default function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  const colors = useThemeColors();

  const palette = {
    success: { bg: colors.successSoft, fg: colors.success, border: colors.successBorder },
    warning: { bg: colors.warningSoft, fg: colors.warning, border: colors.warningBorder },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerBorder },
    info: { bg: colors.primarySoft, fg: colors.accent, border: colors.borderLight },
    neutral: { bg: colors.background, fg: colors.textMuted, border: colors.borderLight },
  } as const;

  const p = palette[tone];

  return (
    <View
      style={[styles.badge, { backgroundColor: p.bg, borderColor: p.border }]}
      accessibilityLabel={label}
      accessibilityRole="text"
    >
      <Icon name={ICONS[tone]} size={14} color={p.fg} />
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
  text: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.micro,
    lineHeight: fontSize.micro * lineHeight.tight,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});
