#!/usr/bin/env node
/**
 * Apply every migration that is not yet recorded in supabase_migrations.schema_migrations,
 * in version order, through the Supabase Management API.
 *
 * Why not `supabase db push`: that needs a linked project and the database password.
 * The Management API only needs a personal access token, so this is the one path that
 * works unattended. Each migration is applied in its own transaction (one HTTP call =
 * one transaction), and the version is recorded afterwards, exactly like the CLI does.
 *
 * Usage:
 *   HIBBULLAH_SUPABASE_TOKEN=sbp_... node supabase/apply-new-migrations.mjs
 *   HIBBULLAH_SUPABASE_TOKEN_FILE=/path/to/token node supabase/apply-new-migrations.mjs
 *
 * The token is read ONLY from the environment or from the file named by
 * HIBBULLAH_SUPABASE_TOKEN_FILE. It is never written into this repo.
 *
 * Pass --dry-run to list what would be applied without touching the database.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { env, argv, exit } from 'node:process'

const PROJECT_REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url)
const DRY_RUN = argv.includes('--dry-run')

let token = env.HIBBULLAH_SUPABASE_TOKEN
if (!token && env.HIBBULLAH_SUPABASE_TOKEN_FILE) {
  token = readFileSync(env.HIBBULLAH_SUPABASE_TOKEN_FILE, 'utf8').trim()
}
if (!token) {
  console.error('Set HIBBULLAH_SUPABASE_TOKEN (or HIBBULLAH_SUPABASE_TOKEN_FILE) first.')
  exit(1)
}

/** One HTTP call against the Management API. Every call is its own transaction. */
async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 2000)}`)
  return body
}

/** "20260926100000_phone_e164_canonical.sql" -> [version, name] */
function parse(fileName) {
  const base = fileName.replace(/\.sql$/, '')
  const split = base.indexOf('_')
  return [base.slice(0, split), base.slice(split + 1)]
}

const local = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => {
    const [version, name] = parse(f)
    return { file: f, version, name }
  })
  .sort((a, b) => (a.version < b.version ? -1 : 1))

// The Management API returns the result set as a bare JSON array, but it has also
// been seen returning [rows]; accept either so this keeps working either way.
const raw = JSON.parse(await query('select version from supabase_migrations.schema_migrations'))
const appliedRows = Array.isArray(raw?.[0]) ? raw[0] : raw
// `version` is a bigint column, so it comes back as a JSON number while the local
// filenames give strings. Compare as strings or nothing ever matches.
const appliedSet = new Set(appliedRows.map((r) => String(r.version)))

const pending = local.filter((m) => !appliedSet.has(m.version))

console.log(`Project:  ${PROJECT_REF}`)
console.log(`On disk:  ${local.length} migrations`)
console.log(`Applied:  ${appliedSet.size} migrations (remote)`)
console.log(`Pending:  ${pending.length}`)
for (const m of pending) console.log(`  - ${m.file}`)

if (pending.length === 0) {
  console.log('\nNothing to do — database is up to date.')
  exit(0)
}

if (DRY_RUN) {
  console.log('\n--dry-run: no changes made.')
  exit(0)
}

console.log('')
for (const m of pending) {
  const sql = readFileSync(new URL(m.file, MIGRATIONS_DIR), 'utf8')
  process.stdout.write(`Applying ${m.file} ... `)
  try {
    await query(sql)
  } catch (error) {
    // A failed call rolled back, so this migration is entirely unapplied and the
    // recorded version is left alone. Stop here: later migrations assume this one.
    console.log('FAILED')
    console.error(String(error.message))
    console.error('\nStopped. Fix the migration and re-run; already-applied ones are skipped.')
    exit(1)
  }

  // Record it the way the CLI does, so `supabase migration list` and `db push`
  // agree with reality on the next run. `statements` is a text[] holding the
  // individual statements, so the split is fed through jsonb to sidestep quoting.
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !/^--/.test(s))
  const statementsLiteral = JSON.stringify(statements).replace(/'/g, "''")
  await query(
    `insert into supabase_migrations.schema_migrations (version, statements, name)
     select '${m.version}',
            array(select jsonb_array_elements_text('${statementsLiteral}'::jsonb)),
            '${m.name}'
     on conflict (version) do nothing`,
  )
  console.log('ok')
}

console.log(`\nApplied ${pending.length} migration(s). Database is up to date.`)
