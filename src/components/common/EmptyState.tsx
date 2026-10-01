import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Button from "./Button";
import Icon from "./Icon";
import type { IconName } from "./Icon";

type EmptyStateProps = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Quiet glyph above the title. Pick something that names the absence, not decorates it. */
  icon?: IconName;
};

export default function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  icon = "search-off",
}: EmptyStateProps) {
  const colors = useThemeColors();
  return (
    <View style={styles.container}>
      {icon ? <Icon name={icon} size={28} color={colors.textMuted} /> : null}
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {title}
      </Text>
      {message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.soraSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  message: {
    fontFamily: fontFamily.pjsRegular,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.relaxed,
    textAlign: "center",
  },
});
