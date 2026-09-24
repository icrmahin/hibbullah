/**
 * FadeIn — animated container that fades + slides in on mount.
 *
 * Uses Reanimated layout animations. Ideal for list items and page content.
 * Respects reduced-motion preference.
 */
import { type ReactNode } from "react";
import Animated, { FadeInDown, FadeIn as ReanimatedFadeIn, SlideInRight, useReducedMotion } from "react-native-reanimated";
import { type ViewStyle } from "react-native";

type FadeInVariant = "fade" | "slide-up" | "slide-right";

type FadeInProps = {
  children: ReactNode;
  /** Animation variant. Default: "fade" */
  variant?: FadeInVariant;
  /** Delay in ms before animation starts. Default: 0 */
  delay?: number;
  /** Duration in ms. Default: 300 */
  duration?: number;
  style?: ViewStyle;
};

const enteringAnimations = {
  fade: ReanimatedFadeIn,
  "slide-up": FadeInDown,
  "slide-right": SlideInRight,
};

export default function FadeIn({
  children,
  variant = "fade",
  delay = 0,
  duration = 300,
  style,
}: FadeInProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <>{children}</>;
  }

  const EnteringAnim = enteringAnimations[variant]
    .duration(duration)
    .delay(delay);

  return (
    <Animated.View entering={EnteringAnim} style={style}>
      {children}
    </Animated.View>
  );
}
