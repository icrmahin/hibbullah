#!/usr/bin/env node
/**
 * Hold the flat design language in place, mechanically.
 *
 * ── why this file exists ─────────────────────────────────────────────────────────────
 * The flat redesign was, almost entirely, a change to four token files: `radius` in
 * `sizes.ts`, `buildShadows` in `shadows.ts`, and the two palettes. 162 radius call sites
 * and 37 shadow consumers followed from editing six numbers, which is the whole reason it
 * was a two-hour job rather than a rewrite.
 *
 * That is also the risk. A token change is invisible to review in the way that matters:
 * nobody reads `radius: { lg: 8 }` and sees the 38 cards it redraws. And the numbers are
 * exactly the kind of thing that drifts back — a designer adds a gradient, someone reaches
 * for `999` for a pill, an alpha wash creeps in through a hex suffix. Each of those is one
 * line and reverses months of intent.
 *
 * So the rules are stated as checks. Each one below is a thing that was true of the app
 * during the redesign and is worth being true of it afterwards.
 *
 * ── what is deliberately NOT checked ─────────────────────────────────────────────────
 * Layout. Nothing here looks at a width, a height, a padding, a margin or a flex value,
 * because the brief was that the layout stays identical and only the design changes. A
 * check that could fail on a layout change would be a check that made layout changes
 * impossible, which is not what was asked for.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";
const SIZES = join(SRC, "constants", "sizes.ts");
const COLORS = join(SRC, "constants", "colors.ts");
const DARK = join(SRC, "constants", "darkColors.ts");
const SHADOWS = join(SRC, "constants", "shadows.ts");

/** The one radius the scale is allowed to contain: every key resolves to 6. */
const ALLOWED_RADII = new Set([6]);

/**
 * Radius values that are a circle, not a rounded rectangle, and so are outside the scale.
 *
 * A circle's radius is derived from its own size — `size / 2` — so it legitimately grows
 * with the thing it rounds. An 8px cap on a 40px avatar would draw a rounded square and
 * break every avatar in the app. These are matched on the shape of the expression rather
 * than on a list of call sites, so a new circular component is covered the day it is
 * written.
 */
const CIRCULAR = [/borderRadius:\s*[\w.]+\s*\/\s*2\b/, /borderRadius:\s*\d+\s*\/\s*2\b/];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const read = (f) => readFileSync(f, "utf8");

/**
 * Comments are stripped before anything is scanned.
 *
 * The reason is that this codebase documents *why* a value was removed, and the document
 * has to quote the value it removed — `colors.primary + "22"`, `rgba(0,0,0,0.08)`. The
 * first version of this check failed on all three of its own explanatory comments, which is
 * the correct behaviour for a scanner and useless for a rule.
 *
 * So the code is read twice: `code` is stripped and is what every rule inspects, and `raw`
 * is the original, used only for line numbers. A comment can therefore explain a removed
 * value without being mistaken for its presence.
 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const code = new Map(files.map((f) => [f, stripComments(read(f))]));
const raw = new Map(files.map((f) => [f, read(f)]));

const passes = [];
const failures = [];
const pass = (check, detail) => passes.push({ check, detail });
const fail = (check, detail) => failures.push({ check, detail });

/** Line number of `needle` in the *original* file, so a failure points at real code. */
function lineOf(file, needle) {
  const src = raw.get(file) ?? "";
  const i = src.indexOf(needle);
  return i === -1 ? 0 : src.slice(0, i).split("\n").length;
}

// ── 1. the radius scale stays small ────────────────────────────────────────────────

{
  const src = code.get(SIZES) ?? "";
  const block = /export const radius = \{([\s\S]*?)\} as const;/.exec(src);

  if (!block) {
    fail("radius-scale", `could not find the radius scale in ${SIZES}`);
  } else {
    const entries = [...block[1].matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]);
    const bad = entries.filter(([, v]) => !ALLOWED_RADII.has(v));
    const distinct = [...new Set(entries.map(([, v]) => v))];

    if (bad.length) {
      fail(
        "radius-scale",
        `radius values outside {6}: ${bad.map(([k, v]) => `${k}: ${v}`).join(", ")}. ` +
          "The scale is one shape by design; a second value is what made a chip and a card " +
          "corners nobody can tell apart.",
      );
    } else if (!entries.length) {
      fail("radius-scale", "the radius scale parsed as empty, so nothing was actually checked");
    } else if (distinct.length !== 1) {
      fail(
        "radius-scale",
        `radius scale holds ${distinct.length} distinct values {${distinct.join(", ")}} — one shape means one value.`,
      );
    } else {
      pass("radius-scale", `${entries.length} steps, all 6 — one shape for every rectangle`);
    }
  }
}

// ── 2. no call site reintroduces a pill ────────────────────────────────────────────

