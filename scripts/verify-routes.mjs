/**
 * Expo Router route validation — the two ways this app can quietly navigate nowhere.
 *
 * ── what it checks ─────────────────────────────────────────────────────────────
 *
 * A. `<Stack.Screen name="...">` declarations.
 *
 *    Expo Router's `getSortedChildren` looks for a child of the layout whose `route`
 *    equals the declared name, or equals `name + "/index"`:
 *
 *        entries.findIndex((child) => child.route === name || child.route === `${name}/index`)
 *
 *    and warns `[Layout children]: No route named "X" exists in nested children` when
 *    nothing matches. It matches nothing and changes nothing — the screen simply is not
 *    configured. This rebuilds that child list from the filesystem and applies the same
 *    rule, so a declaration that cannot match fails here rather than in the log.
 *
 *    The child list is what makes this subtle: a directory WITH its own `_layout.tsx`
 *    contributes exactly ONE child (its directory name), while a directory WITHOUT one is
 *    spliced into its parent as `dir/child`. That is why the admin layout's `products`
 *    is valid but `products/add` is not — `products/` has a layout, so `products/add`
 *    belongs to the nested stack, while `inventory/batches` resolves because `inventory/`
 *    has none.
 *
 * B. Navigation targets.
 *
 *    Every literal handed to `router.push/replace/navigate`, to the local `open`,
 *    `goBack` and `navigate` wrappers, to `href=`, or stored in the `path:` / `pathname:`
 *    keys of a navigation item, is resolved against the route set and must exist.
 *
 *    Route groups — `(admin)`, `(customer)`, `(tabs)` — are stripped from both sides,
 *    because a group is part of a route *name* but never part of a URL. That is the whole
 *    bug behind `` `/admin/products/${p.product_id}` ``: it kept the group's name in the
 *    path, and `(admin)` is not a URL segment, so the resulting address matched nothing.
 *
 *    Template literals are matched on their static prefix at a segment boundary, so
 *    `` `/(admin)/returns/${r.id}` `` must resolve to a real `/returns/[returnId]`.
 *
 * Deliberately NOT scanned: bare string literals. `pathname.includes("/order/")` and
 * friends are substring tests on the current URL, not addresses, and treating them as
 * routes would report every one of them as broken.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const APP_DIR = 'src/app'
const SRC_DIR = 'src'

let failures = 0
const fail = (msg) => {
  failures += 1
  console.error(`  ✗ ${msg}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Source scanning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove comments without eating a `//` that lives inside a string, and without
 * losing line numbers. Template literals are kept whole so their static prefix
 * can still be read.
 */
function stripComments(src) {
  let out = ''
  let quote = null
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (quote) {
      out += c
      if (c === '\\' && i + 1 < src.length) {
        out += d
        i += 2
        continue
      }
      if (c === quote) quote = null
      i += 1
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      out += c
      i += 1
      continue
    }
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && d === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n'
        i += 1
      }
      i += 2
      continue
    }
    out += c
    i += 1
  }
  return out
}

function walk(dir, onFile) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, onFile)
    else onFile(full)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The route tree, as Expo Router builds it
// ─────────────────────────────────────────────────────────────────────────────

const isRouteFile = (name) => name.endsWith('.tsx') && name !== '_layout.tsx'
const hasLayout = (dir) => existsSync(join(dir, '_layout.tsx'))

