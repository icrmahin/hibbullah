/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable by design */
import { Pressable, StyleSheet, View, type PressableProps, type ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from "react-native-reanimated";
import { useThemeColors } from "../../providers/ThemeProvider";
import { radius, layout, opacity as opacityToken } from "../../constants/sizes";
import { springConfigs, compression as compressionValues } from "../../lib/motion";

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

  const ripple = {
    primary: "rgba(255,255,255,0.22)",
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
    <Pressable
      {...props}
      disabled={disabled}
      android_ripple={{ color: ripple, borderless: false }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
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
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  bordered: { borderWidth: 1 },
  badgeDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});