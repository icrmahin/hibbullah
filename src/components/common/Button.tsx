import { Pressable, StyleSheet, Text, type PressableProps, type ViewStyle } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { radius, layout, opacity as opacityToken } from "../../constants/sizes";

/**
 * The pressable *is* the button.
 *
 * Ripple-only feedback: no scale, no opacity fade. On Android the touch answer is the
 * native ripple, clipped to the 6px rectangle by `overflow: hidden` + `borderRadius`.
 * A separate painted child would draw a square ripple over rounded ends, which is why
 * the responder and the paint stay on one view.
 */
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "link";

type ButtonProps = PressableProps & {
  title: string;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
};

export default function Button({
  title,
  variant = "primary",
  fullWidth = false,
  loading = false,
  disabled,
  icon,
  style,
  ...props
}: ButtonProps) {
  const colors = useThemeColors();
  const isDisabled = disabled || loading;

  // `fg` on a filled variant is `textInverse`, not `white`: dark mode's `primary` fill
  // inverts in lightness, so the label must go through the token, not a literal.
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string; ripple: string }> = {
    primary: { bg: colors.primary, fg: colors.textInverse, ripple: colors.ripple.primary },
    secondary: { bg: colors.backgroundAlt, fg: colors.accent, border: colors.border, ripple: colors.ripple.primary },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerBorder, ripple: colors.ripple.danger },
    ghost: { bg: colors.primarySoft, fg: colors.accent, ripple: colors.ripple.primary },
    link: { bg: "transparent", fg: colors.accent, ripple: colors.ripple.primary },
  };

  const p = palette[variant];

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      android_ripple={{ color: p.ripple, borderless: false }}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        { backgroundColor: p.bg },
        p.border && { borderWidth: 1, borderColor: p.border },
        variant === "link" && styles.link,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {icon}
      {loading ? (
        <Text style={[styles.label, { color: p.fg }]}>Please wait...</Text>
      ) : (
        <Text style={[styles.label, { color: p.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.controlHeight,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    // Clips the Android ripple to the rectangle. Without it the ripple is bounded by
    // the rectangle of the view rather than by its rounded outline.
    overflow: "hidden",
  },
  fullWidth: { width: "100%" },
  disabled: { opacity: opacityToken.disabled },
  link: { paddingHorizontal: 0, paddingVertical: 0, minHeight: 0 },
  label: {
    fontFamily: fontFamily.pjsSemiBold,
    fontSize: fontSize.subhead,
    lineHeight: fontSize.subhead * lineHeight.normal,
    letterSpacing: 0.1,
  },
});
