#!/usr/bin/env node
/**
 * Prove every rule in `verify-flat-ui.mjs` fails when the thing it rules on is broken.
 *
 * A guard that has never been observed failing is not evidence of anything. This walks each
 * of the eight flat-UI rules, applies the mutation that rule exists to catch, and asserts
 * the guard rejects it. A guard with no matching mutation here is reported as uncovered
 * rather than passing quietly.
 *
 * The mutations are the shapes that actually occurred during the redesign, not invented
 * hypotheticals — a pill radius creeping back, a hardcoded `rgba` surface, a white label on
 * a fill that has just been made light.
 */
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const ROOT = process.cwd();
const GUARD = join("supabase", "verify-flat-ui.mjs");

/** Run the guard against a scratch copy of the repo and report whether it failed. */
function runGuard(root) {
  try {
    execFileSync(process.execPath, [join(root, GUARD)], { cwd: root, stdio: "pipe" });
    return { failed: false, output: "" };
  } catch (error) {
    return { failed: true, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

/** The rule a failure is attributed to, parsed out of the guard's own report. */
function ruleOf(output) {
  const m = /FAIL\s+(\S+)/.exec(output);
  return m ? m[1] : null;
}

const MUTATIONS = [
  {
    rule: "radius-scale",
    what: "widen the scale past a single 6, back to a soft 10/12/16",
    file: "src/constants/sizes.ts",
    apply: (s) => s.replace(/(\n\s*sm:\s*)6,/, "$110,").replace(/(\n\s*lg:\s*)6,/, "$116,"),
  },
  {
    rule: "no-pill-radius",
    what: "bring the pill radius back at a call site",
    file: "src/components/common/ConfirmDialog.tsx",
    // The real regression: someone hardcodes 999 rather than using the token.
    apply: (s) => s.replace("borderRadius: radius.xl", "borderRadius: 999"),
  },
  {
    rule: "circles-stay-circular",
    what: "cap the avatar at 8px, turning it into a rounded square",
    file: "src/components/common/Avatar.tsx",
    apply: (s) => s.replace("borderRadius: size / 2", "borderRadius: 8"),
  },
  {
    rule: "solid-surfaces",
    what: "build a surface by appending an alpha pair to a token",
    file: "src/app/(customer)/checkout.tsx",
    apply: (s) => s.replace("colors.dangerSoft", 'colors.danger + "14"'),
  },
  {
    rule: "solid-surfaces",
    what: "hardcode an rgba surface, bypassing the palette",
    file: "src/app/(admin)/index.tsx",
    apply: (s) => s.replace("colors.borderFocus", '"rgba(18,60,53,0.13)"'),
  },
  {
    rule: "no-gradients",
    what: "add a gradient to a card",
    file: "src/components/products/ProductCard.tsx",
    apply: (s) =>
      s.replace(
        'import { useThemeColors } from "../../providers/ThemeProvider";',
        'import { LinearGradient } from "expo-linear-gradient";\nimport { useThemeColors } from "../../providers/ThemeProvider";',
      ),
  },
  {
    rule: "surface-separation",
    what: "make the dark card the same lightness as the page, so only a shadow separated them",
    file: "src/constants/darkColors.ts",
    // The `darkSurface` entry specifically — `disabled` also holds `#131615`, and
    // replacing the first occurrence is what changes the card, not the disabled fill.
    apply: (s) => s.replace('  DEFAULT: "#131615",', '  DEFAULT: "#0A0C0B",'),
  },
  {
    rule: "fill-label-token",
    what: "hardcode a white label on the accent fill — the 2.19:1 regression",
    file: "src/app/(admin)/index.tsx",
    // Every occurrence, not the first. This file uses `textInverse` in three places and the
    // one that matters is the label *inside* the `colors.primary` fill; replacing only the
    // first would change a different element and prove nothing.
    apply: (s) => s.replaceAll("colors.textInverse", "colors.white"),
  },
  {
    rule: "accent-fills-buttons",
    what: "fill a decorative badge with the accent",
    file: "src/components/common/Avatar.tsx",
    apply: (s) => s.replace("backgroundColor: colors.border", "backgroundColor: colors.primary"),
  },
];

// ── baseline: the guard must pass on the real tree ─────────────────────────────────

{
  const result = runGuard(ROOT);
  if (result.failed) {
    console.error("The guard does not pass on the current tree, so nothing below means anything:");
    console.error(result.output);
    process.exit(1);
  }
}

// ── run each mutation against a scratch copy ───────────────────────────────────────

let uncovered = 0;

for (const [i, mutation] of MUTATIONS.entries()) {
  const scratch = mkdtempSync(join(tmpdir(), "flat-ui-"));
  const label = `${String(i + 1).padStart(2, " ")}. ${mutation.what}`;

  try {
    // Copy only what the guard reads: src/ and the guard itself.
    cpSync(join(ROOT, "src"), join(scratch, "src"), { recursive: true });
    cpSync(join(ROOT, GUARD), join(scratch, GUARD));

    const target = join(scratch, mutation.file);
    if (!existsSync(target)) {
      console.log(`  SKIP  ${label}\n          (no such file: ${mutation.file})`);
      uncovered++;
      continue;
    }

    const before = readFileSync(target, "utf8");
    const after = mutation.apply(before);

    if (after === before) {
      console.log(`  SKIP  ${label}\n          (the mutation did not change the file)`);
      uncovered++;
      continue;
    }

    writeFileSync(target, after);
    const result = runGuard(scratch);
    const rule = ruleOf(result.output);

    if (result.failed && rule === mutation.rule) {
      console.log(`  caught   ${label}\n             -> ${rule}`);
    } else if (result.failed) {
      // It failed, but for a different rule. Still a detection, but not the one asserted.
      console.log(`  WRONG    ${label}\n             -> expected ${mutation.rule}, got ${rule}`);
      uncovered++;
    } else {
      console.log(`  MISSED   ${label}\n             -> ${mutation.rule} passed anyway`);
      uncovered++;
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

console.log("");

if (uncovered) {
  console.log(`=== ${uncovered} MUTATION(S) NOT PROVEN ===`);
  process.exitCode = 1;
} else {
  console.log(`every flat-UI guard fails when the thing it guards is broken (${MUTATIONS.length} mutations)`);
}
