/**
 * Every foreground/background pair the app actually renders must clear its WCAG bar, in
 * both themes.
 *
 *   node scripts/verify-contrast.mjs            # both themes
 *   node scripts/verify-contrast.mjs dark       # one theme
 *
 * ── Why this is a script and not a design note ───────────────────────────────────────
 * Three real contrast failures shipped in this project, and every one of them looked
 * correct in a screenshot:
 *
 *   · A primary button in dark mode was a light sage `#8FB8A8` with white text: 2.19:1.
 *   · `textMuted`, behind 275 usages, was 3.37:1 on the page background.
 *   · The low-stock count on the admin dashboard — the most safety-relevant number in the
 *     app — was gold at 2.69:1 on white.
 *
 * None of them look wrong in isolation. A pale mint button looks deliberate. A soft grey
 * caption looks like good hierarchy. Warm gold on white looks like a brand decision. The
 * defect only appears as a *number*, and nobody computes contrast numbers by eye.
 *
 * ── Why the pairs are enumerated rather than scanned ────────────────────────────────
 * A script that scanned every `backgroundColor`/`color` pairing in the source would report
 * hundreds of combinations, most of which never render together — a `color` on one branch
 * and a `backgroundColor` on another are not a pair. So this list is the set of pairs that
 * genuinely appear on screen, written out by hand and reviewed. That is a real maintenance
 * cost, and it is the right trade: a check that fires on things nobody renders trains people
 * to ignore it, and then it stops catching the ones that matter.
 *
 * The 4.5 bar is AA for body text. 3.0 is the AA bar for a non-text boundary, which is why
 * the focus ring is held to 3 and a card's hairline edge to 1.2 — an edge too faint to see
 * is not an accessibility failure, it is two cards that look like one panel, so it is
 * checked but not held to the text bar.
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** WCAG 2.1 relative luminance. */
const luminance = (hex) => {
  const s = hex.replace('#', '')
  const channel = (v) => {
    const c = parseInt(s.slice(v, v + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/** WCAG 2.1 contrast ratio. */
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const grade = (r) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA-large only' : 'unreadable')

/**
 * Load the palette out of the real module rather than a copy of it.
 *
 * Scraping `"key": "#hex"` pairs is what the first version did, and it missed every key
 * built by a spread — `backgroundAlt`, `dangerSoft`, `onStatus` — so 18 of 23 checks
 * reported "undefined" and the two that could run both passed. A contrast report that
 * cannot see the colour it is testing is worse than none: it prints a summary line saying
 * the palette is fine.
 */
const load = async (file, tag) => {
  const dir = mkdtempSync(join(tmpdir(), 'hibbullah-contrast-'))
  const out = join(dir, `${tag}.mjs`)
  writeFileSync(
    out,
    stripTypeScriptTypes(readFileSync(file, 'utf8')).replace(/export default[^;]+;/g, ''),
  )
  return import(pathToFileURL(out).href)
}

const light = await load('src/constants/colors.ts', 'light')
const dark = await load('src/constants/darkColors.ts', 'dark')
const THEMES = { light: light.colors, dark: dark.darkColors }

/**
 * The pairs, and the bar each has to clear.
 *
 * `bar: 4.5` is body text. `bar: 3` is a non-text boundary — a focus ring, an icon that
 * carries meaning without words. `bar: 1.2` is a decorative edge, present so that a card
 * reads as a card.
 */
const CHECKS = [
  // ── body text ──────────────────────────────────────────────────────────────────────
  ['body text on a card', 'text', 'backgroundAlt', 4.5],
  ['body text on the page', 'text', 'background', 4.5],
  ['secondary text on a card', 'textSecondary', 'backgroundAlt', 4.5],
  ['secondary text on the page', 'textSecondary', 'background', 4.5],
  // The one that was worst: 3.37:1, behind 275 usages, mostly 11–13px captions.
  ['muted text on a card', 'textMuted', 'backgroundAlt', 4.5],
  ['muted text on the page', 'textMuted', 'background', 4.5],

  // ── the accent, as ink ─────────────────────────────────────────────────────────────
  ['accent link on a card', 'accent', 'backgroundAlt', 4.5],
  ['accent link on the page', 'accent', 'background', 4.5],
  ['accent on a soft accent fill', 'accent', 'primarySoft', 4.5],
  ['accent on a muted accent fill', 'accent', 'primaryMuted', 4.5],

  // ── labels on fills ───────────────────────────────────────────────────────────────
  // `textInverse`, not `white`. A `primary` fill now inverts between the themes — a deep
  // teal in light, the light sage in dark — so its label has to invert with it, which is
  // the same reason the four status fills below use this token and not `white`.
  //
  // These two lines used to assert `white`, on the reasoning that a `primary` fill was
  // dark in both themes. That was stricter than the component: `Button.tsx` has always
  // read `colors.textInverse` here, so the check and the code disagreed, and the check was
  // the one that would have blocked making the dark-mode primary button the accent. It is
  // now the token the component actually uses, so it polices the real pair in both themes:
  // 12.2:1 light, 8.96:1 dark. A white label on the dark fill is 2.19:1 and is exactly the
  // regression recorded at the top of this file, so `textInverse` is load-bearing here.
  ['label on a primary fill', 'textInverse', 'primary', 4.5],
  ['label on a primary fill, pressed', 'textInverse', 'primaryDark', 4.5],
  // A *status* fill inverts between themes — dark in light, light in dark — so its label
  // has to invert too, which is what `textInverse` is. Using `white` here is what put a
  // 3.5:1 badge on the cart in dark mode while being perfectly correct in light mode.
  ['label on a danger fill', 'textInverse', 'danger', 4.5],
  ['label on a success fill', 'textInverse', 'success', 4.5],
  ['label on a warning fill', 'textInverse', 'warning', 4.5],
  ['label on an info fill', 'textInverse', 'info', 4.5],

  // ── status as ink, which is how warnings and errors are read ───────────────────────
  ['danger text on a card', 'danger', 'backgroundAlt', 4.5],
  ['danger text on its own soft fill', 'danger', 'dangerSoft', 4.5],
  ['success text on a card', 'success', 'backgroundAlt', 4.5],
  ['success text on its own soft fill', 'success', 'successSoft', 4.5],
  // Was 2.69:1: the low-stock count on the admin dashboard.
  ['warning text on a card', 'warning', 'backgroundAlt', 4.5],
  ['warning text on its own soft fill', 'warning', 'warningSoft', 4.5],
  ['info text on a card', 'info', 'backgroundAlt', 4.5],
  ['info text on its own soft fill', 'info', 'infoSoft', 4.5],

  // ── boundaries ─────────────────────────────────────────────────────────────────────
  // A card's edge against the page. 1.2 rather than 3: a hairline is decoration, but a
  // hairline that is invisible is how two cards merge into one panel.
  ['a card edge against the page', 'border', 'background', 1.2],
  // A focus ring has to be unmistakable, so this one is held to the 3:1 UI bar.
  ['a focus ring on a card', 'borderFocus', 'backgroundAlt', 3],
  ['a focus ring on the page', 'borderFocus', 'background', 3],
]

const only = process.argv[2]
const modes = only ? [only] : ['light', 'dark']

let failures = 0
for (const mode of modes) {
  const p = THEMES[mode]
  if (!p) {
    console.log(`unknown theme "${mode}" — expected light or dark`)
    process.exit(2)
  }
  console.log(`\n${mode.toUpperCase()} MODE`)
  let tightest = Infinity
  for (const [name, fgKey, bgKey, bar] of CHECKS) {
    const fg = p[fgKey]
    const bg = p[bgKey]
    if (typeof fg !== 'string' || typeof bg !== 'string') {
      console.log(`  FAIL  ${name.padEnd(36)} ${fgKey}=${fg} ${bgKey}=${bg}`)
      console.log(`        a palette key is missing or is not a colour — the pair could not be checked`)
      failures += 1
      continue
    }
    const r = contrast(fg, bg)
    if (bar >= 4.5) tightest = Math.min(tightest, r)
    const ok = r >= bar
    if (!ok) failures += 1
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(36)} ${r.toFixed(2).padStart(6)}:1  needs ${String(bar).padStart(4)}  ${grade(r).padEnd(13)} ${fg} on ${bg}`,
    )
  }
  console.log(`  tightest text pair: ${tightest.toFixed(2)}:1`)
}

if (failures) {
  console.log(`\n${failures} contrast pair(s) below their bar.`)
  console.log(
    'Fix the palette, not this file. If a pair genuinely cannot appear together, delete it\n' +
      'from CHECKS with a note saying why — do not lower the bar.',
  )
  process.exit(1)
}
console.log(`\nAll ${CHECKS.length} pairs pass in ${modes.join(' and ')}.`)
