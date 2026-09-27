// ─── Flat surfaces — elevation comes from lightness and a hairline ─────────────────
//
// There is no shadow system any more. This hook still exists, and still returns the same
// seven keys, because 37 files spread its result into a style; returning `none` for every
// step is what removes the glow from all of them at once, with no call site touched.
//
// Why that is safe rather than a downgrade: in both palettes a surface is already separated
// from the page by lightness and a 1px border, not by a shadow. Light mode is a white card
// (`#FFFFFF`) on a `#F6F7F4` page; dark mode is `#131615` on `#0A0C0B` with a `#262B29`
// hairline. A blurred black glow added no information on top of that — it only made the
// edges look soft, which is the opposite of flat.
//
// `glow` and `glowStrong` survive in the palettes. They are what dark mode used for lift,
// and they are now simply unread, which is a cheaper thing to leave behind than to delete:
// `colors.ts` and `darkColors.ts` document why they exist, and a future raised surface can
// reach for them without re-deriving the reasoning.

export type ShadowElevation = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

/** Every step is flat. One constant so the seven keys cannot drift apart. */
const FLAT = "none";

/**
 * No parameters, on purpose.
 *
 * This function used to take the palette and name it `_colors`, and that underscore was the
 * whole bug: every shadow was a hard-coded black `rgba`, so dark mode cast no elevation at
 * all, because a near-black surface has no darker neighbour to cast onto. A parameter that
 * is accepted and ignored is not a harmless leftover — it is the shape that bug took, and
 * keeping it would make the mistake look deliberate.
 *
 * So the signature is now genuinely empty. It is still a function, and `useShadows` is still
 * a hook, because 37 files call it and they should not have to be edited to find out that
 * shadows are gone. What a future change has to do is add the parameter *and read it* — or,
 * more likely, delete this file and the 37 call sites together.
 */
function buildShadows() {
  return {
    none: { boxShadow: FLAT },
    xs: { boxShadow: FLAT },
    sm: { boxShadow: FLAT },
    md: { boxShadow: FLAT },
    lg: { boxShadow: FLAT },
    xl: { boxShadow: FLAT },
    xxl: { boxShadow: FLAT },
  };
}

/**
 * Still a hook, still named `useShadows`, still spread into a style by 37 files.
 *
 * It no longer reads the theme, and that is worth being explicit about: the reason this was
 * a hook rather than a constant is that a shadow needs to know whether it is on a light or a
 * dark surface — a black shadow is invisible on near-black, which is what the accent glow
 * was invented for. Flat surfaces have no such requirement, so the distinction is gone even
 * though the call signature is not.
 *
 * Note the shape of the old bug for whoever wants a theme-dependent shadow back:
 * `account.tsx` inferred dark mode by comparing a colour to a hex literal
 * (`colors.background === "#111A17"`), which is false for any value but that one, so
 * retuning the background silently disabled it with no error anywhere. `resolvedTheme` from
 * the provider is the answer if it is ever needed — but do not reintroduce an
 * accepted-and-ignored parameter to get it. See `buildShadows`.
 */
export function useShadows() {
  return buildShadows();
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
