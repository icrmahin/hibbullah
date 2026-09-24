// ─── Dual Shadow System ──────────────────────────────────
// Two-layer shadows for depth: ambient (diffuse) + key (directional)
// NOTE: RN 0.76+ / react-native-web 0.21 deprecate the individual `shadow*`
// style props in favour of a single cross-platform `boxShadow` string.
import { useThemeColors } from "../providers/ThemeProvider";

export type ShadowElevation = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

// Feather-light: diffuse, low opacity, larger blur
const buildShadows = (_colors: ReturnType<typeof useThemeColors>) => ({
  none: { boxShadow: "0px 0px 0px rgba(0,0,0,0)" },
  xs: { boxShadow: "0px 2px 8px rgba(0,0,0,0.04)" },
  sm: { boxShadow: "0px 4px 12px rgba(0,0,0,0.06)" },
  md: { boxShadow: "0px 8px 16px rgba(0,0,0,0.07)" },
  lg: { boxShadow: "0px 12px 24px rgba(0,0,0,0.08)" },
  xl: { boxShadow: "0px 16px 32px rgba(0,0,0,0.09)" },
  xxl: { boxShadow: "0px 20px 40px rgba(0,0,0,0.10)" },
});

export function useShadows() {
  const colors = useThemeColors();
  return buildShadows(colors);
}

export const shadowPresets = {
  card: "xs",
  cardHover: "sm",
  modal: "lg",
  dropdown: "sm",
  nav: "sm",
  fab: "md",
  toast: "sm",
} as const;

export function getShadow(elevation: ShadowElevation, colors: ReturnType<typeof useThemeColors>) {
  return buildShadows(colors)[elevation];
}