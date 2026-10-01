// ─── Border radius — flat, one small scale ─────────────────────────────
/**
 * Three values, and every larger step collapses onto the top of it.
 *
 * The previous scale was 10/12/16/20/24/999 — six values spanning 24px plus a pill, which
 * meant the corner of a chip and the corner of a feature card were told apart by a
 * difference nobody can see at a glance. A flat UI has one radius vocabulary: 2 for the
 * smallest chips, 6 for controls, 8 for anything with a surface. The keys are kept so the
 * 162 call sites keep working and keep their relative order, so "a card is at least as
 * rounded as the control inside it" still holds.
 *
 * `pill` is 8, not 999. That is the single most visible change here — 61 call sites, every
 * button, chip, badge, header and quantity stepper in the app.
 *
 * Note that genuinely circular things do not come through this token: an avatar, the logo
 * and a round icon button compute `size / 2` at their own call site, so they stay circles.
 */
export const radius = {
  /** 2px — chips, tags, the smallest controls */
  sm: 2,
  /** 6px — inputs, buttons */
  md: 6,
  /** 8px — cards, panels, modals, and every larger step */
  lg: 8,
  /** 8px — was 20px */
  xl: 8,
  /** 8px — was 24px */
  xxl: 8,
  /** 8px — was 999px. A pill shape is no longer part of the vocabulary. */
  pill: 8,
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
  /** 44px — minimum touch target (Apple's 44pt / Android's 48dp floor, rounded to the 4px grid) */
  touch: 44,
  /** 44px — default button height */
  buttonHeight: 44,
  /** 36px — small button / compact control height */
  controlHeightSmall: 36,
  /** 44px — standard control height (buttons, tabs) */
  controlHeight: 44,
  /** 44px — large control height */
  controlHeightLarge: 48,
  /** 44px — default input height */
  inputHeight: 44,
  /** 44px — header row height (the compact bar every screen shares) */
  headerHeight: 44,
  /** 36px — the header's back control */
  backButton: 36,
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
