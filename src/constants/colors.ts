// ─── Brand ───────────────────────────────────────────────
export const brand = {
  primary: "#123C35",
  primaryDark: "#0D2E29",
  primaryLight: "#1A5248",
  primarySoft: "#E8F0EE",
  primaryMuted: "#B8D4CE",

  sage: "#8FB8A8",
  sageLight: "#B5D4C8",
  sageSoft: "#EDF5F1",

  gold: "#D7B878",
  goldDark: "#B89A5A",
  goldSoft: "#FAF3E4",
} as const;

// ─── Text ────────────────────────────────────────────────
export const text = {
  primary: "#18201E",
  secondary: "#3D4A46",
  muted: "#7A8A85",
  inverse: "#FFFFFF",
  link: "#123C35",
} as const;

// ─── Border ──────────────────────────────────────────────
export const border = {
  DEFAULT: "#D0D6D4",
  light: "#E2E7E5",
  soft: "#EEF1F0",
  focus: "#123C35",
  error: "#B3261E",
} as const;

// ─── Surface ─────────────────────────────────────────────
export const surface = {
  background: "#F6F7F4",
  DEFAULT: "#FFFFFF",
  elevated: "#FFFFFF",
  canvas: "#FFFFFF",
  overlay: "rgba(0, 0, 0, 0.4)",
  disabled: "#F6F7F4",
} as const;

// ─── Status ──────────────────────────────────────────────
export const status = {
  success: { DEFAULT: "#1A6B4A", light: "#28A745", soft: "#E4F5EC", border: "#B8D4CE" },
  warning: { DEFAULT: "#B89A5A", light: "#D7B878", soft: "#FAF3E4", border: "#E8DFC6" },
  danger: { DEFAULT: "#B3261E", light: "#DC3545", soft: "#FBE4E2", border: "#F0C4C0" },
  info: { DEFAULT: "#2D6E82", light: "#3498DB", soft: "#E4EFF4", border: "#C6DECB" },
} as const;

// ─── Utility ─────────────────────────────────────────────
export const util = {
  black: "#000000",
  white: "#FFFFFF",
  hairline: "rgba(0, 0, 0, 0.06)",
  shadow: "rgba(0, 0, 0, 0.06)",
  ripple: {
    primary: "rgba(18, 60, 53, 0.08)",
    primaryDark: "rgba(18, 60, 53, 0.12)",
    danger: "rgba(179, 38, 30, 0.08)",
    neutral: "rgba(0, 0, 0, 0.04)",
  },
} as const;

// ─── Composite color map (backward-compatible) ───────────
// Flat namespace so `colors.primary`, `colors.text` etc. keep working.
// For nested access to surface/border, use the named exports above.
export const colors = {
  // Brand
  ...brand,

  // Text (flattened for backward compat)
  text: text.primary,
  textSecondary: text.secondary,
  textMuted: text.muted,
  textInverse: text.inverse,

  // Border (flat alias — the string "#D0D6D4")
  border: border.DEFAULT,
  borderLight: border.light,
  borderSoft: border.soft,
  borderFocus: border.focus,

  // Surface (flat aliases)
  background: surface.background,
  backgroundAlt: surface.DEFAULT,
  backgroundElevated: surface.elevated,
  canvas: surface.canvas,
  overlay: surface.overlay,

  // Status (flattened)
  success: status.success.DEFAULT,
  successLight: status.success.light,
  successSoft: status.success.soft,
  successBorder: status.success.border,

  warning: status.warning.DEFAULT,
  warningLight: status.warning.light,
  warningSoft: status.warning.soft,
  warningBorder: status.warning.border,

  danger: status.danger.DEFAULT,
  dangerLight: status.danger.light,
  dangerSoft: status.danger.soft,
  dangerBorder: status.danger.border,

  info: status.info.DEFAULT,
  infoLight: status.info.light,
  infoSoft: status.info.soft,
  infoBorder: status.info.border,

  // Semantic soft aliases
  greenSoft: status.success.soft,
  amberSoft: status.warning.soft,
  redSoft: status.danger.soft,
  blueSoft: status.info.soft,

  // Utility
  ...util,
} as const;

export default colors;
