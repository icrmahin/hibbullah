#!/usr/bin/env node
/**
 * Fail if `Alert.alert` is used anywhere in src/.
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
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

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
