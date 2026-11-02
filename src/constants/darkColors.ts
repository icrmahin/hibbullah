// ─── Dark Mode Colors ───────────────────────────────────────────────────────────────
// Three-color system, inverted: ink #100E09 surfaces · #F5F5F5 text · #06402B brand.
// The brand fill is deep green in BOTH themes now, so its label is paper in both
// (~15:1) — the old dark light-sage-fill/dark-label split is gone. Status fills
// keep near-black labels via `statusInk` (see below), because e.g. paper on the
// dark danger fill would be ~3.5:1.

export const darkBrand = {
  /** FILL — the primary button, both themes. ~15:1 against paper label. */
  primary: "#06402B",
  /** Pressed — same brand; press feedback comes from opacity at the call site. */
  primaryDark: "#06402B",
  /** Same brand; kept as a key so call sites keep compiling. */
  primaryLight: "#06402B",
  /** Icon tiles, selected rows — pre-blended paper 8% on near-black. */
  primarySoft: "#22201C",
  /** One step further, for a fill that has to sit on a card. */
  primaryMuted: "#2E2C28",

  /**
   * Paper, not brand: #06402B ink on #100E09 is ~1.6:1. The accent role is
   * "readable ink" (~90 call sites: nav labels, prices, links, icons), and on
   * near-black only paper clears the bar. Fills stay brand (`primary`).
   */
  accent: "#F5F5F5",

  /** Mapped onto the soft ramp — the sage ramp no longer exists. */
  sage: "#F5F5F5",
  sageLight: "#F5F5F5",
  sageSoft: "#22201C",

  /** Gold no longer exists; decorative inks fall back to paper in dark. */
  gold: "#F5F5F5",
  goldDark: "#F5F5F5",
  goldSoft: "#22201C",
} as const;

export const darkText = {
  /** ~16:1 on near-black. */
  primary: "#F5F5F5",
  /** Paper at 75% pre-blended — hierarchy without a new hue. */
  secondary: "#BCBBBA",
  /** Paper at 62% pre-blended — ~8:1 on near-black, clearing the 4.5 bar. */
  muted: "#9E9D9B",
  /**
   * Brand-fill labels: paper, both themes (see light `text.inverse`).
   * Status fills use `statusInk`, not this.
   */
  inverse: "#F5F5F5",
  /**
   * Links cannot be brand here — #06402B on #100E09 is ~1.6:1. Paper with the
   * call site's underline carries the link role instead.
   */
  link: "#F5F5F5",
} as const;

export const darkBorder = {
  /** Card edges are brand hairlines, pre-blended on near-black. */
  DEFAULT: "#0A2F1F",
  light: "#0C2217",
  soft: "#0E1B12",
  /**
   * Brand in light; paper here. A #06402B ring on #100E09 is ~1.6:1 and fails
   * the 3.0 non-text bar the contrast gate holds focus rings to — paper clears
   * it at ~15:1. Both are palette colours; visibility wins for a focus ring.
   */
  focus: "#F5F5F5",
  error: "#F26A67",
} as const;

export const darkSurface = {
  /** The page behind everything. */
  background: "#100E09",
  /**
   * Cards rest on the page in the same ink, separated by the brand hairline —
   * the same flat system as light mode, inverted.
   */
  DEFAULT: "#100E09",
  /** A modal on near-black needs separation — kept heavy. */
  overlay: "rgba(16, 14, 9, 0.72)",
  /** Paper at 10% pre-blended — reads as inactive against near-black. */
  disabled: "#232220",
} as const;

// Status hues kept as-is by decision — values unchanged from the previous palette.
export const darkStatus = {
  success: { DEFAULT: "#4CAF80", light: "#66BB6A", soft: "#14231A", border: "#22402C" },
  warning: { DEFAULT: "#D7B878", light: "#E0C88A", soft: "#221D13", border: "#3D3524" },
  danger: { DEFAULT: "#EF5350", light: "#F26A67", soft: "#241A1A", border: "#452626" },
  info: { DEFAULT: "#5C9AC0", light: "#64B5F6", soft: "#151D24", border: "#243440" },
} as const;

export const darkUtil = {
  black: "#100E09",
  white: "#F5F5F5",
  /** Brand hairline on near-black, pre-blended. */
  hairline: "#0B271A",
  shadow: "rgba(0, 0, 0, 0.5)",
  glow: "rgba(6, 64, 43, 0.25)",
  glowStrong: "rgba(6, 64, 43, 0.38)",
  ripple: {
    primary: "rgba(245, 245, 245, 0.10)",
    primaryDark: "rgba(245, 245, 245, 0.16)",
    /** Brand fill carries a paper label in dark too now, so its ripple is paper. */
    onPrimary: "rgba(245, 245, 245, 0.22)",
    danger: "rgba(239, 83, 80, 0.14)",
    neutral: "rgba(245, 245, 245, 0.07)",
  },
} as const;

// Flat composite, mirroring the light `colors` shape. Key parity with `colors.ts` is what
// lets `useThemeColors()` swap the two without a single call site knowing which is which.
export const darkColors = {
  // Brand
  ...darkBrand,

  // Text
  text: darkText.primary,
  textSecondary: darkText.secondary,
  textMuted: darkText.muted,
  textInverse: darkText.inverse,
  /**
   * Label ink for status fills. Dark fills need a near-black label (5.6–10:1);
   * paper here would drop to ~2–3.5:1. Light twin lives in colors.ts.
   */
  statusInk: "#100E09",

  // Border
  border: darkBorder.DEFAULT,
  borderLight: darkBorder.light,
  borderSoft: darkBorder.soft,
  borderFocus: darkBorder.focus,
  borderError: darkBorder.error,

  // Surface
  background: darkSurface.background,
  backgroundAlt: darkSurface.DEFAULT,
  overlay: darkSurface.overlay,

  // Status (unchanged hues)
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

  // Semantic soft aliases
  greenSoft: darkStatus.success.soft,
  amberSoft: darkStatus.warning.soft,
  redSoft: darkStatus.danger.soft,
  blueSoft: darkStatus.info.soft,

  // Utility
  ...darkUtil,
} as const;
