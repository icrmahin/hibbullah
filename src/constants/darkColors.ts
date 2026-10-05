// ─── Dark Mode Colors ───────────────────────────────────────────────────────────────
//
// Every value in this file was chosen by solving for a contrast target, not by eye. The
// generator that produced them is `/tmp/opencode/inverse.mjs` and its neighbours; the
// assertion that keeps them honest is `scripts/verify-contrast.mjs`, which fails the build
// if any of these pairs regress.
//
// ── Why the primary button is the accent, and only that ───────────────────────────
//
// This palette used to invert the roles. `primary` was `#8FB8A8` — a light sage — and it
// was used as a *background* in twelve places: the primary button, the active auth toggle,
// the avatar fallback, the hero CTA. So the app's main filled control was a pale mint block
// in the middle of a dark screen, which is the reason a dark mode built on a light-mode
// design language always ends up looking wrong. The brand colour was doing two incompatible
// jobs — "the thing you press" and "the colour of the text" — and only one of them can be a
// light colour on a dark surface.
//
// The roles were then split, which is the split Material makes: `primary` a FILL dark enough
// to carry a white label, `accent` an INK bright enough to read as light-on-dark. That left
// dark mode with no accent-filled control at all — the one thing you press was the least
// colourful thing on the page, which is backwards for a shop screen where the CTA is the
// whole point.
//
// So `primary` is now the accent as a fill, and the label flips to `textInverse` (`#0A0C0B`)
// to keep the contrast. That is 8.96:1, against the 2.19:1 that a white label on this fill
// would have given — the exact failure recorded at the top of `scripts/verify-contrast.mjs`,
// which is what pins the number. `primary` and `accent` are the same value in both
// palettes now, and `verify:no-accent-fill` keeps it that way: the accent may fill a
// primary button and nothing else.
//
// The green cast is 1–3 units on the blue channel. Enough to feel related to the sage,
// far too little to tint the UI or to survive as an obvious colour on an OLED panel.

export const darkBrand = {
  /** FILL — the primary button, and the only accent-filled surface in the app. 8.96:1 against `textInverse`. */
  primary: "#8FB8A8",
  /** FILL, pressed — a deeper sage. 7.12:1 against `textInverse`. */
  primaryDark: "#77A597",
  /**
   * The lighter sage — hover or pressed state on the accent ink itself.
   * Mirrors `sageLight`; kept as its own key so the palette keeps parity
   * with light mode's `primaryLight` (see the composite note below).
   */
  primaryLight: "#A8CBBD",
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
   * The label colour for a filled surface whose lightness *inverts* between the themes —
   * a status fill, and now the primary fill too, since `primary` is a light sage here and
   * a deep teal in light mode. `danger` is `#EF5350` and `primary` is `#8FB8A8`, so both
   * need a near-black label: 5.6:1 and 8.96:1.
   *
   * This is why it is a token and not `white`. A white label on this palette's `primary`
   * is 2.19:1, which is the failure recorded in `scripts/verify-contrast.mjs` — so the
   * check that guards it asserts `textInverse` rather than `white`, in both palettes.
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
  /**
   * Visibly lighter than both page and card — a disabled fill must read as
   * inactive. Reuses the existing border tone rather than inventing a grey.
   */
  disabled: "#262B29",
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
    /**
     * A ripple on a `primary` fill. Dark mode's `primary` is the light sage, so this is
     * near-black rather than white: a white ripple on `#8FB8A8` is 1.1:1 and cannot be seen.
     */
    onPrimary: "rgba(10, 12, 11, 0.16)",
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
