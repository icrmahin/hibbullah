#!/usr/bin/env node
/**
 * Mutation test: prove each check in verify-device-runtime.mjs can actually fail.
 *
 * A check no input can fail is decoration, and that is a real risk here rather than a
 * theoretical one. An earlier version of the date check looked for a `.replace(` call,
 * which the fix does not use — it rebuilds the string from a regex match — so the check
 * failed on correct code and would have been deleted rather than fixed, taking the guard
 * with it. Every case below breaks exactly one property and asserts the checker notices.
 *
 * A case reporting NOT CAUGHT is a hole in the checking, not a passing test.
 *
 * Each mutation is applied to the working tree, the checker is run as a subprocess, and
 * the file is restored — including on a crash, so a failing run never leaves the tree
 * mutated.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const CHECKER = 'supabase/verify-device-runtime.mjs'

const BOUNDARY = 'src/components/common/ErrorBoundary.tsx'
const LAYOUT = 'src/app/_layout.tsx'
const DATE = 'src/utils/date.ts'
const STORAGE = 'src/services/storage.ts'
const SEARCH_BAR = 'src/components/common/SearchBar.tsx'
const BUTTON = 'src/components/common/Button.tsx'
const MODAL = 'src/components/common/Modal.tsx'
const CONFIRM_DIALOG = 'src/components/common/ConfirmDialog.tsx'
const CARD = 'src/components/products/ProductCard.tsx'
const CUSTOMER_CART = 'src/app/(customer)/products/[productId].tsx'
const ADMIN_CATALOG = 'src/app/(admin)/products/index.tsx'

const cases = [
  [
    'delete the error boundary component',
    BOUNDARY,
    () => '',
  ],
  [
    'strip the boundary hooks, leaving a component that cannot catch',
    BOUNDARY,
    (s) => s.replace('getDerivedStateFromError', 'getDerived').replace('componentDidCatch', 'componentDidNothing'),
  ],
  [
    'unmount the boundary from the root layout',
    LAYOUT,
    (s) =>
      s
        .replace(/<AppErrorBoundary[^>]*>/g, '')
        .replace(/<\/AppErrorBoundary>/g, '')
        .replace(/import AppErrorBoundary[^\n]*\n/, ''),
  ],
  [
    'remove the invalid-date guard from the formatter',
    DATE,
    (s) => s.replace(/const date = toDate\(value\);\n  if \(!date\) return UNKNOWN_DATE;/g, 'const date = toDate(value) as Date;'),
  ],
  [
    'stop padding the two-digit offset, so Hermes sees Invalid Date',
    DATE,
    (s) => s.replace('${signOffset}:00`', '${signOffset}`'),
  ],
  [
    'pass unrecognised values to the engine again, trusting it to reject them',
    // This one is here because it was a real defect, not a hypothetical. V8 does not
    // reject "not-a-year-09-26T20:34:37.88504+00:00" -- it returns 27 September -- so a
    // parser that defers to the engine prints a plausible wrong date and reports nothing.
    DATE,
    (s) =>
      s.replace(
        '  if (ES_TIMESTAMP.test(trimmed)) return trimmed;',
        '  return trimmed;',
      ),
  ],
  [
    'format a date with a raw Intl call somewhere else',
    CARD,
    (s) =>
      s.replace(
        'return (\n    <View',
        'const _leak = new Intl.DateTimeFormat("en-KE", { day: "numeric" }).format(new Date("nope"));\n  void _leak;\n\n  return (\n    <View',
      ),
  ],
  [
    'put the unsupported { uri } FormData part back',
    STORAGE,
    (s) =>
      s.replace(
        "form.append('file', {",
        "form.append('file', { uri: 'file:///tmp/x.jpg',",
      ),
  ],
  [
    'show the stock count on the product card again',
    CARD,
    (s) =>
      s.replace(
        '        {/* Add to cart, floating on the photo.',
        '        <Text>{`${product.stock} in stock`}</Text>\n        {/* Add to cart, floating on the photo.',
      ),
  ],
  [
    'bring the availability wording back on the product card',
    // The requirement is no stock information at all, not merely no numbers, so this has
    // to be caught even though it interpolates nothing.
    CARD,
    (s) =>
      s.replace(
        '        {/* Add to cart, floating on the photo.',
        '        <Text>Only a few left</Text>\n        {/* Add to cart, floating on the photo.',
      ),
  ],
  [
    'show the stock count on the product page again',
    CUSTOMER_CART,
    (s) =>
      s.replace(
        '{/*\n        No stock readout here.',
        '<Text>{product.stock} available</Text>\n      {/*\n        No stock readout here.',
      ),
  ],
  [
    'bring the low-stock wording back on the product page',
    CUSTOMER_CART,
    (s) =>
      s.replace(
        '{/*\n        No stock readout here.',
        '<Text>Only a few left</Text>\n      {/*\n        No stock readout here.',
      ),
  ],
  [
    'hand the admin catalog the product-grid column count again',
    // This is bug 5 reverted, exactly as it shipped: `AdminProductCard` lays out as a row,
    // and the screen asked for 2 columns on a phone.
    ADMIN_CATALOG,
    (s) =>
      s
        .replace('const { listColumns } = useResponsive();', 'const { columns } = useResponsive();')
        .replace('numColumns={listColumns}', 'numColumns={columns}')
        .replace('key={`cols-${listColumns}`}', 'key={`cols-${columns}`}'),
  ],
  [
    'turn the customer product card into a row card, in the product grid',
    // The same defect from the other side: a card that stops stacking must stop being
    // handed the product-grid count, whichever file the mistake is made in.
    CARD,
    (s) => s.replace('  card: {\n    borderRadius', '  card: {\n    flexDirection: "row",\n    borderRadius'),
  ],
  [
    'gate the native image read on an HTTP status again',
    // This is the bug as it shipped, and it failed on every upload with a message that
    // blamed the image: `ok` is `status >= 200 && status < 300`, and a `file://` read does
    // not produce a 2xx, so the guard threw before any byte was looked at.
    STORAGE,
    (s) =>
      s.replace(
        'async function readNativeImageBytes(uri: string): Promise<Uint8Array> {',
        'async function readNativeImageBytes(uri: string): Promise<Uint8Array> {\n' +
          '  const res = await fetch(uri)\n' +
          '  if (!res.ok) throw new Error(READ_FAILED)\n' +
          '  return blobToBytes(await res.blob())',
      ),
  ],
  [
    'stop reading the file, so nothing is left to gate',
    // Guards the other half: banning the status check is only meaningful if a real read
    // exists. Without this, deleting the read would satisfy the check by accident.
    STORAGE,
    (s) => s.replace('return await file.bytes()', 'return new Uint8Array(0)'),
  ],
  [
    'put a TextInput back in the navigating search bar',
    // The shape that shipped as bug 2 of the search bar: a Pressable wrapping a live field
    // whose bounds were still resolved as the touch target. The icon worked, the rest of
    // the bar did not.
    SEARCH_BAR,
    (s) =>
      s.replace(
        '        <Icon name="search" size={20} color={colors.textMuted} />\n        <Text\n          numberOfLines={1}\n          style={[styles.input, { color: colors.textMuted }]}\n        >\n          {placeholder}\n        </Text>',
        '        <Icon name="search" size={20} color={colors.textMuted} />\n        <TextInput\n          {...props}\n          value={value}\n          onChangeText={onChangeText}\n          pointerEvents="none"\n          style={[styles.input, { color: colors.text }]}\n        />',
      ),
  ],
  [
    'move the bar styles off the Pressable and onto a child view',
    // The same bug with the field gone: the responder exists, but it is not the view being
    // painted, so a touch can resolve to the child instead.
    SEARCH_BAR,
    (s) =>
      s.replace(
        'styles.wrapper,\n          {\n            backgroundColor: colors.backgroundAlt,\n            borderColor: colors.borderLight,\n          },\n          pressed && styles.pressed,',
        '{ flex: 1 },\n          pressed && styles.pressed,',
      ),
  ],
  [
    'drop the onPress branch, so the caller gets a dead field again',
    SEARCH_BAR,
    (s) => s.replace('if (onPress) {', 'if (false as boolean) {'),
  ],
  [
    // The exact shape that shipped: the ripple and the press handlers on an unstyled
    // Pressable, every visual property on a painted child. Square ripple on a pill.
    'put the button paint back on a child, leaving the responder unstyled',
    BUTTON,
    (s) =>
      s
        .replace('Animated.createAnimatedComponent(Pressable)', 'Pressable')
        .replace('    >\n      {icon}', '    >\n      <Animated.View style={[styles.base]}>\n      {icon}')
        .replace('    </AnimatedPressable>', '      </Animated.View>\n    </AnimatedPressable>'),
  ],
  [
    'remove the clip that keeps the ripple inside the pill',
    BUTTON,
    (s) => s.replace('    overflow: "hidden",\n', ''),
  ],
  [
    'strip the card back to a bare View, so reading the dialog closes it',
    MODAL,
    (s) => s.replace('          onStartShouldSetResponder={() => true}\n', ''),
  ],
  [
    // Passes a naive "does it have some responder guard" check while making the dialog
    // unanswerable: capture swallows the presses meant for Delete and Cancel.
    'guard the dialog card with the capture-phase variant',
    MODAL,
    (s) => s.replace('onStartShouldSetResponder={() => true}', 'onStartShouldSetResponderCapture={() => true}'),
  ],
  [
    'rely on stopPropagation to keep a card tap from dismissing',
    CONFIRM_DIALOG,
    (s) => s.replace('          onStartShouldSetResponder={() => true}\n', '          onPress={(e) => e.stopPropagation()}\n'),
  ],
]

let notCaught = 0
let broken = 0

console.log('=== proving every device-runtime guard can fail ===\n')

for (const [label, file, mutate] of cases) {
  let original
  try {
    original = readFileSync(file, 'utf8')
  } catch {
    console.log(`  BROKEN      ${label}   <-- cannot read ${file}`)
    broken += 1
    continue
  }

  let mutated
  try {
    mutated = mutate(original)
  } catch (e) {
    console.log(`  BROKEN      ${label}   <-- mutation threw: ${e.message}`)
    broken += 1
    continue
  }

  // A mutation that changed nothing is worse than useless: it reports "caught" only if
  // the checker is failing for some other reason, or "not caught" for the wrong reason.
  if (mutated === original) {
    console.log(`  BROKEN      ${label}   <-- the mutation did not change ${file}`)
    broken += 1
    continue
  }

  writeFileSync(file, mutated)
  let out = ''
  try {
    execFileSync('node', [CHECKER], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`
  } finally {
    writeFileSync(file, original)
  }

  if (/FAIL/.test(out)) {
    const which = out
      .split('\n')
      .filter((l) => l.includes('FAIL'))
      .map((l) => l.trim().replace(/^FAIL\s+/, ''))
    console.log(`  caught   ${label}`)
    console.log(`             -> ${which.slice(0, 2).join(' | ')}`)
  } else {
    console.log(`  NOT CAUGHT  ${label}   <-- the check is decorative`)
    notCaught += 1
  }
}

console.log(
  notCaught === 0 && broken === 0
    ? `\nevery guard fails when the thing it guards is broken (${cases.length} mutations)`
    : `\n${notCaught} uncaught, ${broken} broken`,
)
process.exit(notCaught === 0 && broken === 0 ? 0 : 1)
