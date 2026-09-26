#!/usr/bin/env node
/**
 * Generate the SECURITY DEFINER lockdown migration from the *live* function bodies.
 *
 * Why generated rather than hand-written: the fix adds a guard to the top of four
 * functions whose bodies already hold the app's order, return and customer-list logic.
 * Re-typing those bodies to insert a line is how logic gets silently paraphrased, and
 * `verify:sql-sync` compares function bodies verbatim — so a paraphrase would either
 * surface as spurious drift or, worse, change behaviour while still matching. Instead
 * this reads the current `prosrc` and splices the guard in, so every other statement
 * stays byte-identical to what is running right now.
 *
 * The two order-path functions are plpgsql and get the guard spliced in after `begin`.
 * The two customer RPCs are `language sql` and have no `begin` at all, so they are
 * converted to plpgsql with the original SELECT preserved verbatim under `return query`
 * — the same columns, same joins, same ordering, same pagination.
 *
 * The splice is checked before anything is written: the original body must still be
 * present byte-for-byte, and the guard must be present. If either fails this throws
 * rather than emitting a migration that looks right and is not.
 *
 * Not part of `npm run verify` — it writes a migration. Run once, by hand; the output is
 * committed, and `verify:sql-sync` is what keeps the committed copy honest afterwards.
 *
 *   set -a && . ./.env && set +a && node supabase/build-lockdown.mjs
 */
import { writeFileSync } from 'node:fs'
import { env } from 'node:process'

const REF = env.HIBBULLAH_SUPABASE_PROJECT_REF || 'xkvjhvwrzfczymbgapip'
const MGMT = env.HIBBULLAH_SUPABASE_TOKEN
const OUT = 'supabase/migrations/20260928010000_secdef_grants_and_guards.sql'

if (!MGMT) {
  console.error('Set HIBBULLAH_SUPABASE_TOKEN first.')
  process.exit(1)
}

const q = async (sql) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`SQL failed: HTTP ${res.status} ${body.slice(0, 500)}`)
  return JSON.parse(body)
}

const catalog = async (name) => {
  const rows = await q(
    `select p.prosrc,
            pg_get_function_arguments(p.oid)          as args,
            pg_get_function_identity_arguments(p.oid) as ident,
            pg_get_function_result(p.oid)             as result,
            pg_get_userbyid(p.proowner)               as owner,
            l.lanname                                  as lang
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       join pg_language  l on l.oid = p.prolang
      where n.nspname = 'public' and p.proname = '${name}'`,
  )
  if (!rows[0]) throw new Error(`${name} does not exist`)
  return rows[0]
}

/** Insert `guard` as the first statement of a plpgsql body, immediately after `begin`. */
function splicePlpgsql(body, guard, name) {
  const lines = body.split('\n')
  const hits = lines.map((l, i) => (/^\s*begin\s*$/i.test(l) ? i : -1)).filter((i) => i >= 0)
  if (hits.length !== 1) {
    throw new Error(`${name}: expected exactly one top-level 'begin', found ${hits.length}`)
  }
  const at = hits[0]
  return [...lines.slice(0, at + 1), ...guard, ...lines.slice(at + 1)].join('\n')
}

/**
 * Wrap a `language sql` body in plpgsql, guard first, original SELECT under `return query`.
 *
 * The body is not touched — it is spliced in as a single string. `return query` accepts
 * exactly the statement that `language sql` would have run on its own, so the projection,
 * join, filter, ordering and limit are all the ones already in production.
 */
function wrapSql(body, guard, name) {
  if (body.includes(';') && body.replace(/;\s*$/, '').includes(';')) {
    throw new Error(`${name}: body has more than one statement — return query only takes one`)
  }
  return ['begin', ...guard, '  return query', body.trimEnd(), 'end;'].join('\n')
}

const ADMIN_GUARD = [
  '  -- Anon-callable and unguarded: any logged-out visitor could page the whole customer',
  '  -- list out of this, because SECURITY DEFINER ignores the RLS on profiles and orders.',
  '  if not public.is_admin() then',
  "    raise exception 'Only admins can query customers';",
  '  end if;',
]

const OWNER_GUARD = [
  "  -- This took p_customer_id on trust, so a caller could name a different customer and",
  '  -- have the ownership check further down validate that wrong pair. The app only ever',
  "  -- passes the signed-in user's own id, so requiring that costs nothing and closes",
  '  -- the impersonation.',
  '  if auth.uid() is distinct from p_customer_id then',
  "    raise exception 'Customer ID must match authenticated user';",
  '  end if;',
]

const GUARDED = [
  { name: 'get_customers_with_stats', lang: 'sql', guard: ADMIN_GUARD, why: 'admin only' },
  { name: 'get_customer_stats', lang: 'sql', guard: ADMIN_GUARD, why: 'admin only' },
  { name: 'create_order', lang: 'plpgsql', guard: OWNER_GUARD, why: 'caller must be the customer they name' },
  { name: 'validate_return', lang: 'plpgsql', guard: OWNER_GUARD, why: 'caller must be the customer they name' },
]

