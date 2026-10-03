import { Pressable, StyleSheet, View, type PressableProps, type ViewStyle } from "react-native";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius, layout, opacity as opacityToken } from "../../constants/sizes";

/**
 * Ripple-only icon button. The button stays circular (`size / 2` — a derived circle,
 * not a radius token), and the ripple is clipped to that circle by `overflow: hidden`.
 * No scale, no fade.
 */
type IconButtonProps = PressableProps & {
  /** The icon element to render */
  icon: React.ReactNode;
  /** Accessible label (required for icon-only buttons) */
  accessibilityLabel: string;
  /** Visual variant. Default: "ghost" */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** Size of the hit target. Default: 40 */
  size?: number;
  /** Optional badge dot indicator */
  badge?: boolean;
  style?: ViewStyle;
};

export default function IconButton({
  icon,
  accessibilityLabel,
  variant = "ghost",
  size = layout.iconButtonSize,
  badge = false,
  disabled,
  style,
  ...props
}: IconButtonProps) {
  const colors = useThemeColors();

  const bg = {
    primary: colors.primary,
    secondary: colors.backgroundAlt,
    ghost: "transparent",
    danger: colors.dangerSoft,
  }[variant];

  // The primary fill inverts between the themes, so its ripple inverts too.
  const ripple = {
    primary: colors.ripple.onPrimary,
    secondary: colors.ripple.primary,
    ghost: colors.ripple.neutral,
    danger: colors.ripple.danger,
  }[variant];

  return (
    <Pressable
      {...props}
      disabled={disabled}
      android_ripple={{ color: ripple, borderless: false }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          borderColor: variant === "secondary" ? colors.border : undefined,
          opacity: disabled ? opacityToken.disabled : 1,
        },
        variant === "secondary" && styles.bordered,
        style,
      ]}
    >
      {icon}
      {badge && <View style={[styles.badgeDot, { backgroundColor: colors.danger }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    // Clips the ripple to the circle. A circular button with a rectangular ripple is the
    // clearest sign that the responder and the painted view are different views.
    overflow: "hidden",
  },
  bordered: { borderWidth: 1 },
  badgeDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
});
