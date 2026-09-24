/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable by design */
import { Pressable, StyleSheet, Text, type PressableProps, type ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from "react-native-reanimated";
import { useThemeColors } from "../../providers/ThemeProvider";
import { useShadows } from "../../constants/shadows";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { radius, layout, opacity as opacityToken } from "../../constants/sizes";
import { springConfigs, compression as compressionValues } from "../../lib/motion";

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
  const shadows = useShadows();
  const isDisabled = disabled || loading;
  const reducedMotion = useReducedMotion();

  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string; ripple: string }> = {
    primary: { bg: colors.primary, fg: colors.white, ripple: "rgba(255,255,255,0.22)" },
    secondary: { bg: colors.backgroundAlt, fg: colors.primary, border: colors.border, ripple: colors.ripple.primary },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerBorder, ripple: colors.ripple.danger },
    ghost: { bg: colors.primarySoft, fg: colors.primary, ripple: colors.ripple.primary },
    link: { bg: "transparent", fg: colors.primary, ripple: colors.ripple.primary },
  };

  const p = palette[variant];

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = () => {
    if (isDisabled || reducedMotion) return;
    scale.value = withSpring(compressionValues.subtle, springConfigs.press);
    opacity.value = withSpring(opacityToken.pressed, springConfigs.press);
  };

  const handlePressOut = () => {
    if (isDisabled || reducedMotion) return;
    scale.value = withSpring(1, springConfigs.press);
    opacity.value = withSpring(1, springConfigs.press);
  };

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      android_ripple={{ color: p.ripple, borderless: false }}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.base,
          { backgroundColor: p.bg },
          p.border && { borderWidth: 1, borderColor: p.border },
          variant === "link" && styles.link,
          fullWidth && styles.fullWidth,
          isDisabled && styles.disabled,
          animatedStyle,
          style,
        ]}
      >
        {icon}
        {loading ? (
          <Text style={[styles.label, { color: p.fg }]}>Please wait...</Text>
        ) : (
          <Text style={[styles.label, { color: p.fg }]}>{title}</Text>
        )}
      </Animated.View>
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
  },
  fullWidth: { width: "100%" },
  disabled: { opacity: opacityToken.disabled },
  link: { paddingHorizontal: 0, paddingVertical: 0, minHeight: 0 },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.footnote,
    lineHeight: fontSize.footnote * lineHeight.tight,
    letterSpacing: 0.2,
  },
});