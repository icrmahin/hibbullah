/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable by design */
import { Pressable, StyleSheet, View, type PressableProps, type ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from "react-native-reanimated";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius, layout, opacity as opacityToken } from "../../constants/sizes";
import { springConfigs, compression as compressionValues } from "../../lib/motion";

/**
 * One view, for the same reason as `Button`: an unstyled `Pressable` carrying the
 * `android_ripple` around a painted `Animated.View` gave a square ripple on a circular
 * button, which on a 36px icon button is the most obvious defect in the app.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const reducedMotion = useReducedMotion();

  const bg = {
    primary: colors.primary,
    secondary: colors.backgroundAlt,
    ghost: "transparent",
    danger: colors.dangerSoft,
  }[variant];

  // The primary fill is the accent, and the accent inverts between the themes — a deep teal
  // in light, a light sage in dark. So the ripple on it has to invert too: a white ripple
  // is what you want on the dark teal, and is 1.1:1 against the light sage, i.e. invisible.
  // `ripple.onPrimary` is the token for "whatever the primary fill's label colour is, a
  // ripple in that same polarity".
  const ripple = {
    primary: colors.ripple.onPrimary,
    secondary: colors.ripple.primary,
    ghost: colors.ripple.neutral,
    danger: colors.ripple.danger,
  }[variant];

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = () => {
    if (disabled || reducedMotion) return;
    scale.value = withSpring(compressionValues.standard, springConfigs.press);
    opacity.value = withSpring(opacityToken.pressed, springConfigs.press);
  };

  const handlePressOut = () => {
    if (disabled || reducedMotion) return;
    scale.value = withSpring(1, springConfigs.press);
    opacity.value = withSpring(1, springConfigs.press);
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      android_ripple={{ color: ripple, borderless: false }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
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
        animatedStyle,
        style,
      ]}
    >
      {icon}
      {badge && <View style={[styles.badgeDot, { backgroundColor: colors.danger }]} />}
    </AnimatedPressable>
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