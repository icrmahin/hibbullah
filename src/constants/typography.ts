// ─── Font families ──────────────────────────────────────
// Sora — brand personality, headings, prominent UI
// Plus Jakarta Sans — operational density, data, tables, body
export const fontFamily = {
  // Sora
  soraRegular: "Sora_400Regular",
  soraMedium: "Sora_500Medium",
  soraSemiBold: "Sora_600SemiBold",
  soraBold: "Sora_700Bold",

  // Plus Jakarta Sans
  pjsRegular: "PlusJakartaSans_400Regular",
  pjsMedium: "PlusJakartaSans_500Medium",
  pjsSemiBold: "PlusJakartaSans_600SemiBold",
  pjsBold: "PlusJakartaSans_700Bold",

  // Legacy aliases (backward compat — maps to Sora)
  regular: "Sora_400Regular",
  medium: "Sora_500Medium",
  semiBold: "Sora_600SemiBold",
  bold: "Sora_700Bold",
} as const;

// ─── Type scale ──────────────────────────────────────────
export const fontSize = {
  largeTitle: 34,
  title1: 28,
  title2: 22,
  title3: 20,
  body: 17,
  callout: 16,
  bodySmall: 15,
  subhead: 15,
  footnote: 13,
  caption: 12,
  micro: 11,
  tiny: 10,
} as const;

// ─── Line heights ────────────────────────────────────────
export const lineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
} as const;

// ─── Letter spacing ──────────────────────────────────────
export const letterSpacing = {
  tight: -0.2,
  normal: 0,
  wide: 0.4,
  wider: 0.8,
  widest: 1.2,
} as const;

// ─── Composite ───────────────────────────────────────────
// The one canonical type scale: every key below is read somewhere in the
// app, and nothing outside this file defines a font size. `fontFamily` and
// `fontSize` above are the primitives; this object is the scale screens use.
export const typography = {
  fontFamily,
  largeTitle: fontSize.largeTitle,
  title1: fontSize.title1,
  title2: fontSize.title2,
  title3: fontSize.title3,
  headline: fontSize.body,
  body: fontSize.body,
  bodySmall: fontSize.bodySmall,
  callout: fontSize.callout,
  subhead: fontSize.subhead,
  footnote: fontSize.footnote,
  caption1: fontSize.caption,
  caption2: fontSize.micro,
  tiny: fontSize.tiny,
  title: fontSize.largeTitle,
  h1: fontSize.title1,
  h2: fontSize.title2,
  h3: fontSize.title3,
  caption: fontSize.caption,
  label: fontSize.micro,
  lineHeight,
  letterSpacing,
} as const;

export default typography;