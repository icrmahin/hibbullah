#!/usr/bin/env node
/**
 * Fail on the four things that shipped broken to a real user's phone and passed a green
 * build.
 *
 * Every check here guards a bug that was found by running the installed APK, not by
 * reading code. Each one is invisible to `tsc`, to `eslint`, to the web export, and to
 * the whole existing test suite — which is exactly why they shipped. In all four cases
 * the code was correct on the developer's machine and wrong on the device, so static
 * analysis is the only place the class of fault can be caught before the next build.
 *
 * ── 1. a render error must not end the process ─────────────────────────────────────
 * Opening an order in the admin app closed it, with no error and no way back. The throw
 * came from `Intl.DateTimeFormat.prototype.format()`, which throws `RangeError: Invalid
 * time value` on an invalid date — unlike `toLocaleString`, which returns the string
 * "Invalid Date" and so hides the same mistake. There was no ErrorBoundary anywhere in
 * the app, so the throw during render took the process with it. This checks both halves:
 * the boundary exists and implements the two hooks React requires, and the root layout
 * actually mounts it around the navigator.
 *
 * ── 2. a date formatter must never hand Intl an Invalid Date ───────────────────────
 * `orders.timeline` is a `jsonb` column, so Postgres serialises the timestamps inside it
 * to its own text form — `2026-09-26 20:34:37.88504+00`: a space instead of `T`, `+00`
 * instead of `+00:00`, and however many fractional digits the column kept. That is not
 * ISO 8601. V8 parses it leniently, so the web export is clean; Hermes is spec-strict,
 * returns an Invalid Date, and the `Intl` throw above follows.
 *
 * So all date formatting goes through `src/utils/date.ts`, which normalises that shape
 * and checks the result before formatting. This asserts that file still guards, and that
 * no other file has grown its own unguarded `Intl.DateTimeFormat(...).format(` — the
 * obvious way to reintroduce the same crash in one line.
 *
 * ── 3. a FormData part must not be the React Native `{ uri }` shape ───────────────
 * Every image upload failed on the device with
 * "Cloudinary upload failed: unsupported from Datapart implementation", which is
 * "Unsupported FormDataPart implementation". Expo SDK 57 replaces global `fetch` with
 * its own implementation, and its converter accepts only a string, a Blob, or an object
 * with `bytes()`. Its own source says it: "uri is not supported for React Native's
 * FormData". The app was appending `{ uri, name, type }`, the classic React Native part.
 * It worked on web because the web branch appended a real Blob — so the failure was
 * invisible to every web-based check, and hit avatars and product photos alike.
 *
 * ── 4. a customer must never be shown a stock indicator ──────────────────────────
 * The catalog showed "24 in stock" and "Only 3 left", and the product page showed "18
 * available". An exact number is business information: it tells a customer how much to
 * buy before a restock, and how much a competitor has sold. The numbers went first, then
 * the availability wording, then the out-of-stock scrim — the requirement is that a
 * customer sees no stock information at all, not merely that the count is hidden. What is
 * left is the disabled add button, which is a control rather than a readout.
 *
 * The admin catalog still shows counts. It has to: it is the screen that manages them.
 * This check is therefore scoped to customer-facing files.
 *
 * ── 5. a row-shaped card must not be put in the product grid ──────────────────────
 * The admin catalog listed no products, while the customer catalog beside it listed them
 * fine. Same RPC, same RLS, same mappers, same FlashList setup. The one difference was the
 * card: `AdminProductCard` lays out as a row — an 88px photo beside the text — and the
 * screen gave it `numColumns={columns}`, the product-grid count of 2 on a phone. Every text
 * field got 36px, the name collapsed to zero because the status badge beside it has an
 * intrinsic width, and `minWidth: 0` turned the overflow into a silent clip instead of a
 * visible one. Two columns of unreadable slivers look exactly like an empty catalog, and
 * nothing in tsc, eslint or the web export can see it: at desktop widths it renders
 * perfectly. This checks that a screen asking for the product grid renders cards that
 * actually stack.
 *
 * ── 6. a local file must not be judged by an HTTP status ──────────────────────────
 * "Could not read selected image", on every product and avatar upload, from a device. The
 * read was gated on `if (!res.ok) throw`, and `ok` means `status >= 200 && status < 300` —
 * an HTTP question, asked of a `file://` URI, which does not answer with a 2xx. The guard
 * therefore threw on every upload, before any byte was examined, and reported a broken
 * image instead of the real fault. The size check beside it had the same shape: `blob.size`,
 * a web property, standing in for a native byte count. On native the file must be read with
 * `expo-file-system`'s `File`, whose `exists`, `size` and `bytes()` are real. This checks
 * that no local-file read is gated on a status, and that a real read exists to gate.
 *
 * ── 7. a search bar that navigates must not contain a TextInput ───────────────────
 * The home search bar did nothing when tapped. It had already been "fixed" twice, and both
 * fixes tried to keep a TextInput in the tree and stop it taking the touch: `readOnly`,
 * which React Native resolves to `editable={false}` — and a non-editable TextInput is not a
 * touch responder, so the bar was dead everywhere — then a `Pressable` wrapper with
 * `pointerEvents="none"`, which on the device left the magnifier tappable and the rest of
 * the bar inert. A focusable text field is a second competing claim on a touch, and which
 * claim wins is a platform detail, so the reliable fix is not to have one. This checks the
 * shape: the `onPress` branch returns before a `TextInput` is created, and the bar's styles
 * are on the `Pressable` so no touch can resolve to a child instead of the responder.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, basename, sep } from 'node:path'
import { loadTsModule, cleanup } from './lib/load-ts-module.mjs'

const SRC = 'src'
const failures = []
const passes = []

const fail = (check, detail) => failures.push({ check, detail })
const pass = (check, detail) => passes.push({ check, detail })

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

/**
 * Source with comments removed.
 *
 * Necessary rather than fussy: these files explain the bugs they are guarded against in
 * prose, and several of those explanations quote the forbidden string verbatim. Rewriting
 * a comment to satisfy a lint would be a bad trade.
 */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const allFiles = walk(SRC)
