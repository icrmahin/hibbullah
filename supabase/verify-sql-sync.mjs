/**
 * The hosted bootstrap and the migrations must not drift.
 *
 * `apply-to-hibbullah-hosted.sql` is what a fresh project is created from, while
 * `migrations/` is what the live project runs. A fix that lands in one and not the other
 * means a rebuilt environment quietly behaves differently from the one being tested, and
 * the difference only shows up much later.
 *
 * This compares the SQL bodies of the notification/audit objects in both files by
 * normalising whitespace, so a comment or blank-line difference is fine but a changed
 * statement is not.
 */
import { readFileSync } from 'node:fs'

const HOSTED = 'supabase/apply-to-hibbullah-hosted.sql'
const MIGRATION = 'supabase/migrations/20260926170000_notifications_and_audit_limits.sql'

const norm = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim()

/** Pull `create ... function <name>` bodies out of a SQL file. */
function functionBodies(sql) {
  const out = new Map()
  const re = /create\s+or\s+replace\s+function\s+([\w.]+)\s*\([\s\S]*?\)\s*returns[\s\S]*?\$\$([\s\S]*?)\$\$/gi
  for (const m of sql.matchAll(re)) {
    out.set(m[1].toLowerCase(), norm(m[2]))
  }
  return out
}

/** Pull `create trigger <name>` statements out of a SQL file. */
function triggers(sql) {
  const out = new Map()
  const re = /create\s+trigger\s+([\w]+)[\s\S]*?;/gi
  for (const m of sql.matchAll(re)) {
    out.set(m[1].toLowerCase(), norm(m[0]))
  }
  return out
}

const hosted = readFileSync(HOSTED, 'utf8')
const migration = readFileSync(MIGRATION, 'utf8')

let problems = 0
const report = (ok, msg) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!ok) problems += 1
}

console.log('=== hosted bootstrap vs migrations ===\n')

const EXPECTED = [
  'public.notify_user',
  'public.notify_order_status',
  'public.notify_return_status',
  'public.trim_user_notifications',
  'public.trim_audit_entries',
]

const hFn = functionBodies(hosted)
const mFn = functionBodies(migration)
for (const name of EXPECTED) {
  const h = hFn.get(name)
  const m = mFn.get(name)
  report(Boolean(h) && Boolean(m) && h === m, `function ${name} identical in both files`)
}

const EXPECTED_TRIGGERS = [
  'trg_orders_notify',
  'trg_return_requests_notify',
  'trg_notifications_trim',
  'trg_audit_entries_trim',
]
const hTr = triggers(hosted)
const mTr = triggers(migration)
for (const name of EXPECTED_TRIGGERS) {
  const h = hTr.get(name)
  const m = mTr.get(name)
  report(Boolean(h) && Boolean(m) && h === m, `trigger ${name} identical in both files`)
}

for (const policy of [
  'Customers can mark own notifications read',
  'Customers can clear own notifications',
]) {
  const re = new RegExp(`create policy "${policy}"[\\s\\S]*?;`, 'i')
  report(re.test(hosted) && re.test(migration), `policy "${policy}" present in both files`)
}

const revoke = /revoke insert, truncate on public\.notifications from anon, authenticated;/i
report(revoke.test(hosted) && revoke.test(migration), 'the INSERT/TRUNCATE revoke is in both files')

// The caps are written as literals inside `offset N`, and separately as numbers in
// src/constants/limits.ts. Read the SQL back out so the check is against what will
// actually run rather than against a comment.
const appLimits = readFileSync('src/constants/limits.ts', 'utf8')
const auditCap = Number(appLimits.match(/AUDIT_LOG_LIMIT\s*=\s*(\d+)/)?.[1])
const notifCap = Number(appLimits.match(/NOTIFICATION_LIMIT\s*=\s*(\d+)/)?.[1])
report(
  /order by timestamp desc, id desc\s*\n\s*offset 20\b/.test(migration),
  `audit trim is offset 20 and the app asks for ${auditCap}`,
)
report(
  /order by created_at desc, id desc\s*\n\s*offset 50\b/.test(migration),
  `notification trim is offset 50 and the app asks for ${notifCap}`,
)
report(
  /delete from public\.audit_entries\s*\nwhere id in \(\s*\n\s*select id from public\.audit_entries order by timestamp desc, id desc offset 20/.test(
    migration,
  ),
  'the backfill of the audit cap also uses 20',
)

console.log(problems === 0 ? '\n=== IN SYNC ===' : `\n=== ${problems} DIFFERENCE(S) ===`)
process.exitCode = problems === 0 ? 0 : 1
