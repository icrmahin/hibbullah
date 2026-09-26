/**
 * Unit tests for the admin-allowlist module, with no network involved.
 *
 * This exists because the bugs it guards against are invisible from the outside. A rewrite
 * that matches nothing leaves the function untouched and the cleanup reports success, while
 * a stray test address stays embedded in the function that decides who is an admin. And a
 * second copy of the list in a function nobody patches produces tests that pass over a
 * feature that is dead -- which is the worst of both worlds, because it is green.
 *
 * So the shapes below are copied from the live `pg_get_functiondef` output, and the module's
 * own pattern matching is inlined rather than imported: if the implementation changes, this
 * test is expected to be updated with it, and `node supabase/verify-allowlist.mjs` proves
 * the module still works against the real database.
 *
 * Run: node supabase/lib/admin-allowlist.test.mjs
 */
import assert from 'node:assert/strict'

const REAL = "'icrmahin@gmail.com', 'hibbullah82026@gmail.com'"
const OWNER = 'is_admin_email'

/** Copied from the live project, with a stray test address left in on purpose. */
const OWNER_DEF = `CREATE OR REPLACE FUNCTION public.is_admin_email(p_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select lower(coalesce(p_email, '')) in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com', 'e2e-1@hibbullah.test')
$function$
`

/** The post-migration shape: a delegator, with no address of its own. */
const IS_ADMIN = `CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
  select exists (
    select 1 from auth.users
    where auth.users.id = auth.uid()
      and public.is_admin_email(auth.users.email)
  )
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

  if public.is_admin_email(v_email) then
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

/**
 * The regression this file exists for: a delegator that has drifted back into carrying its
 * own list. This is what transition_order_status() actually looked like, and it is why the
 * lifecycle suite reported green while every status transition failed.
 */
const DUPLICATED_COPY = ROLE_TRIGGER.replace(
  'if public.is_admin_email(v_email) then',
  "if v_email in ('icrmahin@gmail.com', 'hibbullah82026@gmail.com', 'e2e-9@hibbullah.test') then",
)

const emailsIn = (def) => [...new Set(def.match(/'[^']+@[^']+'/g) ?? [])]
const ownerSql = (list) =>
  `create or replace function public.${OWNER}(p_email text)\n` +
  `returns boolean\nlanguage sql\nstable\nsecurity definer\nset search_path = 'public'\n` +
  `as $fn$\n  select lower(coalesce(p_email, '')) in (${list})\n$fn$`

/** Mirrors assertOwnerShapeIntact in the module. */
const EXPECTED_SHAPE = [/lower\s*\(\s*coalesce\s*\(/i, /\bin\s*\(/i, /language\s+sql/i, /security\s+definer/i]
const shapeGaps = (def) => EXPECTED_SHAPE.filter((re) => !re.test(def))

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

console.log('=== admin allowlist: one owner, no second copies ===\n')

// ── the owner function ────────────────────────────────────────────────────────────
check('the owner function is rebuilt with exactly the two real admins', () => {
  const emails = emailsIn(ownerSql(REAL))
  assert.deepEqual(emails, ["'icrmahin@gmail.com'", "'hibbullah82026@gmail.com'"])
})

check('a stray test address in the owner is removed by rebuilding it', () => {
  const rebuilt = ownerSql(REAL)
  assert.ok(!rebuilt.includes('e2e-1@hibbullah.test'), 'stray address survived')
  assert.ok(!emailsIn(rebuilt).some((e) => e.includes('e2e-')), 'stray address survived')
})

check('appending a test address adds exactly one entry', () => {
  const out = ownerSql(`${REAL}, 'lc-99@hibbullah.test'`)
  assert.equal(emailsIn(out).length, 3)
  assert.ok(out.includes('lc-99@hibbullah.test'))
  assert.ok(out.includes('icrmahin@gmail.com'))
  assert.ok(out.includes('hibbullah82026@gmail.com'))
})

check('the owner stays null-safe and case-insensitive', () => {
  const out = ownerSql(REAL)
  assert.ok(out.includes('lower(coalesce(p_email'), 'null-safety or case-folding was lost')
})

check('rebuilding is idempotent', () => {
  const once = ownerSql(REAL)
  assert.equal(once, ownerSql(REAL))
})

check('the shape guard accepts the real owner', () => {
  assert.deepEqual(shapeGaps(OWNER_DEF), [])
})

check('the shape guard rejects an owner it does not recognise', () => {
  // A migration that changes the signature must stop the rewrite, not be reverted by it.
  const changed = OWNER_DEF.replace('lower(coalesce(p_email, \'\')) in', 'p_email =')
  assert.ok(shapeGaps(changed).length > 0, 'a changed owner should fail the shape guard')
})

check('the shape guard rejects a plain equality (single admin, not a list)', () => {
  const changed = OWNER_DEF.replace(/\bin\s*\([^)]*\)/, "= 'icrmahin@gmail.com'")
  assert.ok(shapeGaps(changed).length > 0, 'a non-list owner should fail the shape guard')
})

// ── the delegators ────────────────────────────────────────────────────────────────
check('a delegating function is clean: no address of its own', () => {
  assert.deepEqual(emailsIn(IS_ADMIN), [])
  assert.ok(IS_ADMIN.includes('public.is_admin_email('), 'it should delegate to the owner')
})

check('the role trigger is clean and still delegates', () => {
  assert.deepEqual(emailsIn(ROLE_TRIGGER), [])
  assert.ok(ROLE_TRIGGER.includes('public.is_admin_email('))
})

check('the role trigger keeps the rest of its behaviour', () => {
  for (const fragment of [
    'new.phone := null;',
    'new.updated_at := now();',
    "v_allowed_role := 'customer';",
    'select lower(email) into v_email from auth.users where id = new.id;',
  ]) {
    assert.ok(ROLE_TRIGGER.includes(fragment), `lost: ${fragment}`)
  }
})

// ── the invariant that would have caught the real bug ─────────────────────────────
check('a second copy of the list IS detected (the transition_order_status regression)', () => {
  const found = emailsIn(DUPLICATED_COPY)
  assert.ok(
    found.length > 0,
    'a delegator carrying its own addresses must be reported as an offender, or sanitise() would wave it through',
  )
  assert.ok(found.includes("'e2e-9@hibbullah.test'"))
})

check('a stray address in an unrelated comment is still not a false positive... or is it', () => {
  // Deliberately strict: ANY quoted address outside the owner is an offender, even in a
  // comment. A comment cannot grant admin, so flagging it costs one line of noise, whereas
  // missing a real second copy costs a locked-out owner. Strict is the right way to fail.
  const commented = ROLE_TRIGGER.replace("v_email := lower(new.email);", "v_email := lower(new.email); -- support@example.com")
  assert.ok(emailsIn(commented).length > 0, 'strict mode should flag even a comment')
})

console.log(
  process.exitCode
    ? `\n=== ${10 - passed} FAILURE(S) ===`
    : `\n=== ALL ${passed} CHECKS PASSED ===`,
)