const code = new Map(allFiles.map((f) => [f, stripComments(readFileSync(f, 'utf8'))]))

// ── 1. the error boundary ─────────────────────────────────────────────────────────

{
  const BOUNDARY = join(SRC, 'components', 'common', 'ErrorBoundary.tsx')
  const src = code.get(BOUNDARY) ?? ''

  if (!src) {
    fail('error-boundary', `${BOUNDARY} does not exist`)
  } else {
    if (!/getDerivedStateFromError/.test(src)) {
      fail('error-boundary', 'ErrorBoundary.tsx has no getDerivedStateFromError')
    }
    if (!/componentDidCatch/.test(src)) {
      fail('error-boundary', 'ErrorBoundary.tsx has no componentDidCatch')
    }
    if (/getDerivedStateFromError/.test(src) && /componentDidCatch/.test(src)) {
      pass('error-boundary', 'ErrorBoundary.tsx implements both React hooks')
    }
  }

  // Mounted, not merely present. A boundary that exists but wraps nothing is the same
  // as no boundary, and the file existing is not evidence that anything uses it.
  const LAYOUT = join(SRC, 'app', '_layout.tsx')
  const layout = code.get(LAYOUT) ?? ''
  const mounted = /<AppErrorBoundary[\s>]/.test(layout)
  const aroundStack =
    /<AppErrorBoundary[^>]*>\s*<Stack/.test(layout) ||
    /<Stack[^>]*>\s*<AppErrorBoundary/.test(layout)

  if (!mounted) fail('error-boundary-mounted', `${LAYOUT} does not render <AppErrorBoundary>`)
  else if (!aroundStack) fail('error-boundary-mounted', `<AppErrorBoundary> in ${LAYOUT} does not wrap the <Stack>`)
  else pass('error-boundary-mounted', 'the root layout wraps the navigator in the boundary')
}

// ── 2. date formatting stays guarded and centralised ──────────────────────────────

