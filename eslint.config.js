// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

/**
 * Require every corner in the app to come from the scale in `src/constants/sizes.ts`.
 *
 * 85 call sites had a hard-coded radius across 14 different values, ten of which were not
 * on the scale at all. Half of them were `width / 2` written out longhand — `28×28 r14`,
 * `36×36 r18`, `30×30 r15` — which is a circle written as a magic number, and it drifted
 * apart from the circles beside it that used `radius.pill`. Nobody reading
 * `borderRadius: 18` could tell a circle from a card, and the two that mattered looked
 * different: some circles were capsules and some were squares.
 *
 * So the scale has separate names for the two cases that are genuinely different —
 * `radius.lg` for a surface, `radius.pill` for something that should be as round as it
 * gets — and choosing between them has to be visible in the code.
 *
 * Written as a rule rather than a `no-restricted-syntax` selector because the selector
 * `[value.value=/^[0-9]/]` does not match a numeric `Literal` the way it reads on paper.
 * That version reported zero errors against code that genuinely had four hard-coded radii,
 * which is worse than no rule at all: it looked like the convention was being enforced.
 */
const radiusTokenRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require border radii to come from the radius scale, so corners are consistent across the app.',
    },
    schema: [],
    messages: {
      useToken:
        'Use the radius scale from src/constants/sizes.ts, not a number. `radius.lg` for a card or panel, `radius.md` for an input, `radius.sm` for a small chip, `radius.xl` for a large image, and `radius.pill` for anything that should be a circle — a dot, an avatar, a round icon button, a count badge. A circle written as a magic number (`borderRadius: 18` on a 36×36 box) is the case that caused the drift.',
    },
  },
  create(context) {
    return {
      Property(node) {
        if (node.computed) return;
        const name = node.key?.name ?? node.key?.value;
        if (name !== 'borderRadius') return;
        const v = node.value;
        if (v.type !== 'Literal') return;
        if (typeof v.value !== 'number') return;
        context.report({ node: v, messageId: 'useToken' });
      },
    };
  },
};

const radiusTokenPlugin = {
  rules: { 'radius-token': radiusTokenRule },
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { hibbullah: radiusTokenPlugin },
    rules: { "hibbullah/radius-token": "error" },
  },
  {
    // The scale itself is of course where the numbers live.
    files: ["src/constants/sizes.ts"],
    rules: { "hibbullah/radius-token": "off" },
  },
]);
