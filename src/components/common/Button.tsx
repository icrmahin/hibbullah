import { Pressable, StyleSheet, Text, type PressableProps, type ViewStyle } from "react-native";
import colors from "../../constants/colors";
import spacing from "../../constants/spacing";
import typography from "../../constants/typography";

type ButtonProps = PressableProps & {
  title: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  fullWidth?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export default function Button({
  title,
  variant = "primary",
  fullWidth = false,
  loading = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const palette = {
    primary: { background: colors.primary, text: colors.white, ripple: "rgba(255,255,255,0.22)" },
    secondary: { background: colors.backgroundAlt, text: colors.primary, border: colors.border, ripple: "rgba(2,55,25,0.10)" },
    danger: { background: colors.redSoft, text: colors.danger, border: '#F0C4C0', ripple: "rgba(179,38,30,0.12)" },
    ghost: { background: colors.primarySoft, text: colors.primary, ripple: "rgba(2,55,25,0.14)" },
  }[variant];

  return (
    <Pressable
      {...props}
      disabled={disabled || loading}
      android_ripple={{ color: palette.ripple }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.background },
        "border" in palette && palette.border
          ? { borderWidth: 1, borderColor: palette.border }
          : null,
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.text, { color: palette.text }]}>
        {loading ? "Please wait…" : title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    // 44px minimum keeps the touch target accessible without oversized buttons.
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  fullWidth: { width: "100%" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
  text: {
    fontSize: typography.bodySmall,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