/**
 * Functions that must never be reachable over PostgREST.
 *
 * `deduct_inventory_fifo` destroyed real stock when called by an anonymous visitor.
 * `notify_user` wrote an arbitrary notification into a real admin account.
 * `is_admin_email` confirmed which addresses are administrators, which is the
 * reconnaissance step for targeting them. `rls_auto_enable` is an event-trigger helper.
 *
 * All are owned by postgres and are only ever reached from inside another SECURITY
 * DEFINER function or from a trigger. Both execute as the owner, and an owner keeps
 * EXECUTE implicitly whatever the ACL says — which is what makes the revoke safe. The
 * owner is re-checked from the catalog below rather than assumed.
 *
 * `is_admin` is deliberately NOT revoked from anon: twenty-four policies evaluate it for
 * role `public`, and denying EXECUTE would turn every anonymous read of products or
 * categories into a permission error instead of an empty result.
 */
const LOCKED = ['deduct_inventory_fifo', 'notify_user', 'is_admin_email', 'rls_auto_enable']

const header = `-- Generated by supabase/build-lockdown.mjs — do not hand-edit, re-run the generator.
--
-- Every SECURITY DEFINER function here was created without an explicit GRANT, so Postgres
-- applied its default: EXECUTE to PUBLIC. A definer function runs as its owner and so
-- ignores the RLS protecting the tables underneath, which turned each of these into a way
-- past those policies. All of the following were confirmed working for a logged-out
-- visitor holding only the project's public anon key — a key that ships inside the web
-- bundle by design, so "anonymous" here means anyone who has ever opened the site:
--
--   get_customers_with_stats   every customer's name, email, phone, order count and
--                              lifetime spend, pageable with p_limit / p_offset
--   get_customer_stats         the same figures for any single customer id
--   deduct_inventory_fifo      decremented real stock (98 -> 97 on a live product)
--   notify_user                wrote an arbitrary notification into a real admin account
--   is_admin_email             confirmed which email addresses are administrators
--
-- The two order-path functions took a customer id on trust, so a caller could name
-- somebody else and have the ownership check further down validate the wrong pair.
--
-- Guards are added alongside the grants, not instead of them: a GRANT revoked today can
-- be re-granted tomorrow by a migration that assumed a default it did not check, and a
-- function with no in-body authorisation is then wide open again.
`

const out = [header]

for (const g of GUARDED) {
  const c = await catalog(g.name)
  if (c.lang !== g.lang) {
    throw new Error(`${g.name} is language ${c.lang}, not ${g.lang} as the generator assumes`)
  }
  if (c.owner !== 'postgres') throw new Error(`${g.name} is owned by ${c.owner}, not postgres`)

  const original = c.prosrc
  const guarded =
    c.lang === 'plpgsql' ? splicePlpgsql(original, g.guard, g.name) : wrapSql(original, g.guard, g.name)

  // The only thing that matters is that the original logic is untouched. The two cases
  // differ in how to prove it: the plpgsql guard goes *inside* the body, so undoing it
  // must give back the original exactly; the sql body is lifted whole under `return
  // query`, so it must appear verbatim.
  const undo = `${g.guard.join('\n')}\n`
  if (c.lang === 'plpgsql') {
    if (guarded.replace(undo, '') !== original) {
      throw new Error(`${g.name}: removing the guard does not give back the live body — refusing to write`)
    }
  } else if (!guarded.includes(original.trimEnd())) {
    throw new Error(`${g.name}: the live body is not present verbatim in the output — refusing to write`)
  }
  if (!g.guard.every((l) => guarded.includes(l))) {
    throw new Error(`${g.name}: guard missing from the output`)
  }

  out.push(`
-- ${'='.repeat(74)}
-- ${g.name} — ${g.why}
-- ${'='.repeat(74)}
create or replace function public.${g.name}(${c.args})
returns ${c.result}
language plpgsql
security definer
set search_path = public
as $$
${guarded}
$$;
`)
}

out.push(`
-- ${'='.repeat(74)}
-- Grants. Postgres handed EXECUTE to PUBLIC on each of these at creation time; the
-- default is why none of them was ever reviewed.
-- ${'='.repeat(74)}`)

for (const name of LOCKED) {
  const c = await catalog(name)
  if (c.owner !== 'postgres') {
    throw new Error(`${name} is owned by ${c.owner}, not postgres — the revoke assumption breaks`)
  }
  out.push(`revoke all on function public.${name}(${c.ident}) from public, anon, authenticated;`)
}

out.push(`
-- The two customer RPCs stay callable by a signed-in admin — that is who uses them — but
-- the anon/public grant they inherited goes away. The in-body is_admin() is the real
-- check; this only removes the path that had no check at all.
revoke all on function public.get_customers_with_stats(text, integer, integer) from public, anon;
revoke all on function public.get_customer_stats(uuid) from public, anon;
`)

writeFileSync(OUT, out.join('\n'))
console.log(`wrote ${OUT}`)
console.log(`  ${GUARDED.length} guarded in-body, ${LOCKED.length} revoked, is_admin left open for anon`)
