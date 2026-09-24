// ─── Layered Surfaces ────────────────────────────────────
// Hierarchy from background to floating overlay.
// Each level adds subtle visual separation through border + minimal shadow.
export const layeredSurface = {
  /** App background — the deepest layer */
  base: {
    backgroundColor: "#F6F7F4",
    borderWidth: 0,
  },
  /** Content area — raised from base by border only */
  raised: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E7E5",
  },
  /** Sunken area — inputs, wells, inset regions */
  sunken: {
    backgroundColor: "#F6F7F4",
    borderWidth: 1,
    borderColor: "#EEF1F0",
    borderRadius: 8,
  },
  /** Elevated panel — cards, popovers, menus */
  elevated: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E7E5",
    borderRadius: 12,
  },
  /** Floating element — modals, drawers, tooltips */
  floating: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D0D6D4",
    borderRadius: 16,
  },
} as const;

// ─── Divider System ──────────────────────────────────────
// Subtle separators that maintain hierarchy without visual noise.
export const divider = {
  /** Strongest separator — between major sections */
  strong: {
    borderWidth: 1,
    borderColor: "#D0D6D4",
  },
  /** Default separator — between items */
  default: {
    borderWidth: 1,
    borderColor: "#E2E7E5",
  },
  /** Subtle separator — between related items */
  subtle: {
    borderWidth: 1,
    borderColor: "#EEF1F0",
  },
  /** Hairline — barely visible, for tight spacing */
  hairline: {
    borderWidth: 0.5,
    borderColor: "rgba(0, 0, 0, 0.06)",
  },
} as const;

// ─── Transparency Layers ─────────────────────────────────
// Controlled opacity values for overlays and depth.
export const transparency = {
  /** Clear — fully opaque */
  clear: 1,
  /** Subtle — pressed state, muted elements */
  subtle: 0.92,
  /** Medium — disabled text, secondary content */
  medium: 0.72,
  /** Muted — placeholder text, hints */
  muted: 0.48,
  /** Hidden — fully transparent but still in layout */
  hidden: 0,
} as const;

// ─── Technical Visual Details ─────────────────────────────
// Small, precise details that give the UI an engineered feel.
export const technical = {
  /** Inset shadow depth — for sunken wells */
  insetDepth: 1,
  /** Border radius for technical elements */
  radius: 4,
  /** Corner notch size for accent marks */
  notchSize: 3,
  /** Accent line width for section markers */
  accentWidth: 2,
  /** Badge/pip size for status indicators */
  pipSize: 6,
  /** Grid gap for technical layouts */
  gridGap: 8,
} as const;

// ─── Component Geometry ──────────────────────────────────
// Consistent sizing and spacing across all components.
export const geometry = {
  /** Minimum hit target */
  hitTarget: 44,
  /** Standard button height */
  buttonHeight: 48,
  /** Standard input height */
  inputHeight: 48,
  /** Standard icon button size */
  iconButton: 44,
  /** Badge height */
  badgeHeight: 24,
  /** Chip height */
  chipHeight: 36,
  /** Tab bar height */
  tabBarHeight: 44,
  /** Divider horizontal inset */
  dividerInset: 16,
} as const;

// ─── Industrial Elevation ─────────────────────────────────
// Flat, border-driven depth instead of heavy shadows.
export const industrialElevation = {
  /** Recessed — inputs, wells */
  recessed: {
    borderWidth: 1,
    borderColor: "#EEF1F0",
    borderRadius: 8,
    // Inset visual via darker bg
    backgroundColor: "#F6F7F4",
  },
  /** Flat — default cards */
  flat: {
    borderWidth: 1,
    borderColor: "#E2E7E5",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  /** Raised — elevated cards, panels */
  raised: {
    borderWidth: 1,
    borderColor: "#D0D6D4",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  /** Floating — modals, drawers */
  floating: {
    borderWidth: 1,
    borderColor: "#D0D6D4",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
} as const;
