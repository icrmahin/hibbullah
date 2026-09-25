/**
 * Remove dead test addresses from the live admin allowlist.
 *
 * `is_admin()` and `enforce_profile_role()` carry a hard-coded list of the two real
 * admin addresses. A verification run adds a throwaway address to grant itself admin
 * rights, and the run that added it normally takes it away again -- but not always: a
 * Ctrl-C, a crash or a network timeout between the grant and the revoke leaves the
 * address behind, embedded in the function that decides who is an admin.
 *
 * The row it referred to is long gone, so the entry grants nothing. It is still a
 * stranger's email address sitting in production code, and it should not be there.
 *
 * This is idempotent: running it twice is a no-op. It is also safe to run while a
 * verification is in progress *before* the grant, and harmless afterwards. See
 * `lib/admin-allowlist.mjs` for how the grant itself is now made interruptible.
 */
import { sanitise, REAL_ADMINS } from './lib/admin-allowlist.mjs'

const removed = await sanitise()

if (removed.length === 0) {
  console.log('Admin allowlist already clean:')
  for (const email of REAL_ADMINS) console.log(`  ${email}`)
  console.log('\nNothing needed fixing.')
} else {
  console.log('Removed from the live admin allowlist:')
  for (const entry of removed) console.log(`  ${entry}`)
  console.log('\nRemaining:')
  for (const email of REAL_ADMINS) console.log(`  ${email}`)
}
