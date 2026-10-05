import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius } from "../../constants/sizes";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Icon from "./Icon";
import type { IconName } from "./Icon";

type AlertVariant = "success" | "warning" | "danger" | "info";

type AlertProps = {
  variant?: AlertVariant;
  title?: string;
  message: string;
  /** Optional trailing action label */
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
};

export default function Alert({
  variant = "info",
  title,
  message,
  actionLabel,
  onAction,
  style,
}: AlertProps) {
  const colors = useThemeColors();
  const palette: Record<AlertVariant, { bg: string; border: string; fg: string }> = {
    success: { bg: colors.successSoft, border: colors.successBorder, fg: colors.success },
    warning: { bg: colors.warningSoft, border: colors.warningBorder, fg: colors.warning },
    danger:  { bg: colors.dangerSoft,  border: colors.dangerBorder,  fg: colors.danger },
    info:    { bg: colors.infoSoft,    border: colors.infoBorder,    fg: colors.info },
  };

  const p = palette[variant];
  const glyph: IconName = variant === "success" ? "check" : variant === "warning" ? "warning" : variant === "danger" ? "close" : "info";

  return (
    <View
      style={[styles.banner, { backgroundColor: p.bg, borderColor: p.border }, style]}
      accessibilityRole="alert"
    >
      <View style={styles.row}>
        <View style={[styles.iconCircle, { backgroundColor: p.fg }]}>
          <Icon name={glyph} size={12} color={colors.textInverse} />
        </View>
        <View style={styles.content}>
          {title ? (
            <Text style={[styles.title, { color: p.fg }]}>{title}</Text>
          ) : null}
          <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
        </View>
      </View>
      {actionLabel && onAction ? (
        <Text style={[styles.action, { color: p.fg }]} onPress={onAction}>
          {actionLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  iconCircle: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  content: { flex: 1, gap: spacing.xs },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySmall,
    lineHeight: fontSize.bodySmall * lineHeight.normal,
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
  },
  action: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.normal,
    textAlign: "right",
  },
});