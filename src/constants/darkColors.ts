// ─── Dark Mode Colors ───────────────────────────────────
// Carefully designed dark palette for Hibbullah.
// NOT a simple inversion — tonal hierarchy with deliberate luminance steps.
export const darkBrand = {
  primary: "#8FB8A8",
  primaryDark: "#6A9A88",
  primaryLight: "#B5D4C8",
  primarySoft: "#1A2E2A",
  primaryMuted: "#2A4A42",

  sage: "#8FB8A8",
  sageLight: "#6A9A88",
  sageSoft: "#1A2E2A",

  gold: "#D7B878",
  goldDark: "#C4A660",
  goldSoft: "#2A2418",
} as const;

export const darkText = {
  primary: "#F0F2F1",
  secondary: "#B8C0BC",
  muted: "#7A8A85",
  inverse: "#18201E",
  link: "#8FB8A8",
} as const;

export const darkBorder = {
  DEFAULT: "#2E3A36",
  light: "#253029",
  soft: "#1E2824",
  focus: "#8FB8A8",
  error: "#E57373",
} as const;

export const darkSurface = {
  background: "#111A17",
  DEFAULT: "#1A2420",
  elevated: "#1E2E28",
  canvas: "#151F1B",
  overlay: "rgba(0, 0, 0, 0.6)",
  disabled: "#1A2420",
} as const;

export const darkStatus = {
  success: { DEFAULT: "#4CAF80", light: "#66BB6A", soft: "#1A2E22", border: "#2A4A36" },
  warning: { DEFAULT: "#D7B878", light: "#E0C88A", soft: "#2A2418", border: "#3A3428" },
  danger: { DEFAULT: "#EF5350", light: "#E57373", soft: "#2E1A1A", border: "#3E2A2A" },
  info: { DEFAULT: "#5C9AC0", light: "#64B5F6", soft: "#1A2430", border: "#2A3A4A" },
} as const;

export const darkUtil = {
  black: "#000000",
  white: "#FFFFFF",
  hairline: "rgba(255, 255, 255, 0.06)",
  shadow: "rgba(0, 0, 0, 0.3)",
  ripple: {
    primary: "rgba(143, 184, 168, 0.12)",
    primaryDark: "rgba(143, 184, 168, 0.18)",
    danger: "rgba(239, 83, 80, 0.12)",
    neutral: "rgba(255, 255, 255, 0.06)",
  },
} as const;

// Flat composite for backward compat (mirrors light `colors` shape)
export const darkColors = {
  // Brand
  ...darkBrand,

  // Text
  text: darkText.primary,
  textSecondary: darkText.secondary,
  textMuted: darkText.muted,
  textInverse: darkText.inverse,

  // Border
  border: darkBorder.DEFAULT,
  borderLight: darkBorder.light,
  borderSoft: darkBorder.soft,
  borderFocus: darkBorder.focus,

  // Surface
  background: darkSurface.background,
  backgroundAlt: darkSurface.DEFAULT,
  backgroundElevated: darkSurface.elevated,
  canvas: darkSurface.canvas,
  overlay: darkSurface.overlay,

  // Status
  success: darkStatus.success.DEFAULT,
  successLight: darkStatus.success.light,
  successSoft: darkStatus.success.soft,
  successBorder: darkStatus.success.border,

  warning: darkStatus.warning.DEFAULT,
  warningLight: darkStatus.warning.light,
  warningSoft: darkStatus.warning.soft,
  warningBorder: darkStatus.warning.border,

  danger: darkStatus.danger.DEFAULT,
  dangerLight: darkStatus.danger.light,
  dangerSoft: darkStatus.danger.soft,
  dangerBorder: darkStatus.danger.border,

  info: darkStatus.info.DEFAULT,
  infoLight: darkStatus.info.light,
  infoSoft: darkStatus.info.soft,
  infoBorder: darkStatus.info.border,

  // Semantic soft
  greenSoft: darkStatus.success.soft,
  amberSoft: darkStatus.warning.soft,
  redSoft: darkStatus.danger.soft,
  blueSoft: darkStatus.info.soft,

  // Utility
  ...darkUtil,
} as const;
