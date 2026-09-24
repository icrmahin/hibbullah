/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable by design */
import { type ReactNode } from "react";
import { Pressable, type PressableProps, type ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from "react-native-reanimated";
import { springConfigs, compression as compressionValues } from "../../lib/motion";

type Compression = "subtle" | "standard" | "deep";

type AnimatedPressableProps = Omit<PressableProps, "style" | "children"> & {
  children: ReactNode;
  /** Compression scale. Default: "standard" */
  compression?: Compression;
  /** Override the base style (applied to the Animated.View) */
  style?: ViewStyle | ViewStyle[];
  /** Disable press animation. Default: false */
  disabled?: boolean;
};

/**
 * Pressable with animated spring compression.
 *
 * @example
 * <AnimatedPressable onPress={handlePress}>
 *   <Text>Tap me</Text>
 * </AnimatedPressable>
 */
export default function AnimatedPressable({
  children,
  compression: comp = "standard",
  disabled = false,
  style,
  ...props
}: AnimatedPressableProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const targetScale = compressionValues[comp];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = () => {
    if (disabled || reducedMotion) return;
    scale.value = withSpring(targetScale, springConfigs.press);
    opacity.value = withSpring(0.85, springConfigs.press);
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
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[style, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
