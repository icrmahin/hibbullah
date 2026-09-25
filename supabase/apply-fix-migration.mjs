#!/usr/bin/env node
/**
 * Apply the bug-hunt fix migration to the live Supabase project via the Management API.
 *
 * Usage:
 *   HIBBULLAH_SUPABASE_TOKEN=supabase_admin_token_node_... node supabase/apply-fix-migration.mjs
 *
 * The token is the Supabase "management API" / personal access token (starts with sbp_... if
 * pasted by the user) OR a project-level admin token. It is read ONLY from the environment or
 * from a file whose path is given in HIBBULLAH_SUPABASE_TOKEN_FILE (the token is never written into
 * this repo).
 *
 * Alternative (no token): open supabase/apply-to-hibbullah-hosted.sql in the Supabase Dashboard
 * SQL Editor and run the whole file — it already includes migration 20260923090000.
 */
import { readFileSync } from 'node:fs'
import { env } from 'node:process'

const PROJECT_REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const MIGRATION = new URL('./migrations/20260923090000_fix_order_inventory_sync.sql', import.meta.url)

let token = env.HIBBULLAH_SUPABASE_TOKEN
if (!token && env.HIBBULLAH_SUPABASE_TOKEN_FILE) {
  token = readFileSync(env.HIBBULLAH_SUPABASE_TOKEN_FILE, 'utf8').trim()
}
if (!token) {
  console.error('Set HIBBULLAH_SUPABASE_TOKEN (or HIBBULLAH_SUPABASE_TOKEN_FILE) first.')
  process.exit(1)
}

const sql = readFileSync(MIGRATION, 'utf8')

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
})

const body = await res.text()
if (!res.ok) {
  console.error(`HTTP ${res.status}`)
  console.error(body.slice(0, 2000))
  process.exit(1)
}
console.log('Applied migration 20260923090000 (fix_order_inventory_sync).')
console.log('Response:', body.slice(0, 300))