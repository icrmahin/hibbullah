import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import Button from "./Button";
import Icon from "./Icon";
import type { IconName } from "./Icon";

export type StateVariant = "empty" | "loading" | "error";

type StateViewProps = {
  variant: StateVariant;
  /** Empty: quiet glyph naming the absence (default `search-off`). Loading/error ignore this. */
  icon?: IconName;
  /** Empty title / error title. Loading uses `label` instead. */
  title?: string;
  message?: string;
  /** Loading line. Defaults to "Loading…". */
  label?: string;
  /** Empty action / error retry. */
  actionLabel?: string;
  onAction?: () => void;
};

const ICON_WELL_SIZE = 44;

/**
 * The one state container. Empty, loading, and error share the container,
 * the title, and the message — the variant only changes the signal:
 * a bare muted glyph for empty, a spinner for loading, a danger well plus
 * retry for error. `EmptyState`, `LoadingState`, and `ErrorState` are thin
 * wrappers with their historical props so no screen changes.
 */
export default function StateView({
  variant,
  icon = "search-off",
  title,
  message,
  label = "Loading…",
  actionLabel,
  onAction,
}: StateViewProps) {
  const colors = useThemeColors();

  if (variant === "loading") {
    return (
      <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={label}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={[styles.message, { color: colors.textMuted }]}>{label}</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      accessibilityRole={variant === "error" ? "alert" : undefined}
    >
      {variant === "error" ? (
        <View style={[styles.iconWell, { backgroundColor: colors.dangerSoft }]}>
          <Icon name="error-outline" size={22} color={colors.danger} />
        </View>
      ) : (
        <Icon name={icon} size={28} color={colors.textMuted} />
      )}
      {title ? (
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {message ? <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
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
  iconWell: {
    width: ICON_WELL_SIZE,
    height: ICON_WELL_SIZE,
    borderRadius: ICON_WELL_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
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
