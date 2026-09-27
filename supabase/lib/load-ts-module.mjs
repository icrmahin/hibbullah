/**
 * Load a TypeScript module from src/ by writing a type-stripped copy of it and importing
 * that.
 *
 * There is no test runner in this project and no build step that emits JS, so a check that
 * wants to *call* the app's own code has to do this. The alternatives are worse:
 *
 *   - Reimplementing the logic in the check. A copy of a delivery-fee rule inside a test is
 *     a second source of truth, and this project already has `verify:sql-sync`, whose entire
 *     job is preventing exactly that.
 *   - Trusting a source-text match. That asserts the file contains a particular string, not
 *     that the function returns the right answer. `verify-device-runtime.mjs` needs both: a
 *     structural check so a guard cannot be quietly deleted, and this so the guarded value is
 *     known to be right.
 *
 * The copy is written *beside* the original rather than into a temp directory, because the
 * modules under test import each other by relative path (`../constants/districts`), and a
 * temp directory breaks precisely the edges being examined. Names begin with a dot so no
 * lint, typecheck or bundler glob picks them up, and `cleanup()` removes them.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { pathToFileURL } from 'node:url'

const written = []

export async function loadTsModule(file) {
  const out = file.replace(/\.ts$/, '.verify.mjs')
  let code = stripTypeScriptTypes(readFileSync(file, 'utf8'))

  // Repoint relative specifiers at the stripped copies. The app's specifiers carry no
  // extension at all (`../constants/districts`), so each is suffixed rather than rewritten.
  code = code.replace(/(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g, (_m, head, spec, tail) => {
    const bare = spec.replace(/\.(mjs|ts)$/, '')
    return `${head}${bare}.verify.mjs${tail}`
  })

  writeFileSync(out, code)
  written.push(out)
  return import(pathToFileURL(out).href)
}

/** Remove every copy this module wrote. Safe to call twice, and safe in a `finally`. */
export function cleanup() {
  for (const f of written.splice(0)) {
    try {
      unlinkSync(f)
    } catch {
      /* already gone */
    }
  }
}
