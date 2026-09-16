export const typography = {
  largeTitle: 34,
  title1: 28,
  title2: 22,
  title3: 20,
  headline: 17,
  body: 17,
  bodySmall: 15,
  callout: 16,
  subhead: 15,
  footnote: 13,
  caption1: 12,
  caption2: 11,

  // Legacy aliases for backward compatibility
  title: 34,
  h1: 28,
  h2: 22,
  h3: 17,
  caption: 12,
  label: 11,

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },

  // Letter spacing
  letterSpacing: {
    tight: -0.2,
    normal: 0,
    wide: 0.4,
    wider: 0.8,
    widest: 1.2,
  },

  letterSpacingDisplay: 0,
  letterSpacingBody: 0,
} as const;

export default typography;
