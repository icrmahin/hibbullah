/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable by design */
import { Pressable, StyleSheet, Text, type PressableProps, type ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from "react-native-reanimated";
import { useThemeColors } from "../../providers/ThemeProvider";
import { spacing } from "../../constants/spacing";
import { fontFamily, fontSize, lineHeight } from "../../constants/typography";
import { radius, layout, opacity as opacityToken } from "../../constants/sizes";
import { springConfigs, compression as compressionValues } from "../../lib/motion";

/**
 * The pressable *is* the button.
 *
 * This used to be a `Pressable` with no style at all wrapping an `Animated.View` that
 * carried every visual property, which meant the two things React Native cares about lived
 * on different views:
 *
 *   · `android_ripple` is drawn by the Pressable's own native view. That view had no
 *     `borderRadius` and no `overflow`, so on Android the touch feedback was a hard-edged
 *     square drawn over a pill-shaped button, with its corners spilling past the rounded
 *     ends. Every button in the app — and the two in the delete dialog — flashed a
 *     rectangle on Android while looking correct on web, which is why `tsc`, `eslint` and
 *     `expo export` never saw it.
 *   · The press spring scaled the *child*, so the painted button shrank inside a touch
 *     target that stayed put.
 *
 * One view removes both, and it is the same lesson as the home search bar: the view that
 * responds to a touch and the view that is painted should be the same view, because any
 * split between them is a platform detail waiting to go wrong.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const reducedMotion = useReducedMotion();

  // `fg` on a filled variant is `textInverse`, not `white`, and that is the fix for the
  // worst contrast failure in the app: dark mode's `primary` used to be a light sage, so a
  // primary button was a pale mint block with white text on it at 2.19:1. Dark mode's fills
  // are now light and its `textInverse` is near-black, so the same line is 8.96:1 — and in
  // light mode nothing changed, because there `textInverse` was already white.
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string; ripple: string }> = {
    primary: { bg: colors.primary, fg: colors.textInverse, ripple: colors.ripple.primary },
    secondary: { bg: colors.backgroundAlt, fg: colors.accent, border: colors.border, ripple: colors.ripple.primary },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerBorder, ripple: colors.ripple.danger },
    ghost: { bg: colors.primarySoft, fg: colors.accent, ripple: colors.ripple.primary },
    link: { bg: "transparent", fg: colors.accent, ripple: colors.ripple.primary },
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
    <AnimatedPressable
      {...props}
      disabled={isDisabled}
      android_ripple={{ color: p.ripple, borderless: false }}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
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
    </AnimatedPressable>
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
    // Clips the Android ripple to the pill. Without it the ripple is bounded by the
    // rectangle of the view rather than by its rounded outline, so it squares off the
    // ends of the button on press.
    overflow: "hidden",
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