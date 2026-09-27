// ─── Brand ───────────────────────────────────────────────
export const brand = {
  /** FILL — a primary button's background. 12.2:1 against its white label. */
  primary: "#123C35",
  primaryDark: "#0D2E29",
  primaryLight: "#1A5248",
  primarySoft: "#E8F0EE",
  primaryMuted: "#B8D4CE",

  /**
   * INK — links, icons, focus rings, selected borders.
   *
   * Added so the light and dark palettes can be swapped without a call site knowing which
   * it is holding. On a light surface the accent is the same deep teal as `primary`, so
   * nothing about the light theme changes; what it buys is that dark mode can put a *light*
   * sage in this role, which is the only way a link can be readable on a near-black card.
   * Before the split there was one key doing both jobs, and dark mode's value for it made
   * every primary button a pale mint block.
   */
  accent: "#123C35",

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
  /**
   * 4.6:1 on the page, 4.9:1 on a card.
   *
   * Was `#7A8A85`, which gave 3.37:1 on the page background — below the 4.5:1 that body
   * text needs, and this is the colour behind 275 usages, most of them 11–13px captions
   * like a timestamp or a field name. It looked fine in a screenshot and was not: a
   * caption is exactly the text a shopkeeper squints at on a cheap phone outdoors.
   */
  muted: "#66736F",
  /**
   * The label colour for a filled surface whose lightness *inverts* between the themes —
   * a status fill. `danger` is `#B3261E` in light and `#EF5350` in dark, so its label
   * flips: 6.5:1 with white in light, 5.6:1 with near-black in dark.
   *
   * A `primary` fill is the opposite case: dark in *both* themes, because it is a fill
   * rather than an ink, so its label is `white` either way — 12.2:1 light, 15.5:1 dark.
   * That asymmetry is why these are two different tokens and neither is the other's
   * fallback. Getting it wrong in either theme looks identical in a screenshot and fails
   * in the other.
   */
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
// Two steps only, and that is a decision rather than an omission. In light mode elevation
// is carried by shadow: a card is white on a `#F6F7F4` page, and a modal is white with a
// soft shadow on top of that. Adding a third surface tint would have meant a "raised"
// panel that is a slightly different shade of white, which reads as a rendering fault
// rather than as depth. Dark mode is the theme that needs a real ramp, and it has one.
export const surface = {
  background: "#F6F7F4",
  DEFAULT: "#FFFFFF",
  overlay: "rgba(0, 0, 0, 0.4)",
  disabled: "#F6F7F4",
} as const;

// ─── Status ──────────────────────────────────────────────
export const status = {
  success: { DEFAULT: "#1A6B4A", light: "#28A745", soft: "#E4F5EC", border: "#B8D4CE" },
  /**
   * 4.7:1 on the page, 5.0:1 on a card.
   *
   * Was `#B89A5A`, at 2.69:1 — comfortably past the point where the glyphs start to
   * disappear, and this is the colour of the low-stock count on the admin dashboard, which
   * is the single most safety-relevant number in the app. Gold is a lovely accent and a
   * poor text colour at this lightness; the accent role keeps it, and this ink role got
   * darkened until it could be read.
   */
  warning: { DEFAULT: "#826C40", light: "#B89A5A", soft: "#FAF3E4", border: "#E8DFC6" },
  danger: { DEFAULT: "#B3261E", light: "#DC3545", soft: "#FBE4E2", border: "#F0C4C0" },
  info: { DEFAULT: "#2D6E82", light: "#3498DB", soft: "#E4EFF4", border: "#C6DECB" },
} as const;

// ─── Utility ─────────────────────────────────────────────
export const util = {
  black: "#000000",
  white: "#FFFFFF",
  hairline: "rgba(0, 0, 0, 0.06)",
  shadow: "rgba(0, 0, 0, 0.06)",
  /**
   * The accent, as a glow. Dark mode uses this for elevation instead of a shadow, because a
   * black shadow on a near-black surface is invisible. Present in light mode too so that a
   * screen which references `glow` does not need to branch on the theme.
   */
  glow: "rgba(18, 60, 53, 0.10)",
  glowStrong: "rgba(18, 60, 53, 0.18)",
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
  borderError: border.error,

  // Surface (flat aliases)
  background: surface.background,
  backgroundAlt: surface.DEFAULT,
  // `backgroundElevated` and `canvas` used to be here, and both were identical to
  // `backgroundAlt` — white, on white, on white — with nothing in the app reading either.
  // A sheet over a card is separated by the `overlay` scrim and by the shadow, not by a
  // third tint of white, so there is nothing to restore. Dark mode is the theme that
  // needed a real ramp, and it has one: `#0A0C0B` page, `#131615` card, a hairline edge,
  // and an accent glow for lift. A token nobody reads is not a palette.
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
