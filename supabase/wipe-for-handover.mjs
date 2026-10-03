#!/usr/bin/env node
/**
 * Wipe inner data for client handover — a fresh database behind the same software.
 *
 * ── what goes ────────────────────────────────────────────────────────────────────
 * Everything transactional: orders + items + allocations, return requests, delivery
 * cycles, stock adjustments + inventory batches, cart items, favorites, addresses,
 * notifications + push tokens, the audit log, and the catalog itself (products,
 * categories, manufacturers).
 *
 * ── what stays ───────────────────────────────────────────────────────────────────
 * The schema (all migrations, RLS, functions, triggers), storage buckets, the admin
 * allowlist, and every account — admins and customers keep their logins.
 *
 * ── why audit_entries and notifications go last ──────────────────────────────────
 * Deleting rows fires the audit triggers, so the wipe generates its own audit log;
 * deleting a product fires `trg_product_stock_check`, which inserts an "Out of stock"
 * alert. Wiping the log and the notifications before the catalog would leave the
 * wipe's own residue behind. They run after everything that can generate them.
 *
 * ── safety ───────────────────────────────────────────────────────────────────────
 * A full snapshot (SELECT * of every wiped table) is written to
 * /tmp/opencode/handover-snapshot-<timestamp>/ before the first DELETE, so the wipe
 * is reversible. Pass --dry-run to print the counts without touching anything.
 *
 * Usage:
 *   node supabase/wipe-for-handover.mjs --dry-run
 *   HIBBULLAH_SUPABASE_TOKEN=sbp_... node supabase/wipe-for-handover.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { env, argv, exit } from 'node:process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PROJECT_REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const DRY_RUN = argv.includes('--dry-run')

let token = env.HIBBULLAH_SUPABASE_TOKEN
if (!token && env.HIBBULLAH_SUPABASE_TOKEN_FILE) {
  token = readFileSync(env.HIBBULLAH_SUPABASE_TOKEN_FILE, 'utf8').trim()
}
if (!token) {
  console.error('Set HIBBULLAH_SUPABASE_TOKEN (or HIBBULLAH_SUPABASE_TOKEN_FILE) first.')
  exit(1)
}

/**
 * Delete order: children before parents, and anything a trigger can regenerate
 * (notifications, the audit log) after everything that fires those triggers.
 */
const WIPES = [
  'return_requests',
  'order_item_allocations',
  'order_items',
  'orders',
  'delivery_cycle_items',
  'delivery_cycles',
  'stock_adjustments',
  'inventory_items',
  'cart_items',
  'favorites',
  'addresses',
  'products',
  'categories',
  'manufacturers',
  'notifications',
  'push_tokens',
  'audit_entries',
]

/** Untouched, but asserted afterwards so a mistake is loud. */
const KEEP_MIN = { profiles: 1, 'auth.users': 1 }

async function query(sql, attempt = 1) {
  let res
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    })
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * attempt))
      return query(sql, attempt + 1)
    }
    throw e
  }
  const body = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 2000)}`)
  return JSON.parse(body)
}

async function counts(tables) {
  const sql = 'select ' + tables.map((t, i) => `(select count(*) from ${t}) as c${i}`).join(', ')
  const rows = await query(sql)
  const row = rows[0]
  const out = {}
  tables.forEach((t, i) => { out[t] = Number(row['c' + i]) })
  return out
}

const before = await counts([...WIPES, ...Object.keys(KEEP_MIN)])
console.log(DRY_RUN ? '── dry run: what would be wiped ──' : '── before ──')
for (const t of WIPES) console.log(`  ${t.padEnd(24)} ${before[t]}`)
console.log('kept:')
for (const t of Object.keys(KEEP_MIN)) console.log(`  ${t.padEnd(24)} ${before[t]}`)

if (DRY_RUN) {
  console.log('\nDry run only — nothing deleted. Re-run without --dry-run to wipe.')
  exit(0)
}

// ── snapshot (the undo button) ───────────────────────────────────────────────────
const snapDir = join(tmpdir(), 'opencode', `handover-snapshot-${Date.now()}`)
mkdirSync(snapDir, { recursive: true })
for (const t of WIPES) {
  const rows = await query(`select * from ${t}`)
  writeFileSync(join(snapDir, `${t.replace('.', '_')}.json`), JSON.stringify(rows))
}
console.log(`\nSnapshot written to ${snapDir}`)

// ── wipe ─────────────────────────────────────────────────────────────────────────
for (const t of WIPES) {
  await query(`delete from ${t}`)
  console.log(`  wiped ${t}`)
}

// ── verify ───────────────────────────────────────────────────────────────────────
const after = await counts([...WIPES, ...Object.keys(KEEP_MIN), 'supabase_migrations.schema_migrations'])
console.log('\n── after ──')
let ok = true
for (const t of WIPES) {
  const good = after[t] === 0
  if (!good) ok = false
  console.log(`  ${(good ? 'ok  ' : 'FAIL') + ' ' + t.padEnd(24)} ${after[t]}`)
}
for (const [t, min] of Object.entries(KEEP_MIN)) {
  const good = after[t] >= min
  if (!good) ok = false
  console.log(`  ${(good ? 'ok  ' : 'FAIL') + ' kept ' + t.padEnd(19)} ${after[t]}`)
}
console.log(`  ok   migrations               ${after['supabase_migrations.schema_migrations']}`)

if (!ok) {
  console.error('\n=== WIPE INCOMPLETE — snapshot at ' + snapDir + ' ===')
  exit(1)
}
console.log('\n=== handover wipe complete — fresh database, accounts and schema intact ===')
