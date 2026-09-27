// ─── Dual Shadow System ─────────────────────────────────────────────────────────────
// Two-layer depth: a diffuse ambient shadow plus a directional key. The layers are what
// make a raised surface read as raised rather than as a flat rectangle with a border.
//
// NOTE: RN 0.76+ / react-native-web 0.21 deprecate the individual `shadow*` style props in
// favour of a single cross-platform `boxShadow` string.
import { useTheme, useThemeColors } from "../providers/ThemeProvider";

export type ShadowElevation = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

/**
 * Blur, drop and ambient strength for each step. The ambient *colour* is not here.
 *
 * This is the whole point of the file. The shadow used to be one hard-coded
 * `rgba(0, 0, 0, 0.0x)` string per step, and a black shadow at 4–10% on a `#0A0C0B` page
 * is invisible — there is nothing darker than near-black to cast onto. So in dark mode
 * every raised surface in the app, cards and sheets and the header alike, was separated
 * from the page by its `border` hairline and nothing else, which is why the dark UI read
 * as flat however much elevation a component asked for.
 *
 * `buildShadows` took a `colors` argument and named it `_colors`, so this was a bug that
 * announced itself in the signature and shipped anyway.
 */
const STEPS: Record<Exclude<ShadowElevation, "none">, { blur: number; y: number; ambient: number }> = {
  xs: { blur: 8, y: 2, ambient: 0.04 },
  sm: { blur: 12, y: 4, ambient: 0.06 },
  md: { blur: 16, y: 8, ambient: 0.07 },
  lg: { blur: 24, y: 12, ambient: 0.08 },
  xl: { blur: 32, y: 16, ambient: 0.09 },
  xxl: { blur: 40, y: 20, ambient: 0.1 },
};

/** Where the glow switches from the quiet accent to the strong one. */
const LOUD_FROM: ShadowElevation = "md";

/**
 * The two-layer string for one step.
 *
 * Light mode keeps a black shadow, which is right: a white card on a `#F6F7F4` page casts
 * a believable shadow downward.
 *
 * Dark mode inverts the ambient layer into an accent glow. A near-black surface has no
 * darker neighbour, so the only way to give a card lift is to add *light* around it — and
 * making that light the brand's sage is what stops the glow looking like a rendering
 * artefact. This is the light accent shadow the dark palette is built around, and the
 * reason `glow` and `glowStrong` exist.
 *
 * Both themes keep a faint black layer underneath, because a glow with nothing occluded
 * reads as a halo rather than as a card resting on a page.
 */
function buildShadows(colors: ReturnType<typeof useThemeColors>, dark: boolean) {
  const lift = (step: Exclude<ShadowElevation, "none">) => {
    const { blur, y, ambient } = STEPS[step];
    if (!dark) return `0px ${y}px ${blur}px rgba(0, 0, 0, ${ambient})`;
    const glow = step >= LOUD_FROM ? colors.glowStrong : colors.glow;
    return `0px ${y}px ${blur}px rgba(0, 0, 0, ${ambient / 2}), 0px 1px ${Math.round(blur / 2)}px ${glow}`;
  };

  return {
    none: { boxShadow: "0px 0px 0px rgba(0, 0, 0, 0)" },
    xs: { boxShadow: lift("xs") },
    sm: { boxShadow: lift("sm") },
    md: { boxShadow: lift("md") },
    lg: { boxShadow: lift("lg") },
    xl: { boxShadow: lift("xl") },
    xxl: { boxShadow: lift("xxl") },
  };
}

/**
 * `resolvedTheme` rather than a colour comparison.
 *
 * `account.tsx` inferred dark mode with `colors.background === "#111A17"`, which is
 * fragile in a way that hides itself: the check is simply false for any value other than
 * the one it was written against, so retuning the background turns it off with no error
 * anywhere. Here the two things being compared are a theme and a string, which is a
 * question the provider already answers.
 */
export function useShadows() {
  const colors = useThemeColors();
  const { resolvedTheme } = useTheme();
  return buildShadows(colors, resolvedTheme === "dark");
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

// There used to be a `getShadow(elevation, colors)` escape hatch for callers outside React.
// It is gone because it can no longer be correct: knowing whether a shadow needs a glow
// means knowing the resolved theme, which means a hook. A non-hook function that guesses —
// or that takes a `dark` boolean no caller has — is how the original bug came back. The
// hook is the whole API.
