// ─── Brand ───────────────────────────────────────────────
// Three-color system: paper #F5F5F5 · ink #100E09 · brand #06402B.
// Soft/ink-alpha variants below are the same hues at opacity — no new colours.
export const brand = {
  /** FILL — a primary button's background. ~15:1 against its #F5F5F5 label. */
  primary: "#06402B",
  /** Pressed — same brand; press feedback comes from opacity at the call site. */
  primaryDark: "#06402B",
  /** Same brand; kept as a key so call sites keep compiling. */
  primaryLight: "#06402B",
  /** Icon tiles, selected rows — pre-blended brand 8% on paper. */
  primarySoft: "#E2E7E5",
  /** One step further, for a fill that has to sit on a card. */
  primaryMuted: "#D4DCD9",

  /**
   * INK — links, icons, focus rings, selected borders.
   * Same deep green as `primary`: on paper it reads ~15:1.
   */
  accent: "#06402B",

  /** Mapped onto brand — the sage ramp no longer exists. */
  sage: "#06402B",
  sageLight: "#06402B",
  sageSoft: "#E2E7E5",

  /** Mapped onto brand — gold no longer exists. */
  gold: "#06402B",
  goldDark: "#06402B",
  goldSoft: "#E2E7E5",
} as const;

// ─── Text ────────────────────────────────────────────────
export const text = {
  /** ~16:1 on paper. */
  primary: "#100E09",
  /** Ink at 74% pre-blended — hierarchy without a new hue. */
  secondary: "#4C4A46",
  /**
   * Ink at 62% pre-blended — ~5.3:1 on paper, clearing the 4.5 bar for the
   * small captions that sit behind most usages.
   */
  muted: "#676663",
  /**
   * The label colour for the brand fill, both themes: #06402B is dark either
   * way, so its label is paper either way (~15:1 light, ~15:1 dark).
   * Status fills use `statusInk`, not this — their lightness inverts.
   */
  inverse: "#F5F5F5",
  link: "#06402B",
} as const;

// ─── Border ──────────────────────────────────────────────
// Borders are brand-only, super thin (hairlineWidth at call sites).
// Strength steps are brand at opacity — no new hues.
export const border = {
  DEFAULT: "#A9BBB4",
  light: "#CAD4D1",
  soft: "#D8DFDD",
  focus: "#06402B",
  error: "#B3261E",
} as const;

// ─── Surface ─────────────────────────────────────────────
// One surface: paper. Cards sit on the page in the same #F5F5F5 and are
// separated by the brand hairline, not by tint steps or shadows.
export const surface = {
  background: "#F5F5F5",
  DEFAULT: "#F5F5F5",
  overlay: "rgba(16, 14, 9, 0.45)",
  /**
   * Ink at 10% pre-blended — reads as inactive against paper.
   */
  disabled: "#DEDEDD",
} as const;

// ─── Status ──────────────────────────────────────────────
// Kept as-is by decision: success/warning/danger/info hues stay.
export const status = {
  success: { DEFAULT: "#1A6B4A", light: "#28A745", soft: "#E4F5EC", border: "#B8D4CE" },
  warning: { DEFAULT: "#826C40", light: "#B89A5A", soft: "#FAF3E4", border: "#E8DFC6" },
  danger: { DEFAULT: "#B3261E", light: "#DC3545", soft: "#FBE4E2", border: "#F0C4C0" },
  info: { DEFAULT: "#2D6E82", light: "#3498DB", soft: "#E4EFF4", border: "#C6DECB" },
} as const;

// ─── Utility ─────────────────────────────────────────────
export const util = {
  black: "#100E09",
  white: "#F5F5F5",
  hairline: "#D8DFDD",
  shadow: "rgba(0, 0, 0, 0.06)",
  glow: "rgba(6, 64, 43, 0.10)",
  glowStrong: "rgba(6, 64, 43, 0.18)",
  ripple: {
    primary: "rgba(6, 64, 43, 0.08)",
    primaryDark: "rgba(6, 64, 43, 0.12)",
    /**
     * The ripple for a control whose fill is `primary`. The brand fill is deep
     * green in both themes now, so its ripple is paper in both — ~15:1 logic
     * in reverse. One value is right for both for the first time.
     */
    onPrimary: "rgba(245, 245, 245, 0.22)",
    danger: "rgba(179, 38, 30, 0.08)",
    neutral: "rgba(16, 14, 9, 0.05)",
  },
} as const;

// ─── Composite color map (backward-compatible) ───────────
// Flat namespace so `colors.primary`, `colors.text` etc. keep working.
export const colors = {
  // Brand
  ...brand,

  // Text (flattened for backward compat)
  text: text.primary,
  textSecondary: text.secondary,
  textMuted: text.muted,
  textInverse: text.inverse,
  /**
   * Label ink for status fills (danger/warning/success/info), whose lightness
   * differs from the brand fill's. Light: paper on the deep status fills.
   * See darkColors for the inverted half.
   */
  statusInk: "#F5F5F5",

  // Border (flat aliases)
  border: border.DEFAULT,
  borderLight: border.light,
  borderSoft: border.soft,
  borderFocus: border.focus,
  borderError: border.error,

  // Surface (flat aliases)
  background: surface.background,
  backgroundAlt: surface.DEFAULT,
  overlay: surface.overlay,

  // Status (flattened — unchanged hues)
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
