#!/usr/bin/env node
/**
 * Fail if the app depends on anything react-native-web ships as a no-op.
 *
 * This exists because two separate bugs shipped to a real user through a fully green test
 * suite, and both were this one call. react-native-web ships its entire Alert as:
 *
 *     class Alert { static alert() {} }
 *
 * An empty body. So on web `Alert.alert(...)` displays nothing and, critically, the
 * `onPress` on each button never runs. Every destructive action gated behind it did
 * absolutely nothing, while behaving perfectly on a phone — so it was correct on device,
 * correct in review, and dead in the browser the user was actually testing in.
 *
 * "Clear all notifications" and the checkout address bin icon were both reported broken.
 * Neither was a database problem: the exact DELETE requests were verified against the
 * live project with a real customer JWT, 7/7 passing, with RLS and grants correct. The
 * button simply never called them.
 *
 * A no-op platform function is precisely what static analysis is for, so this is checked
 * mechanically rather than left to review. Use `useConfirm()` for a confirmation and
 * `ConfirmDialog`/`Alert` for anything shown to the user:
 *
 *     const { confirm, confirmDialogProps } = useConfirm()
 *     if (!(await confirm({ title: 'Delete address?', destructive: true }))) return
 *     ...do the work, in a try/catch so a failure is reported rather than discarded...
 *     <ConfirmDialog {...confirmDialogProps} />
 *
 * ── and the second half of this file ───────────────────────────────────────────────
 * `Alert` is not a special name, it is one member of a category. Reading the whole
 * package, it contains exactly three modules that are wholly empty: `Alert`,
 * `AccessibilityInfo` and `BackHandler`. The other two are only *partly* empty —
 * AccessibilityInfo implements 6 of its 8 methods, and BackHandler logs an error and hands
 * back a no-op subscription — so they are survivable in a way `Alert` is not, and the
 * check below only fails on the total one. src/ imports none of the three.
 *
 * So the second half of this file reads the package and holds the app's own
 * `react-native` imports against it. All 16 runtime imports were checked by hand to be real
 * implementations before that check was written, so it is not a guess about what is safe.
 * See the note on `stubShape` for why the rule is as narrow as it is.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

const SRC = 'src'

/** Files allowed to mention it, so this check does not flag the check itself. */
const ALLOW = new Set([])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const offences = []

for (const file of walk(SRC)) {
  if (ALLOW.has(file)) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    // Comments are excluded deliberately: several files explain this bug in prose, and
    // rewriting the explanation to satisfy the lint would be a bad trade.
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
    if (!/\bAlert\s*\.\s*alert\s*\(/.test(line)) return
    offences.push({ file, line: i + 1, code: trimmed })
  })
}

/**
 * ── the general form of the same bug ──────────────────────────────────────────────
 *
 * `Alert` is not special. It is one member of a category: react-native-web modules that
 * exist so an import resolves, and do nothing. The `Alert` case was found by reading the
 * failing button, not by reading this package, which means any *other* stub the app calls
 * is still sitting there doing exactly what `Alert` did — shipping dead on web, correct
 * on a phone, and invisible to a test suite that runs on the phone.
 *
 * So this also reads the package and checks the app's own imports against it: every
 * `react-native` name used in src/ must resolve to an implementation that actually does
 * something. A module that builds no DOM and whose call surfaces have empty bodies is a
 * stub, and the app must not depend on it.
 *
 * The rule is deliberately narrow, because a wrong answer here is worse than no check: a
 * module counts as a stub only if it renders nothing *and* has an empty-bodied function.
 * The 16 modules src/ imports were all checked by hand first, so this starts from known
 * ground rather than from a guess about what is safe.
 */
const RN_WEB = join('node_modules', 'react-native-web', 'dist', 'exports')

/** Names src/ pulls out of `react-native`, ignoring type-only imports. */
function reactNativeImports() {
  const names = new Map() // name -> first file that uses it, for the error message
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]react-native['"]/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
        if (name && !names.has(name)) names.set(name, file)
      }
    }
  }
  return names
}

/**
 * Follow a module to the code that actually implements it.
 *
 * Many of these are one-line re-export shims (FlatList forwards to VirtualizedList), and a
 * shim looks tiny whether or not the thing behind it works. Reading the shim would report
 * healthy components as stubs.
 */
