/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutable by design */
import { useCallback } from "react";
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated";
import { springConfigs, compression } from "../lib/motion";

type PressCompression = "subtle" | "standard" | "deep";

type UseMotionPressOptions = {
  /** Compression scale target. Default: "standard" */
  compression?: PressCompression;
  /** Disable press animation. Default: false */
  disabled?: boolean;
};

/**
 * Provides animated press feedback (scale + opacity) for interactive elements.
 *
 * @example
 * const { animatedStyle, handlers } = useMotionPress();
 * <Pressable {...handlers}>
 *   <Animated.View style={[styles.button, animatedStyle]}>
 *     {children}
 *   </Animated.View>
 * </Pressable>
 */
export function useMotionPress(options: UseMotionPressOptions = {}) {
  const { compression: comp = "standard", disabled = false } = options;
  const reducedMotion = useReducedMotion();

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const targetScale = compression[comp];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const onPressIn = useCallback(() => {
    if (disabled || reducedMotion) return;
    scale.value = withSpring(targetScale, springConfigs.press);
    opacity.value = withTiming(0.85, { duration: 100 });
  }, [disabled, reducedMotion, targetScale, scale, opacity]);

  const onPressOut = useCallback(() => {
    if (disabled || reducedMotion) return;
    scale.value = withSpring(1, springConfigs.press);
    opacity.value = withTiming(1, { duration: 200 });
  }, [disabled, reducedMotion, scale, opacity]);

  return {
    animatedStyle,
    handlers: { onPressIn, onPressOut },
  };
}

/**
 * Provides animated scale feedback for a toggleable element.
 * Animates between two states when `active` changes.
 */
export function useMotionToggle(active: boolean) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(active ? 1 : 0.95);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Animate when active changes
  if (reducedMotion) {
    scale.value = active ? 1 : 0.95;
  } else {
    scale.value = withSpring(active ? 1 : 0.95, springConfigs.card);
  }

  return { animatedStyle };
}
