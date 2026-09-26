#!/usr/bin/env node
/**
 * Mutation test: prove each new guard in verify-sql-sync.mjs can actually fail.
 *
 * A check that no input can fail is decoration. Each case below breaks exactly one
 * property the checks are supposed to protect, re-runs the checker, and restores the file.
 * A case that reports NOT CAUGHT is a hole in the checking, not a passing test.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const LOCK = 'supabase/migrations/20260928010000_secdef_grants_and_guards.sql'
const REPORTS = 'supabase/migrations/20260928020000_reports_and_customer_spend.sql'
const HOSTED = 'supabase/apply-to-hibbullah-hosted.sql'
const REPORTS_TS = 'src/services/reports.ts'
const EXPIRY_TS = 'src/app/(admin)/inventory/expiry.tsx'
const DIFF_TS = 'src/utils/auditDiff.ts'

const cases = [
  ['drop the notify_user revoke', LOCK, (s) => s.replace(/^revoke all on function public\.notify_user[^\n]*\n/m, '')],
  ['drop the deduct_inventory_fifo revoke', LOCK, (s) => s.replace(/^revoke all on function public\.deduct_inventory_fifo[^\n]*\n/m, '')],
  ['narrow the revokes to public only', LOCK, (s) => s.replace('from public, anon, authenticated;', 'from public;')],
  [
    'remove the is_admin guard from get_reports',
    REPORTS,
    (s) => s.replace(/  if not public\.is_admin\(\) then\n    raise exception 'Only admins can query reports';\n  end if;\n\n/, ''),
  ],
  [
    'remove the is_admin guard from get_customer_stats',
    REPORTS,
    (s) => s.replace(/  if not public\.is_admin\(\) then\n    raise exception 'Only admins can query customers';\n  end if;\n/, ''),
  ],
  [
    'remove the own-customer guard from create_order',
    LOCK,
    (s) => s.replace(/  if auth\.uid\(\) is distinct from p_customer_id then[\s\S]*?  end if;\n/, ''),
  ],
  [
    'count cancelled orders as money spent again',
    REPORTS,
    (s) => s.replace("sum(total) filter (where status <> 'CANCELLED')", 'sum(total)'),
  ],
  [
    'make reports read the tables instead of the RPC',
    REPORTS_TS,
    (s) =>
      s.replace(
        "const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined",
        "const { data: all } = await supabase.from('products').select('id, price, stock')\n  const row = { low_stock: (all ?? []).filter((p: any) => Number(p.stock) < 10).length } as any",
      ),
  ],
  ['hard-code the low-stock threshold in reports.ts', REPORTS_TS, (s) => s.replace('config.lowStockThreshold', '10')],
  ['put a 90-day expiry window back on the expiry screen', EXPIRY_TS, (s) => s.replace('config.expiryWarningDays', '90')],
  [
    'make auditDiff render no values at all',
    DIFF_TS,
    (s) => s.replace('if (value === null || value === undefined) return null', 'if (true) return null'),
  ],
  [
    'make auditDiff compare raw values, so "120" and 120 look like a change',
    DIFF_TS,
    (s) => s.replace('if (render(a) === render(b)) continue', 'if (JSON.stringify(a) === JSON.stringify(b)) continue'),
  ],
  [
    'let a malformed audit blob throw and take the screen down',
    DIFF_TS,
    (s) => s.replace(/  \} catch \{\n    return \{\}\n  \}/, '  }'),
  ],
  [
    'stop the audit screen showing the changed fields',
    'src/app/(admin)/audit/index.tsx',
    (s) => s.replace('<AuditChange entry={entry} />', ''),
  ],
  [
    'let the audit screen hide dropped fields without saying so',
    'src/app/(admin)/audit/index.tsx',
    (s) => s.replace('{hidden > 0 ? (', '{false ? ('),
  ],
  [
    'stop the mapper reading the values off the row',
    'src/lib/mappers.ts',
    // The first attempt at this case renamed the fields in the type declaration, which
    // changed nothing the mapper did — and the check still passed, because it was matching
    // the declaration rather than the read. The mutation has to break the behaviour.
    (s) => s.replace(/typeof row\.old_value === 'string'[\s\S]*?: undefined,/, 'oldValue: undefined,').replace(/typeof row\.new_value === 'string'[\s\S]*?: undefined,/, 'newValue: undefined,'),
  ],
  [
    'have the mapper put undefined on the entry',
    'src/lib/mappers.ts',
    // The previous attempt at this case prepended a `undefined &&` guard, which left the
    // `oldValue:` and `row.old_value` text the check looks for intact -- so the mutation
    // could never fail, and a test that cannot fail proves nothing. This one replaces the
    // whole property with `undefined`, which is what the bug would actually look like.
    (s) => s.replace(/^\s*oldValue: .*$/m, '    oldValue: undefined,').replace(/^\s*newValue: .*$/m, '    newValue: undefined,'),
  ],
  [
    'stop checking that the return approval reached a row',
    'src/services/returns.ts',
    (s) => s.replace("requireAffected(data, 'this return request')", ''),
  ],
  [
    'drop .select() so the address delete cannot be verified',
    'src/services/addresses.ts',
    (s) => s.replace(".eq('user_id', userId)\n    .select('id')", ".eq('user_id', userId)"),
  ],
  [
    'stop checking that the single-notification read reached a row',
    'src/services/notifications.ts',
    (s) => s.replace("requireAffected(data, 'this notification')", ''),
  ],
]

let notCaught = 0
let broken = 0

for (const [label, file, mutate] of cases) {
  const original = readFileSync(file, 'utf8')
  const mutated = mutate(original)
  if (mutated === original) {
    console.log(`  BROKEN   ${label}\n           the mutation did not apply, so it would pass for the wrong reason`)
    broken += 1
    continue
  }
  writeFileSync(file, mutated)
  let out = ''
  try {
    execFileSync('node', ['supabase/verify-sql-sync.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
  writeFileSync(file, original)

  if (/FAIL/.test(out)) {
    const which = out.split('\n').filter((l) => l.includes('FAIL')).map((l) => l.trim().replace(/^FAIL\s+/, ''))
    console.log(`  caught   ${label}`)
    console.log(`             → ${which.slice(0, 2).join(' | ')}`)
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
