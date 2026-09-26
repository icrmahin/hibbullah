#!/usr/bin/env node
/**
 * Apply a migration and, for each function it redefines, show exactly what changed in the
 * live body. The point is to catch a migration that silently rewrote logic while
 * appearing to make a one-line change.
 *
 *   set -a && . ./.env && set +a && node supabase/apply-and-diff.mjs <migration.sql>
 */
import { readFileSync } from 'node:fs'
import { env } from 'node:process'

const REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const MGMT = env.HIBBULLAH_SUPABASE_TOKEN
const file = process.argv[2]
if (!file) {
  console.error('usage: node supabase/apply-and-diff.mjs <migration.sql>')
  process.exit(1)
}

const q = async (sql) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`SQL failed: HTTP ${res.status} ${body.slice(0, 600)}`)
  return body
}

const prose = async (name) =>
  JSON.parse(
    await q(
      `select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = '${name}'`,
    ),
  )[0]?.prosrc

const sql = readFileSync(file, 'utf8')
const touched = [...new Set([...sql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]))]
console.log(`migration: ${file}`)
console.log(`redefines: ${touched.join(', ') || '(none)'}\n`)

const before = {}
for (const n of touched) before[n] = await prose(n)

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `begin;\n${sql}\ncommit;` }),
})
const body = await res.text()
if (!res.ok) {
  console.error(`APPLY FAILED: HTTP ${res.status}\n${body.slice(0, 1500)}`)
  process.exit(1)
}
console.log('applied OK (HTTP ' + res.status + ')\n')

/** Lines present in `from` but not `to`, each reported once per surplus occurrence. */
const diffLines = (from, to) => {
  const pool = new Map()
  for (const l of from) pool.set(l, (pool.get(l) ?? 0) + 1)
  const gone = []
  for (const l of to) {
    const n = pool.get(l) ?? 0
    if (n > 0) pool.set(l, n - 1)
    else gone.push(l)
  }
  return gone
}

for (const n of touched) {
  const after = await prose(n)
  if (!after) {
    console.log(`── ${n}: now missing`)
    continue
  }
  const a = (before[n] ?? '').split('\n')
  const b = after.split('\n')
  const removed = diffLines(a, b)
  const added = diffLines(b, a)
  console.log(`── ${n}`)
  if (before[n] === undefined) {
    console.log(`   (new function, ${b.length} lines)`)
  } else {
    for (const l of removed) console.log(`   - ${l}`)
    for (const l of added) console.log(`   + ${l}`)
  }
  console.log()
}
