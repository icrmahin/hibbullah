export const sizes = {
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 20,
    pill: 999,
  },

  // Legacy aliases
  cardRadius: 12,
  pill: 999,

  touch: 44,
  buttonHeight: 48,
  inputHeight: 48,
  icon: 20,
  avatar: 44,
  productImage: 140,
  thumbnail: 72,

  // Responsive container paddings
  containerPadding: {
    xs: 12,
    sm: 16,
    md: 20,
    lg: 24,
  },

  // Maximum content widths
  maxWidth: {
    sm: 540,
    md: 720,
    lg: 960,
    xl: 1140,
    xxl: 1320,
  },
} as const;

export default sizes;
