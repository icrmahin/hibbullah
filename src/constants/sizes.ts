// ─── Border radius — feather-light soft UI ─────────────────
export const radius = {
  /** 10px — small controls, chips (feather) */
  sm: 10,
  /** 12px — inputs, buttons */
  md: 12,
  /** 16px — cards, panels (soft) */
  lg: 16,
  /** 20px — large cards, modals */
  xl: 20,
  /** 24px — feature cards, islands */
  xxl: 24,
  /** 999px — pill shape */
  pill: 999,
} as const;

// ─── Border widths ───────────────────────────────────────
export const borderWidth = {
  /** 1px — hairline borders */
  thin: 1,
  /** 2px — focus rings, emphasis */
  medium: 2,
  /** 3px — heavy emphasis */
  thick: 3,
} as const;

// ─── Touch targets & layout sizes ────────────────────────
export const layout = {
  /** 40px — minimum touch target (compact) */
  touch: 40,
  /** 40px — default button height */
  buttonHeight: 40,
  /** 36px — small button / compact control height */
  controlHeightSmall: 36,
  /** 40px — standard control height (pill buttons, tabs) */
  controlHeight: 40,
  /** 44px — large control height */
  controlHeightLarge: 44,
  /** 44px — default input height */
  inputHeight: 44,
  /** 36px — icon button default size */
  iconButtonSize: 36,
  /** 28px — small icon button size */
  iconButtonSizeSmall: 28,
  /** 18px — default icon size */
  icon: 18,
  /** 40px — avatar diameter */
  avatar: 40,
  /** 120px — product card image */
  productImage: 120,
  /** 60px — thumbnail */
  thumbnail: 60,
} as const;

// ─── Container padding (responsive) ──────────────────────
export const containerPadding = {
  xs: 10,
  sm: 14,
  md: 18,
  lg: 22,
} as const;

// ─── Max widths ──────────────────────────────────────────
export const maxWidth = {
  sm: 540,
  md: 720,
  lg: 960,
  xl: 1140,
  xxl: 1320,
} as const;

// ─── Opacity ─────────────────────────────────────────────
export const opacity = {
  /** 0.5 — disabled elements */
  disabled: 0.5,
  /** 0.82 — pressed state */
  pressed: 0.82,
  /** 0.4 — overlay / modal backdrop */
  overlay: 0.4,
  /** 0.6 — muted text / secondary pressed */
  muted: 0.6,
} as const;

// ─── Animation durations (ms) ────────────────────────────
export const duration = {
  /** 100ms — micro-interactions */
  instant: 100,
  /** 200ms — button press, chip toggle */
  fast: 200,
  /** 300ms — standard transitions */
  normal: 300,
  /** 500ms — page transitions, modals */
  slow: 500,
} as const;

// ─── Spring physics (for react-native-reanimated) ────────
export const spring = {
  /** Gentle: slow, no bounce — page transitions */
  gentle: { damping: 15, stiffness: 150, mass: 1 },
  /** Snappy: quick settle — button press, toggles */
  snappy: { damping: 20, stiffness: 300, mass: 0.8 },
  /** Bouncy: playful feedback — add-to-cart, favorites */
  bouncy: { damping: 12, stiffness: 200, mass: 1 },
} as const;

// ─── Composite sizes object (backward-compatible) ────────
export const sizes = {
  borderRadius: radius,
  cardRadius: radius.lg,
  pill: radius.pill,
  touch: layout.touch,
  buttonHeight: layout.buttonHeight,
  inputHeight: layout.inputHeight,
  icon: layout.icon,
  avatar: layout.avatar,
  productImage: layout.productImage,
  thumbnail: layout.thumbnail,
  containerPadding,
  maxWidth,
} as const;

export default sizes;