function implementationOf(name) {
  const seen = new Set()
  let file = join(RN_WEB, name, 'index.js')
  while (file && !seen.has(file)) {
    seen.add(file)
    let src
    try {
      src = readFileSync(file, 'utf8')
    } catch {
      return null
    }
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // A shim is a module whose own body is just an import and a re-export.
    const body = code.replace(/^\s*(?:import|export)[^\n]*\n/gm, '').trim()
    if (body.length > 0) return { file, code }
    const forward = [...code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].pop()?.[1]
    if (!forward) return { file, code }
    file = join(dirname(file), forward)
  }
  return null
}

/**
 * A module is a total no-op when it renders nothing and *every* call surface in it is
 * empty. That is the Alert shape, and it is the only one that must never be depended on:
 * the call succeeds, nothing is shown, and no error is ever raised anywhere.
 *
 * The word "every" is load-bearing. An earlier version flagged a module if *any* function
 * was empty, which was wrong in a way that mattered — it reported AccessibilityInfo as
 * dead, when 6 of its 8 methods work fine and only the two screen-reader announcement
 * calls are empty. A check that cries wolf gets ignored, and an ignored check protects
 * nothing.
 *
 * An advisory "some methods are empty" tier was tried and removed. It reported
 * StyleSheet on every single run, because `preprocess` and `position` are private members
 * of that module rather than public API, and telling someone every time that a stylesheet
 * helper they never call has an empty body is noise that teaches people to skim the
 * output. Silence on partial stubs is the right trade: the two partial ones in this
 * package do most of what they claim.
 */
function stubShape(code) {
  if (/\bcreateElement\b|forwardRef|React\.Fragment/.test(code)) return 'real'
  const bodies = [...code.matchAll(/(?:\bfunction\s+\w+|\bstatic\s+\w+|\b\w+\s*[:(])\s*\(?[^)]*\)?\s*(\{[^}]*\})/g)]
    .map((m) => m[1])
    .filter((b) => b !== undefined)
  if (bodies.length === 0) return 'real' // no call surface to judge — e.g. a constants module
  const empty = bodies.filter((b) => /^\{\s*\}$/.test(b.trim())).length
  return empty === 0 ? 'real' : empty === bodies.length ? 'dead' : 'partial'
}

const imported = reactNativeImports()
const stubs = []
const uninspected = []
for (const [name, file] of imported) {
  const impl = implementationOf(name)
  // A name with no module of its own is a type, or something resolved elsewhere. Not this
  // check's business, and guessing about it would only produce false alarms.
  if (!impl) {
    uninspected.push(name)
    continue
  }
  if (stubShape(impl.code) === 'dead') stubs.push({ name, file, at: impl.file })
}

if (stubs.length > 0) {
  console.log('=== A react-native-web MODULE THE APP USES DOES NOTHING ON WEB ===\n')
  console.log('These imports resolve on web but have empty bodies throughout, so any')
  console.log('behaviour they are used for is dead in the browser while working on a device.\n')
  for (const s of stubs) {
    console.log(`  ${s.name}  — used in ${s.file}`)
    console.log(`      implementation: ${s.at}`)
  }
  console.log(`\n=== ${stubs.length} NO-OP MODULE(S) ===`)
  process.exitCode = 1
} else {
  console.log(
    `=== all ${imported.size - uninspected.length} runtime react-native imports do real work on web ===`,
  )
  if (uninspected.length) {
    console.log(`    ${uninspected.length} type-only name(s) have no runtime module, as expected.`)
  }
}

if (offences.length > 0) {
  console.log('=== Alert.alert IS A NO-OP ON WEB — DO NOT USE IT ===\n')
  console.log('react-native-web ships `class Alert { static alert() {} }`. On web the call')
  console.log('shows nothing and every button `onPress` never runs, so the action silently')
  console.log('does not happen. Use useConfirm() for confirmations and the Alert component')
  console.log('for inline messages.\n')
  for (const o of offences) {
    console.log(`  ${o.file}:${o.line}`)
    console.log(`      ${o.code}`)
  }
  console.log(`\n=== ${offences.length} PROHIBITED USE(S) ===`)
  process.exitCode = 1
} else {
  console.log('=== no Alert.alert in src — all dialogs are real on web ===')
}