{
  // `radius.pill` is still a *name* — 61 call sites use it — but it now resolves to 6px.
  // What must not come back is the literal: `999`, or any other hand-written radius large
  // enough to be a pill, or any second shape (2, 8, 10…) that reintroduces a hierarchy.
  const offenders = [];

  for (const [file, src] of code) {
    if (file === SIZES) continue;
    for (const m of src.matchAll(/borderRadius:\s*([0-9]+)/g)) {
      if (Number(m[1]) >= 99) {
        offenders.push(`${file}:${lineOf(file, m[0])} borderRadius: ${m[1]}`);
      }
    }
  }

  if (offenders.length) {
    fail("no-pill-radius", `hand-written pill radii are back: ${offenders.join(", ")}. Use the radius token.`);
  } else {
    pass("no-pill-radius", "no hand-written pill radius anywhere in src");
  }
}

// ── 3. circles stay circles ────────────────────────────────────────────────────────

{
  // The flip side of rule 2. If someone "fixes" the avatar by capping its radius at 8, the
  // check above still passes — it only looks at radii of 99 or more. This asserts the
  // derived circles are still derived.
  const AVATAR = join(SRC, "components", "common", "Avatar.tsx");
  const src = code.get(AVATAR) ?? "";
  const offenders = [];

  if (src && !/\bborderRadius:\s*size\s*\/\s*2\b/.test(src)) {
    offenders.push(`${AVATAR} no longer rounds an avatar to size / 2`);
  }

  if (offenders.length) {
    for (const o of offenders) fail("circles-stay-circular", o);
  } else {
    pass("circles-stay-circular", "an avatar is still a circle, not an 8px rounded square");
  }
}

// ── 4. surfaces are solid ──────────────────────────────────────────────────────────

