/**
 * Unit tests for the admin-allowlist rewriting, with no network involved.
 *
 * This exists because the bug it guards against is invisible from the outside: a
 * `replace` that matches nothing leaves the function untouched and the cleanup reports
 * success, while a stray test address stays embedded in the production role trigger. The
 * only way to notice is to test the rewrite against the real `pg_get_functiondef` output
 * for both functions, which is what the shapes below are copied from.
 *
 * Run: node supabase/lib/admin-allowlist.test.mjs
 */
import assert from 'node:assert/strict'

const REAL = "'icrmahin@gmail.com', 'hibbullah82026@gmail.com'"

// Copied from the live project's pg_get_functiondef output.
const IS_ADMIN = `CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
  select exists (
    select 1 from auth.users
    where auth.users.id = auth.uid()
      and lower(auth.users.email) in ('e2e-1@hibbullah.test', 'icrmahin@gmail.com', 'hibbullah82026@gmail.com')
  );
$function$
`

const ROLE_TRIGGER = `CREATE OR REPLACE FUNCTION public.enforce_profile_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_email text;
  v_allowed_role text;
begin
  select lower(email) into v_email from auth.users where id = new.id;
  if v_email is null then
    v_email := lower(new.email);
  end if;

  if v_email in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com', 'e2e-2@hibbullah.test') then
    v_allowed_role := 'admin';
  else
    v_allowed_role := 'customer';
  end if;

  if v_allowed_role = 'admin' and (new.phone is null or new.phone = '') then
    new.phone := null;
  end if;

  new.updated_at := now();
  return new;
end;
$function$
`

// The rewriting itself, inlined rather than imported, so the test pins the exact pattern
// in use. If the module's implementation changes, this test is expected to be updated
// with it -- and `node supabase/verify-allowlist.mjs` proves the module still works
// against the real database.
const replaceList = (def, list) => def.replace(/(\w*email\)?\s+in\s*)\([^)]*\)/i, `$1(${list})`)
const emailsIn = (def) => [...new Set(def.match(/'[^']+@[^']+'/g) ?? [])]

let passed = 0
const check = (name, fn) => {
  try {
    fn()
    console.log(`  PASS  ${name}`)
    passed += 1
  } catch (error) {
    console.log(`  FAIL  ${name}\n        ${error.message.split('\n')[0]}`)
    process.exitCode = 1
  }
}

console.log('=== admin allowlist rewriting ===\n')

check('is_admin: a stray test address is replaced', () => {
  const out = replaceList(IS_ADMIN, REAL)
  assert.notEqual(out, IS_ADMIN, 'the definition was not changed at all')
  assert.ok(!out.includes('e2e-1@hibbullah.test'), 'stray address survived')
})

check('enforce_profile_role: a stray test address is replaced', () => {
  const out = replaceList(ROLE_TRIGGER, REAL)
  assert.notEqual(out, ROLE_TRIGGER, 'the definition was not changed at all')
  assert.ok(!out.includes('e2e-2@hibbullah.test'), 'stray address survived')
})

check('both real admins survive in is_admin', () => {
  const found = emailsIn(replaceList(IS_ADMIN, REAL))
  assert.deepEqual(found, ["'icrmahin@gmail.com'", "'hibbullah82026@gmail.com'"])
})

check('both real admins survive in the role trigger', () => {
  const found = emailsIn(replaceList(ROLE_TRIGGER, REAL))
  assert.deepEqual(found, ["'icrmahin@gmail.com'", "'hibbullah82026@gmail.com'"])
})

check('the rest of the role trigger is untouched', () => {
  const out = replaceList(ROLE_TRIGGER, REAL)
  for (const fragment of [
    'new.phone := null;',
    'new.updated_at := now();',
    "v_allowed_role := 'customer';",
    'select lower(email) into v_email from auth.users where id = new.id;',
  ]) {
    assert.ok(out.includes(fragment), `lost: ${fragment}`)
  }
})

check('the rest of is_admin is untouched', () => {
  const out = replaceList(IS_ADMIN, REAL)
  for (const fragment of ['auth.users.id = auth.uid()', "SET search_path TO 'public', 'auth', 'pg_catalog'"]) {
    assert.ok(out.includes(fragment), `lost: ${fragment}`)
  }
})

check('a definition with no allowlist is left alone (no blind rewrite)', () => {
  const def = `CREATE OR REPLACE FUNCTION public.unrelated() RETURNS integer LANGUAGE sql AS $fn$ select 1 $fn$`
  assert.equal(replaceList(def, REAL), def)
})

check('appending a test address adds exactly one entry', () => {
  const out = replaceList(ROLE_TRIGGER, `${REAL}, 'notif-99@hibbullah.test'`)
  assert.equal(emailsIn(out).length, 3)
  assert.ok(out.includes('notif-99@hibbullah.test'))
  assert.ok(out.includes('icrmahin@gmail.com'))
  assert.ok(out.includes('hibbullah82026@gmail.com'))
})

check('sanitising is idempotent', () => {
  const once = replaceList(ROLE_TRIGGER, REAL)
  const twice = replaceList(once, REAL)
  assert.equal(once, twice)
})

check('a non-admin address elsewhere in the body is not mistaken for the allowlist', () => {
  // `contact@example.com` is quoted, so emailsIn sees it. replaceList must still only
  // touch the `... email in (...)` clause, and the sanitise() post-condition (wanted vs
  // actual) is what catches a mismatch -- this asserts the substitution is local.
  const def = ROLE_TRIGGER.replace(
    "v_email := lower(new.email);",
    "v_email := lower(new.email); -- see 'support@example.com'",
  )
  const out = replaceList(def, REAL)
  assert.ok(out.includes("'support@example.com'"), 'an unrelated address was swallowed')
  assert.ok(!out.includes('e2e-2@hibbullah.test'), 'the stray allowlist entry survived')
})

console.log(
  process.exitCode
    ? `\n=== ${9 - passed} FAILURE(S) ===`
    : `\n=== ALL ${passed} CHECKS PASSED ===`,
)