function dirEntries(dir) {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Children of a directory that HAS a `_layout.tsx`. Each entry is either a direct
 * route (`index`, `add`) or a directory: a nested layout contributes one child named
 * after itself, an un-laid-out one is spliced through `flatten`.
 */
function layoutChildren(dir) {
  const out = []
  for (const entry of dirEntries(dir)) {
    if (entry.name === '_layout.tsx') continue
    const full = join(dir, entry.name)
    if (entry.isFile()) {
      if (isRouteFile(entry.name)) out.push(entry.name.replace(/\.tsx$/, ''))
      continue
    }
    if (hasLayout(full)) out.push(entry.name)
    else out.push(...flatten(full, entry.name))
  }
  return out
}

/** A directory with no layout of its own dissolves into its parent, keeping the prefix. */
function flatten(dir, prefix) {
  const out = []
  for (const entry of dirEntries(dir)) {
    const full = join(dir, entry.name)
    if (entry.isFile()) {
      if (isRouteFile(entry.name)) out.push(`${prefix}/${entry.name.replace(/\.tsx$/, '')}`)
      continue
    }
    if (hasLayout(full)) out.push(`${prefix}/${entry.name}`)
    else out.push(...flatten(full, `${prefix}/${entry.name}`))
  }
  return out
}

/** Every `_layout.tsx` and its declared child names. */
function collectLayouts() {
  const found = []
  const visit = (dir) => {
    const layout = join(dir, '_layout.tsx')
    if (existsSync(layout)) found.push(layout)
    for (const entry of dirEntries(dir)) {
      if (entry.isDirectory()) visit(join(dir, entry.name))
    }
  }
  visit(APP_DIR)
  return found
}

/** URL paths: route groups are dropped, a trailing `index` is dropped. */
function collectUrls() {
  const urls = new Set()
  const visit = (dir) => {
    for (const entry of dirEntries(dir)) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(full)
        continue
      }
      if (!isRouteFile(entry.name)) continue
      const segments = relative(APP_DIR, full)
        .replace(/\.tsx$/, '')
        .split('/')
        .filter((s) => !/^\(.*\)$/.test(s))
      if (segments[segments.length - 1] === 'index') segments.pop()
      urls.add(segments.length ? `/${segments.join('/')}` : '/')
    }
  }
  visit(APP_DIR)
  return urls
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching
// ─────────────────────────────────────────────────────────────────────────────

const stripGroups = (href) =>
  href
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .join('/')

/** Is this href a real route? A trailing `/` or a `${…}` means "prefix of a real route". */
function hrefResolves(href, urls) {
  // `` `/(admin)/returns/${r.id}` `` can only be checked up to its first interpolation,
  // which must then land on a segment boundary of a real route.
  const dyn = href.includes('${')
  const base = dyn ? href.slice(0, href.indexOf('${')) : href
  const cleaned = stripGroups(base)
  const asPath = `/${cleaned}`
  const openEnded = dyn || base.endsWith('/')
  if (!openEnded) return urls.has(asPath)
  const prefix = cleaned ? `/${cleaned}/` : '/'
  return [...urls].some((u) => u.startsWith(prefix) && u.length > prefix.length)
}

// ─────────────────────────────────────────────────────────────────────────────
// Check A — layout screen declarations
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n=== A. layout <Screen name> declarations ===')

for (const layoutPath of collectLayouts()) {
  const dir = layoutPath.replace(/\/_layout\.tsx$/, '')
  const children = layoutChildren(dir)
  const src = stripComments(readFileSync(layoutPath, 'utf8'))
  const declared = [...src.matchAll(/<\s*[A-Za-z]+\.Screen\s[^>]*?name\s*=\s*["']([^"']+)["']/g)].map(
    (m) => m[1]
  )

  const seen = new Set()
  for (const name of declared) {
    if (seen.has(name)) fail(`${layoutPath}: duplicate <Screen name="${name}">`)
    seen.add(name)
    const matched = children.some((c) => c === name || c === `${name}/index`)
    if (!matched) {
      fail(
        `${layoutPath}: no route named "${name}" — children are: ${children.join(', ') || '(none)'}`
      )
    }
  }
  console.log(`  ${layoutPath}: ${declared.length} declared, ${children.length} children`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Check B — navigation targets
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n=== B. navigation targets ===')

const urls = collectUrls()

/** Call arguments whose value is an address: router methods + the local wrappers. */
const CALL = /\b(?:router\.(?:push|replace|navigate|pushHref)|open|goBack|navigate)\s*\(\s*(["'`])([^"'`]*)\1/g
/** `pathname:` / `path:` keys, and any `href=` attribute or `href:` key. */
const KEY = /\b(?:pathname|path|href)\s*[:=]\s*(["'])([^"']*)\1/g

let checked = 0
walk(SRC_DIR, (file) => {
  if (!/\.(ts|tsx)$/.test(file)) return
  const src = stripComments(readFileSync(file, 'utf8'))
  for (const re of [CALL, KEY]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(src))) {
      const raw = m[2]
      if (!raw.startsWith('/')) continue
      // A bare "/" is the root route; every other address must be one too.
      checked += 1
      if (!hrefResolves(raw, urls)) {
        fail(`${file}: "${raw}" is not a registered route`)
      }
    }
  }
})
console.log(`  ${checked} navigation literals resolved against ${urls.size} routes`)

// ─────────────────────────────────────────────────────────────────────────────

if (failures) {
  console.error(`\n✗ ${failures} route problem(s) found.\n`)
  process.exit(1)
}
console.log('\n=== every route declaration and target resolves ===\n')
