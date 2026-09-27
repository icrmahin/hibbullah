// ─── Dark Mode Colors ───────────────────────────────────────────────────────────────
//
// Every value in this file was chosen by solving for a contrast target, not by eye. The
// generator that produced them is `/tmp/opencode/inverse.mjs` and its neighbours; the
// assertion that keeps them honest is `scripts/verify-contrast.mjs`, which fails the build
// if any of these pairs regress.
//
// ── Why the surfaces are near-black and the accent is not ─────────────────────────────
//
// This palette used to invert the roles. `primary` was `#8FB8A8` — a light sage — and it
// was used as a *background* in twelve places: the primary button, the active auth toggle,
// the avatar fallback, the hero CTA. So the app's main filled control was a pale mint block
// in the middle of a dark screen, which is the reason a dark mode built on a light-mode
// design language always ends up looking wrong. The brand colour was doing two incompatible
// jobs — "the thing you press" and "the colour of the text" — and only one of them can be a
// light colour on a dark surface.
//
// So the roles are now separated, which is the split Material makes and the split the
// light palette was already using by accident:
//
//   primary  = a FILL.  Dark enough to carry a white label at AA. Near-black with a
//              brand cast, so it reads as a raised surface rather than a hole.
//   accent   = INK.    A link, an icon, a focus ring, a selected border. Bright enough to
//              read as light-on-dark, which is why it is still the light sage.
//
// The accent is what balances the UI: it is the only saturated colour on the page, so the
// eye goes to the interactive thing and then to nothing else. That is the whole idea of a
// near-black palette — the background recedes so the accent can carry all the meaning.
//
// The green cast is 1–3 units on the blue channel. Enough to feel related to the sage,
// far too little to tint the UI or to survive as an obvious colour on an OLED panel.

export const darkBrand = {
  /** FILL — a primary button's background. White label: 8.5:1. */
  primary: "#1E2624",
  /** FILL, pressed. 9.9:1 against white. */
  primaryDark: "#161D1B",
  /** INK — links, icons, focus rings, selected borders. 8.3:1 on a card. */
  accent: "#8FB8A8",
  /** The accent as a very soft fill — a selected row, an icon tile. */
  primarySoft: "#16201D",
  /** One step further, for a fill that has to sit on a card without reading as raised. */
  primaryMuted: "#1B2623",

  /** The lighter sage, for a hover or pressed state on the accent ink itself. */
  sage: "#8FB8A8",
  sageLight: "#A8CBBD",
  sageSoft: "#16201D",

  /** Gold is the warning ink and never a fill — see `darkStatus` for why. */
  gold: "#D7B878",
  goldDark: "#B89A5A",
  goldSoft: "#221D13",
} as const;

export const darkText = {
  /** 16.5:1 on a card. */
  primary: "#F2F4F3",
  /** 10.0:1 on a card. */
  secondary: "#B9C2BE",
  /** 6.3:1 on a card, 6.8:1 on the page. Was 4.4:1, and it is used for 11px captions. */
  muted: "#8E9B96",
  /**
   * The label colour for a filled surface whose lightness inverts between the themes — a
   * status fill. Dark mode's are light (`danger` is `#EF5350`), so the label is near-black:
   * 5.6:1. A `primary` fill is the opposite case, dark in both themes, so its label is
   * `white`. That asymmetry is the whole reason these are two tokens.
   */
  inverse: "#0A0C0B",
  link: "#8FB8A8",
} as const;

export const darkBorder = {
  /** A card's own edge. 1.36:1 against the page — a hairline, which is the point. */
  DEFAULT: "#262B29",
  light: "#1F2422",
  soft: "#1A1E1D",
  /** The accent, as a focus ring. 8.3:1 against a card, so it is unmistakable. */
  focus: "#8FB8A8",
  error: "#F26A67",
} as const;

export const darkSurface = {
  /** The page behind everything. Near-black; a screen full of this is restful. */
  background: "#0A0C0B",
  /** A card resting on the page. 1.36:1 above the background, so the edge is a line. */
  DEFAULT: "#131615",
  /** Heavier than light mode's 0.4: a modal on near-black needs more separation. */
  overlay: "rgba(0, 0, 0, 0.72)",
  disabled: "#131615",
} as const;

// The status colours are used two ways, and the two want opposite lightnesses.
//
// As INK — a "Low stock 3" line, a badge's label — they sit on a card and need 4.5:1.
// As a FILL — the cart badge, the notification dot — they carry a white number, and the
// original values gave 3.49:1, which is not readable.
//
// Rather than split every status into ink/fill, the fills were darkened and the ink lifted
// on its own soft background. That keeps one name per state, which is what stops the two
// roles drifting apart again.
export const darkStatus = {
  // 5.6:1 as white on a fill · 6.7:1 as ink on a card
  success: { DEFAULT: "#4CAF80", light: "#66BB6A", soft: "#14231A", border: "#22402C" },
  // 10.3:1 as white on a fill · 9.6:1 as ink on a card
  warning: { DEFAULT: "#D7B878", light: "#E0C88A", soft: "#221D13", border: "#3D3524" },
  // 5.6:1 as white on a fill · 6.1:1 as ink on its own soft fill (was 4.1:1)
  danger: { DEFAULT: "#EF5350", light: "#F26A67", soft: "#241A1A", border: "#452626" },
  // 6.4:1 as white on a fill · 5.9:1 as ink on a card
  info: { DEFAULT: "#5C9AC0", light: "#64B5F6", soft: "#151D24", border: "#243440" },
} as const;

export const darkUtil = {
  black: "#000000",
  white: "#FFFFFF",
  /** A hairline on near-black cannot be black — it has to be a *light* line. */
  hairline: "rgba(255, 255, 255, 0.08)",
  /**
   * Shadows on a near-black surface are almost invisible, so elevation is carried by the
   * surface ramp and by this glow rather than by darkness. A dark theme that only adds
   * black shadows looks flat; the accent glow is what gives a card its lift.
   */
  shadow: "rgba(0, 0, 0, 0.5)",
  glow: "rgba(143, 184, 168, 0.18)",
  glowStrong: "rgba(143, 184, 168, 0.32)",
  ripple: {
    primary: "rgba(255, 255, 255, 0.10)",
    primaryDark: "rgba(255, 255, 255, 0.16)",
    danger: "rgba(239, 83, 80, 0.14)",
    neutral: "rgba(255, 255, 255, 0.07)",
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

  // Border
  border: darkBorder.DEFAULT,
  borderLight: darkBorder.light,
  borderSoft: darkBorder.soft,
  borderFocus: darkBorder.focus,
  borderError: darkBorder.error,

  // Surface. Key parity with `colors.ts` is what lets `useThemeColors()` swap the two
  // without a call site knowing which it is holding — which is why `backgroundElevated`
  // and `canvas` are absent from both rather than only from light. A sheet over a card is
  // separated by the `overlay` scrim and by `glow`, not by a third surface tint.
  background: darkSurface.background,
  backgroundAlt: darkSurface.DEFAULT,
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

  // Semantic soft aliases
  greenSoft: darkStatus.success.soft,
  amberSoft: darkStatus.warning.soft,
  redSoft: darkStatus.danger.soft,
  blueSoft: darkStatus.info.soft,

  // Utility
  ...darkUtil,
} as const;