{
  const DATE = join(SRC, 'utils', 'date.ts')
  const src = code.get(DATE) ?? ''

  if (!src) {
    fail('date-guard', `${DATE} does not exist`)
  } else {
    // The guard is what turns a crash into a dash: a parsed value is checked for NaN
    // before it reaches Intl, which throws rather than degrading.
    const checks = /Number\.isNaN\(|isNaN\(/.test(src)
    const hasPlaceholder = /UNKNOWN_DATE|—/.test(src)

    // The bail-out is asserted per formatter, not once per file. `isNaN` living
    // somewhere in date.ts is not the property — the property is that `formatDate` and
    // `formatDateTime` each refuse to call Intl on a date they could not parse.
    // `formatShortDate` delegates to `formatDate`, so two is the required count.
    const REQUIRED_BAIL_OUTS = 2
    const bailOuts = (src.match(/return UNKNOWN_DATE/g) ?? []).length
    const guardsEachFormatter = bailOuts >= REQUIRED_BAIL_OUTS

    // The two details that actually fix the Postgres shape. `2026-09-26 20:34:37.88504+00`
    // needs its space replaced with `T`, and its two-digit offset padded to `+00:00`;
    // without either, Hermes returns an Invalid Date. Both are asserted as the regex
    // fragments that perform them rather than as a `replace` call, because the rewrite
    // can be done by a match-and-rebuild and the call shape is not the point.
    const splitsSpaceAndT = src.includes('[ T]')
    const recognisesTwoDigitOffset = src.includes('[+-]\\d{2}')
    const padsOffset = /\$\{[A-Za-z_][A-Za-z0-9_]*\}:00/.test(src)

    if (!checks) fail('date-guard', `${DATE} never checks the parsed date for NaN`)
    if (!hasPlaceholder) fail('date-guard', `${DATE} has no fallback for an unreadable date`)
    if (!guardsEachFormatter) {
      fail(
        'date-guard',
        `${DATE} has ${bailOuts} invalid-date bail-out(s), needs ${REQUIRED_BAIL_OUTS} — a formatter would hand Intl an Invalid Date`,
      )
    }
    if (!splitsSpaceAndT) fail('date-guard', `${DATE} does not accept the space-separated Postgres shape`)
    if (!recognisesTwoDigitOffset) fail('date-guard', `${DATE} does not match the two-digit UTC offset Postgres emits`)
    if (!padsOffset) fail('date-guard', `${DATE} does not pad that offset to the +HH:MM ISO form`)
    if (
      checks &&
      hasPlaceholder &&
      guardsEachFormatter &&
      splitsSpaceAndT &&
      recognisesTwoDigitOffset &&
      padsOffset
    ) {
      pass('date-guard', 'date.ts normalises the Postgres shape, checks each formatter, and falls back')
    }
  }

  // One formatter, so one place to be correct.
  const strays = allFiles.filter(
    (f) => f !== DATE && /Intl\s*\.\s*DateTimeFormat/.test(code.get(f) ?? ''),
  )
  if (strays.length) {
    fail(
      'date-centralised',
      `direct Intl.DateTimeFormat use bypasses the guard: ${strays.join(', ')}`,
    )
  } else {
    pass('date-centralised', 'every date format goes through src/utils/date.ts')
  }

  // The check above is structural: it proves the guard has not been deleted. It cannot
  // prove the guard is *correct*, or that it still accepts the value that actually caused
  // the crash. That value is pinned here, taken from a live `orders.timeline` row: a space
  // instead of `T`, five fractional digits, and a `+00` offset. Hermes rejects it as a
  // date; V8 accepts it, which is why this is a device-only fault that a web export, a
  // typecheck and the test suite all pass straight through.
  {
    const mod = await loadTsModule(DATE)
    const { formatDateTime, toDate } = mod

    // Every spelling of the same instant, asserted to land on the same calendar day. A
    // parser that returned a *wrong* date would be a worse bug than the crash, because it
    // would never throw and so nothing would ever report it.
    const realValue = '2026-09-26 20:34:37.88504+00'
    const sameInstant = [
      realValue,
      '2026-09-26T20:34:37.88504+00:00',
      '2026-09-26T20:34:37.88504Z',
      '2026-09-26T20:34:37.885+00:00',
      '  2026-09-26 20:34:37.88504+00  ',
    ]

    const wrongDay = sameInstant
      .map((v) => [v, toDate(v)])
      .find(([, d]) => !d || d.toISOString().slice(0, 10) !== '2026-09-26')
    if (wrongDay) {
      const [v, d] = wrongDay
      fail('date-parses', `${JSON.stringify(v)} -> ${d ? d.toISOString() : 'Invalid Date'}`)
    } else {
      pass('date-parses', 'the real timeline timestamp parses, in all five spellings')
    }

    // Date-only, a negative offset, and a leap-free month boundary — all shapes that occur
    // in orders, and all of which a stricter rewrite would be at risk of dropping.
    const edgeCases = ['2026-09-26', '2026-09-26T14:00:00+06:00', '2026-01-31T00:00:00Z']
    const badEdge = edgeCases.find((v) => !toDate(v))
    if (badEdge) fail('date-parses', `${badEdge} no longer parses`)
    else pass('date-parses', 'date-only, negative-offset and ISO inputs still parse')

    // The crash itself. Each of these reached `Intl.DateTimeFormat.format()` as an Invalid
    // Date and threw `RangeError: Invalid time value`, which is what took the process down.
    // None may throw now, and none may render a fabricated date in place of a dash.
    const junk = [
      '',
      '   ',
      'not a date',
      '2026-13-45T99:99:99Z',
      'undefined',
      'null',
      realValue.replace('2026', 'not-a-year'),
    ]
    let threw = null
    let fabricated = null
    for (const value of junk) {
      try {
        const out = formatDateTime(value)
        if (out && !out.includes('—')) fabricated = fabricated ?? `${JSON.stringify(value)} rendered as ${out}`
      } catch (e) {
        threw = threw ?? `${JSON.stringify(value)} threw ${e.message}`
      }
    }
    if (threw) fail('date-never-throws', threw)
    else if (fabricated) fail('date-never-throws', fabricated)
    else pass('date-never-throws', '7 unreadable values render a dash, and none throw')
  }

  cleanup()
}

// ── 3. no React Native `{ uri }` FormData part ────────────────────────────────────

{
  // `append(name, { uri: … })` — the shape Expo's fetch converter rejects outright.
  const RN_PART = /\.append\(\s*['"`][^'"`]+['"`]\s*,\s*\{[^}]*\buri\s*:/g
  const offenders = []

  for (const [file, src] of code) {
    const lines = src.split('\n')
    lines.forEach((line, i) => {
      if (RN_PART.test(line)) offenders.push({ file, line: i + 1, code: line.trim() })
      RN_PART.lastIndex = 0
    })
  }

  if (offenders.length) {
    for (const o of offenders) fail('formdata-part', `${o.file}:${o.line}  ${o.code}`)
  } else {
    pass('formdata-part', 'no FormData part uses the unsupported { uri } shape')
  }
}

// ── 4. customers are shown no stock information at all ────────────────────────────

{
  // Customer-facing only. src/components/admin/** is where stock is managed, the exact
  // number is the point of the screen, and the admin catalog still shows it.
  const isCustomer = (f) => f.startsWith(join(SRC, 'app', '(customer)'))
  const customerFiles = allFiles.filter(isCustomer)
  const CARD = join(SRC, 'components', 'products', 'ProductCard.tsx')
  if (allFiles.includes(CARD)) customerFiles.push(CARD)

  // Three shapes to reject, because the requirement is not "hide the number" but "show no
  // stock information": a count interpolated into rendered text, an availability label, and
  // prose that describes stock as a customer-facing fact.
  const TEMPLATE_COUNT = /\$\{[^{}]*\bstock\b[^{}]*\}/g
  const BARE_COUNT = /\{[^{}]*\.stock\s*\}/g
  const AVAILABILITY_LABEL =
    /(?<![A-Za-z])(In stock|Out of stock|Only a few left|Low stock|only \d+ left|\d+ (?:in stock|available|left))(?![\w])/gi

  // A comparison such as `{product.stock > 0}`, or the quantity cap that keeps a customer
  // from ordering more than exists, is a control rather than a readout and is allowed.
  // The disabled purchase button is allowed for the same reason: a disabled control with
  // no stated reason is worse than the information it replaces.
  const ALLOWED = /disabled=|accessibilityLabel|Button title=|<Button|Math\.min|stock >|stock ===|stock <|stock \|\||outOfStock/;

  const leaks = []
  for (const file of customerFiles) {
    const lines = (code.get(file) ?? '').split('\n')
    lines.forEach((line, i) => {
      const trimmed = line.trim()
      const record = () => leaks.push({ file, line: i + 1, code: trimmed })

      if (TEMPLATE_COUNT.test(line)) record()
      TEMPLATE_COUNT.lastIndex = 0
      if (BARE_COUNT.test(line)) record()
      BARE_COUNT.lastIndex = 0
      // "Out of stock" on the disabled add button is allowed; availability wording
      // anywhere else is a readout.
      if (AVAILABILITY_LABEL.test(trimmed) && !ALLOWED.test(trimmed)) record()
      AVAILABILITY_LABEL.lastIndex = 0
    })
  }

  if (leaks.length) {
    for (const l of leaks) fail('stock-disclosure', `${l.file}:${l.line}  ${l.code}`)
  } else {
    pass('stock-disclosure', 'no customer screen renders a count or an availability label')
  }
}

// ── 5. a row-shaped card must not be put in the product grid ──────────────────────

{
  // The admin catalog listed no products. Nothing was wrong with the query, the RLS, the
  // mapping or the list: `AdminProductCard` is a *row* card — an 88px photo beside the name,
  // the badge, the price and the unit count — and the screen asked FlashList for
  // `numColumns={columns}`, the product *grid* count, which is 2 on every phone width.
  //
  // At 393dp that is a 164px cell. 104px of it is the photo and its padding, leaving 36px
  // for every piece of text. The name is `flex: 1` in a row with the status badge, so the
  // badge's intrinsic width drove the name to zero, and the brand, the price and the count
  // all clipped. The cell carried `minWidth: 0`, so it clipped rather than overflowed —
  // nothing spilled past the edge, nothing looked broken, and the screen read as empty
  // rather than as wrong. Two unreadable columns are indistinguishable from no products.
  //
  // `useResponsive` already has the right number. `listColumns` is 1 on a phone for exactly
  // this reason, and every other row-card screen (orders, customers, admin and customer)
  // uses it. What was missing was anything stopping a row card from being handed the
  // product-grid count instead, so this is that: a screen asking for the product grid has
  // to render cards that actually stack.
  const GRID_KNOB = 'columns'

  // Follow a destructuring rename, so `const { listColumns: columns }` cannot quietly
  // reintroduce the grid count under the name the check looks for.
  const resolveKnob = (src, id) => {
    for (const m of src.matchAll(/\b(listColumns|columns)\s*:\s*([A-Za-z_$][\w$]*)/g)) {
      if (m[2] === id) return m[1]
    }
    return id
  }

  const offenders = []
  const audited = []

  for (const file of allFiles.filter((f) => f.startsWith(join(SRC, 'app')))) {
    const src = code.get(file) ?? ''
    const numColumns = src.match(/numColumns=\{\s*([A-Za-z_$][\w$]*)\s*\}/)
    if (!numColumns) continue

    const knob = resolveKnob(src, numColumns[1])
    const cardTags = [...src.matchAll(/<([A-Z][A-Za-z0-9_$]*Card)\b/g)].map((m) => m[1])
    if (!cardTags.length) continue

    audited.push(`${file} → ${knob} × ${[...new Set(cardTags)].join(', ')}`)
    if (knob !== GRID_KNOB) continue

    for (const tag of new Set(cardTags)) {
      // Match on the file's basename within a `components` directory, not on a path
      // suffix: `src/components/admin/AdminProductCard.tsx` does not end with
      // "components/AdminProductCard.tsx", and a lookup that silently matches nothing
      // makes this check decorative — it audits zero cards and can never fail.
      const component = allFiles.find(
        (f) => basename(f) === `${tag}.tsx` && f.includes(`${sep}components${sep}`),
      )
      if (!component) {
        offenders.push(`${file} renders <${tag}>, but no ${tag}.tsx was found under components/`)
        continue
      }

      // The card's own root style, which is the element the grid cell constrains.
      const componentSrc = code.get(component) ?? ''
      const cardStyle = componentSrc.match(/\n\s*card:\s*\{([\s\S]*?)\n\s{2}\},/)
      if (!cardStyle) continue

      if (/flexDirection\s*:\s*["']row["']/.test(cardStyle[1])) {
        offenders.push(
          `${file} renders ${tag} (a row card: its "card" style is flexDirection: "row") ` +
            `at numColumns={${knob}}, which is ${GRID_KNOB} — the product-grid count. ` +
            `Use listColumns for a row card, or give the card a vertical layout.`,
        )
      }
    }
  }

  if (offenders.length) {
    for (const o of offenders) fail('grid-card-shape', o)
  } else {
    pass(
      'grid-card-shape',
      `${audited.length} grid(s) audited; every card handed the product-grid count stacks vertically`,
    )
  }
}

// ── 6. a local file must not be judged by an HTTP status ──────────────────────────

{
  // Every image upload on a device failed with "Could not read selected image" — a
  // message that blames the image when the image was fine. The guard in front of the read
  // was `if (!res.ok) throw`, and `ok` is `status >= 200 && status < 300`
  // (`FetchResponse.ts:359`). Fetching a `file://` URI does not yield a 2xx, so the guard
  // threw on every single upload before a single byte was examined, and the real cause
  // never surfaced.
  //
  // There is no status to trust for a local file, so none may be consulted. The one place
  // a status is meaningful is a real HTTP request, which is the Cloudinary upload; and the
  // one place a browser `fetch` of a `blob:`/`data:` URL has a real status is a web-only
  // branch. Everything else has to establish that it read something by counting bytes.
  const STORAGE = join(SRC, 'services', 'storage.ts')
  const src = code.get(STORAGE) ?? ''

  if (!src) {
    fail('local-file-read', `${STORAGE} does not exist`)
  } else {
    const offenders = []
    const lines = src.split('\n')

    // Track whether the line is inside a `Platform.OS === 'web'` arm. Set on the way in,
    // cleared by the `} else {` that ends it, and by any line that closes a block.
    let inWebArm = false
    let braceDepth = 0

    lines.forEach((line, i) => {
      const at = i + 1

      if (/Platform\.OS\s*===\s*['"]web['"]/.test(line)) inWebArm = true

      // The real Cloudinary response: an actual HTTP call, so `ok` is the right question.
      if (/\bresponse\.ok\b/.test(line)) {
        // allowed
      } else if (/\bres\.ok\b|\bwebRes\.ok\b/.test(line) && !inWebArm) {
        offenders.push(
          `${STORAGE}:${at}  ${line.trim()}\n` +
            `                 -> \`ok\` is \`status >= 200 && status < 300\`, an HTTP question. A ` +
            `local file read has no status, so this throws on every upload. Check that bytes ` +
            `were read instead.`,
        )
      }

      if (/^\s*}\s*else\s*{\s*$/.test(line)) inWebArm = false
      braceDepth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length
      if (braceDepth <= 0) inWebArm = false
    })

    // The native read has to actually exist, or "no status" would just mean "no read".
    if (!/new File\(/.test(src)) {
      offenders.push(
        `${STORAGE} does not read local image bytes with the filesystem API. On native a ` +
          `local file must be opened with expo-file-system's File, which has a real ` +
          `\`exists\`, a real \`size\` and a real \`bytes()\`.`,
      )
    }
    if (!/\.bytes\(\)/.test(src)) {
      offenders.push(`${STORAGE} never calls \`bytes()\` — nothing is reading the file's bytes.`)
    }

    if (offenders.length) {
      for (const o of offenders) fail('local-file-read', o)
    } else {
      pass('local-file-read', 'local image bytes come from the filesystem API, not an HTTP status')
    }
  }
}

// ── 7. a search bar that navigates must not contain a TextInput ───────────────────

{
  // Tapping the home search bar did nothing. It had been "fixed" twice already, and each
  // fix was a way of keeping a TextInput in the tree and persuading it not to take the
  // touch: first `readOnly` (which React Native resolves to `editable={false}`, and a
  // non-editable TextInput is not a responder at all), then a `Pressable` wrapper with
  // `pointerEvents="none"` on the input. On the device the second one left the magnifier
  // tappable and the rest of the bar inert, because a focusable text field in the tree is a
  // second competing claim on the touch and which claim wins is a platform detail.
  //
  // A `TextInput` cannot be reliably made inert across platforms, so it must not be there.
  // The check is the shape of the fix rather than its intent: the `onPress` branch has to
  // return before the component creates a `TextInput` at all.
  const SEARCH_BAR = join(SRC, 'components', 'common', 'SearchBar.tsx')
  const src = code.get(SEARCH_BAR) ?? ''

  if (!src) {
    fail('searchbar-button', `${SEARCH_BAR} does not exist`)
  } else if (!/\bonPress\?:\s*\(\)\s*=>\s*void/.test(src)) {
    fail('searchbar-button', 'SearchBar no longer accepts onPress, so the home bar cannot navigate')
  } else {
    const branch = src.indexOf('if (onPress)')
    const offenders = []

    if (branch === -1) {
      offenders.push(
        'SearchBar has an onPress prop but no `if (onPress)` branch, so a caller passing ' +
          'onPress still gets a plain field — and a field that navigates has to be a field ' +
          'that cannot be tapped.',
      )
    } else {
      // Bounded to the branch itself. Slicing to the end of the file would sweep in the
      // live-field `return` that follows, whose TextInput is exactly what should be there.
      const nextReturn = src.indexOf('\n  return ', branch)
      const buttonBranch = src.slice(branch, nextReturn === -1 ? src.length : nextReturn)
      if (nextReturn === -1) {
        offenders.push('SearchBar\'s onPress branch has no following return, so the shape is not readable')
      }
      if (/<TextInput\b/.test(buttonBranch)) {
        offenders.push(
          'SearchBar renders a <TextInput> in its onPress branch. A TextInput in the tree is ' +
            'a competing claim on the touch and it does not reliably lose on Android: with ' +
            'readOnly it is not a responder at all, and with pointerEvents="none" the input\'s ' +
            'bounds were still being resolved as the touch target. The button branch must ' +
            'return before the TextInput is created.',
        )
      }
      // The bar's own styles have to be on the Pressable. If they sit on an inner view, a
      // touch can land on that view instead of the responder — which is exactly how the
      // previous version ended up tappable only at the icon.
      if (!/Pressable[\s\S]{0,400}styles\.wrapper/.test(buttonBranch)) {
        offenders.push(
          'SearchBar\'s onPress branch does not put styles.wrapper on the Pressable itself. ' +
            'With the styles on a child, a touch can resolve to that child rather than to the ' +
            'responder, leaving part of the bar dead.',
        )
      }
    }

    if (offenders.length) {
      for (const o of offenders) fail('searchbar-button', o)
    } else {
      pass('searchbar-button', 'the navigating search bar is one Pressable, with no TextInput in it')
    }
  }
}

// ── report ────────────────────────────────────────────────────────────────────────

for (const p of passes) console.log(`  ok    ${p.check.padEnd(24)} ${p.detail}`)

if (failures.length) {
  console.log('')
  for (const f of failures) console.log(`  FAIL  ${f.check.padEnd(24)} ${f.detail}`)
  console.log(`\n=== ${failures.length} DEVICE-RUNTIME FAILURE(S) ===`)
  process.exitCode = 1
} else {
  console.log('\n=== all device-runtime checks pass ===')
}
