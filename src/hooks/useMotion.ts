/**
 * Press-motion hooks, retired.
 *
 * Flat UI v2 answers every touch with the Android-native ripple. There is no scale or
 * opacity compression anywhere in the app (`Button`, `Card`, `ListItem`, `IconButton`
 * and `AnimatedPressable` are all ripple-only). These hooks survive with the same names
 * and return shapes so the one exporter (`hooks/index.ts`) keeps working, but they do
 * no animation: handlers are no-ops and styles are empty.
 */

type PressCompression = "subtle" | "standard" | "deep";

type UseMotionPressOptions = {
  /** Deprecated no-op. Kept so existing option objects keep typechecking. */
  compression?: PressCompression;
  /** Disable press animation. Default: false */
  disabled?: boolean;
};

const EMPTY_STYLE: Record<string, never> = {};
const NOOP = () => {};

export function useMotionPress(_options: UseMotionPressOptions = {}) {
  void _options;
  return {
    animatedStyle: EMPTY_STYLE,
    handlers: { onPressIn: NOOP, onPressOut: NOOP },
  };
}

export function useMotionToggle(_active: boolean) {
  void _active;
  return { animatedStyle: EMPTY_STYLE };
}
