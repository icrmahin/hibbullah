/**
 * Centralized motion system for Hibbullah.
 *
 * All spring/timing configs live here. Components import from this module
 * rather than defining their own animation constants.
 */
import type { WithSpringConfig, WithTimingConfig } from "react-native-reanimated";

// ─── Spring Configurations ───────────────────────────────
// Tuned for fast response + controlled overshoot.
export const springConfigs = {
  /** Press compression — snappy, no bounce */
  press: {
    damping: 20,
    stiffness: 300,
    mass: 0.8,
  } as WithSpringConfig,

  /** Page transition — gentle settle */
  page: {
    damping: 18,
    stiffness: 180,
    mass: 1,
  } as WithSpringConfig,

  /** Card interaction — quick, minimal overshoot */
  card: {
    damping: 22,
    stiffness: 280,
    mass: 0.9,
  } as WithSpringConfig,

  /** Modal/sheet — smooth, controlled */
  sheet: {
    damping: 16,
    stiffness: 160,
    mass: 1,
  } as WithSpringConfig,

  /** Bouncy feedback — playful, short settle */
  bouncy: {
    damping: 12,
    stiffness: 200,
    mass: 1,
  } as WithSpringConfig,

  /** Snap — near-instant, for gesture release */
  snap: {
    damping: 30,
    stiffness: 400,
    mass: 0.6,
  } as WithSpringConfig,
} as const;

// ─── Timing Configurations ───────────────────────────────
// For non-spring animations (opacity fades, etc.)
export const timingConfigs = {
  /** Fast fade — 100ms */
  instant: { duration: 100 } as WithTimingConfig,
  /** Standard fade — 200ms */
  fast: { duration: 200 } as WithTimingConfig,
  /** Page fade — 300ms */
  normal: { duration: 300 } as WithTimingConfig,
  /** Slow fade — 500ms */
  slow: { duration: 500 } as WithTimingConfig,
} as const;

// ─── Compression Values ──────────────────────────────────
// The scale targets for press feedback.
export const compression = {
  /** Subtle compression — buttons, cards */
  subtle: 0.97,
  /** Standard compression — icon buttons, chips */
  standard: 0.95,
  /** Deep compression — destructive actions */
  deep: 0.92,
} as const;

// ─── Shared Defaults ─────────────────────────────────────
// Common config for all spring-based animations.
export const defaultSpringConfig: WithSpringConfig = {
  damping: 20,
  stiffness: 300,
  mass: 0.8,
};