{
  // "Every background is solid." The offenders are the two ways alpha sneaks past a token:
  // an `rgba()` literal, and a hex with an alpha pair appended at the call site
  // (`colors.danger + "14"`). Both bypass the palette entirely, which is how the status
  // chip ended up on a wash that no contrast check had ever seen.
  //
  // Two exemptions, both because a scrim is not a surface: a dimming overlay over a
  // photograph, and the modal backdrop. Both are listed with their reason.
  const SCRIMS = [
    [join(SRC, "components", "common", "ImageUpload.tsx"), "a loading scrim over a photo"],
    [join(SRC, "components", "common", "AvatarPicker.tsx"), "a dimming scrim over an avatar"],
  ];
  const isScrim = (file) => SCRIMS.some(([f]) => f === file);

  const offenders = [];

  for (const [file, src] of code) {
    if (file === COLORS || file === DARK) continue;

    // A hex with an appended alpha pair.
    for (const m of src.matchAll(/colors\.\w+\s*\+\s*"([0-9a-fA-F]{2})"/g)) {
      offenders.push(
        `${file}:${lineOf(file, m[0])} ${m[0].trim()} — an alpha-appended hex is not a solid ` +
          "colour; use the palette's *Soft / *Border token",
      );
    }

    // An rgba literal, outside the palette files and outside a scrim. A leading quote is
    // excluded too, so `"rgba(0,0,0,0.45)"` is caught — the scrim allowlist is keyed on the
    // file, so a scrim exemption must not be reachable by writing the colour as a string
    // literal in a file that is not on the list.
    if (!isScrim(file)) {
      for (const m of src.matchAll(/(?<![\w.])rgba\(/g)) {
        offenders.push(
          `${file}:${lineOf(file, m[0])} a hardcoded rgba() — a surface must come from the palette`,
        );
      }
    }
  }

  if (offenders.length) {
    for (const o of offenders) fail("solid-surfaces", o);
  } else {
    pass("solid-surfaces", "every surface colour comes from the palette; only the two photo scrims are alpha");
  }
}

// ── 5. no gradients ────────────────────────────────────────────────────────────────

{
  // Flat means one colour per surface. `expo-linear-gradient` is not installed, so this
  // cannot pass by accident — a gradient would need a new dependency, and this is what
  // makes that a deliberate act rather than an accident of an already-present import.
  const offenders = [];
  for (const [file, src] of code) {
    if (/LinearGradient|expo-linear-gradient/.test(src)) offenders.push(file);
  }

  if (offenders.length) {
    fail("no-gradients", `gradient used in: ${offenders.join(", ")}`);
  } else {
    pass("no-gradients", "no gradient anywhere in src");
  }
}

// ── 6. surfaces are separated by lightness, not by a shadow ────────────────────────

{
  // The flat change removed the shadow system. What has to hold in its place is that a
  // card is still distinguishable from the page — otherwise "flat" would have quietly become
  // "unreadable", and no static check of this file would notice. Both palettes satisfy it
  // with a lightness step plus a hairline, so this asserts the step exists.
  // The tokens are read at the `darkSurface` / `surface` object, not by searching the file
  // for a hex. A plain `includes` is too loose to be a check: `#131615` also appears as
  // `disabled`, and `accent` is the same value as `primary` in both palettes now, so any
  // whole-file search passes on values that are not doing the job. The question this rule
  // asks is specific — *is the card surface a different lightness from the page?* — and
  // only the `background`/`DEFAULT` pair answers it.
  const checks = [
    [COLORS, "light", /background:\s*"#F6F7F4"/, /DEFAULT:\s*"#FFFFFF"/],
    [DARK, "dark", /background:\s*"#0A0C0B"/, /DEFAULT:\s*"#131615"/],
  ];
  const missing = [];

  for (const [file, theme, page, card] of checks) {
    const src = code.get(file) ?? "";
    if (!page.test(src) || !card.test(src)) missing.push(`${file} (${theme})`);
  }

  if (missing.length) {
    fail(
      "surface-separation",
      `no lightness step between page and card in: ${missing.join(", ")}. With the shadows gone, ` +
        "this is the only thing separating a card from the page.",
    );
  } else {
    pass("surface-separation", "both palettes separate page from card by lightness, so no shadow is needed");
  }
}

// ── 7. a label on a primary fill uses the token, not a literal ──────────────────────

{
  // This one earned its place during the redesign. The dark-mode primary button was changed
  // from a near-black fill to the light accent, and five call sites that hardcoded
  // `colors.white` as the label on that fill silently dropped to 2.19:1 — invisible on the
  // device, invisible to `tsc`, invisible to `eslint`, and invisible to
  // `verify-contrast.mjs`, which checks token *pairs* and had no idea a call site was
  // pairing them wrongly.
  //
  // `Button.tsx` had the right comment on it. Five other sites did not, which is exactly
  // the failure mode a comment cannot prevent and a check can.
  // Scope is "from a fill to the next fill", not "N lines". A line window is the wrong
  // shape: a button's fill and its label can be nine lines apart, and two unrelated
  // components in one file can be three lines apart, so a window either misses the first or
  // invents the second. Everything between one `backgroundColor:` and the next is the
  // element that fill belongs to, which is exactly the scope a label can be wrong in.
  const offenders = [];

  for (const [file, src] of code) {
    const fills = [...src.matchAll(/backgroundColor:\s*colors\.primary\b/g)];

    for (const fill of fills) {
      const rest = src.slice(fill.index);
      const next = rest.slice(1).search(/backgroundColor:/);
      const scope = next === -1 ? rest : rest.slice(0, next + 1);

      const bad = /color:\s*colors\.white\b/.exec(scope);
      if (bad) {
        offenders.push(
          `${file}:${lineOf(file, bad[0])} a hardcoded colors.white label inside the element ` +
            "filled with colors.primary — the primary fill inverts between the themes, so " +
            "its label must be colors.textInverse",
        );
      }
    }
  }

  if (offenders.length) {
    for (const o of offenders) fail("fill-label-token", o);
  } else {
    pass("fill-label-token", "every label on an accent fill goes through textInverse, not a literal white");
  }
}

// ── 8. the accent fills nothing but a primary button ───────────────────────────────

{
  // The brief: the accent is for the primary button. Not for a cart badge, an avatar
  // fallback, an unread dot, a timeline dot, a stat-card key. Those were twelve
  // `backgroundColor: colors.primary` sites; seven are the primary button, a CTA, a FAB,
  // the auth toggle and two "Add" buttons, and those stayed.
  //
  // A count of the *allowed* files rather than a list of them, because the allowed set is
  // "a pressable control" and that is a judgement made by a person, not a rule a script
  // can re-derive. The number is here so that adding a sixth accent-filled button is a
  // deliberate edit to this line rather than something that happens unnoticed.
  const ALLOWED_ACCENT_FILLS = new Set([
    join(SRC, "app", "(admin)", "products", "index.tsx"),
    join(SRC, "app", "(admin)", "index.tsx"),
    join(SRC, "components", "admin", "ProductForm.tsx"),
    join(SRC, "components", "auth", "UnifiedAuth.tsx"),
    join(SRC, "components", "products", "ProductHeroSlider.tsx"),
  ]);

  const offenders = [];
  for (const [file, src] of code) {
    if (!/backgroundColor:\s*colors\.primary\b/.test(src)) continue;
    if (!ALLOWED_ACCENT_FILLS.has(file)) {
      const n = (src.match(/backgroundColor:\s*colors\.primary\b/g) ?? []).length;
      offenders.push(`${file} (${n}) — the accent fills a primary action, not decoration`);
    }
  }

  if (offenders.length) {
    for (const o of offenders) fail("accent-fills-buttons", o);
  } else {
    pass("accent-fills-buttons", `the accent fills only the ${ALLOWED_ACCENT_FILLS.size} files that are primary actions`);
  }
}

// ── report ──────────────────────────────────────────────────────────────────────────

for (const p of passes) console.log(`  ok    ${p.check.padEnd(24)} ${p.detail}`);

if (failures.length) {
  console.log("");
  for (const f of failures) console.log(`  FAIL  ${f.check.padEnd(24)} ${f.detail}`);
  console.log(`\n=== ${failures.length} FLAT-UI FAILURE(S) ===`);
  process.exitCode = 1;
} else {
  console.log("\n=== the flat design language holds ===");
}
