#!/usr/bin/env node
/**
 * Test the district resolver against the real modules, because it decides what a customer
 * is charged.
 *
 * The address form is a plain text field rather than a 64-item picker, so the app now
 * accepts whatever a customer types and resolves it here. That is a real loosening: the
 * delivery-fee rule is a single equality test against one district name, and anything it
 * does not recognise is billed the full ৳150. So the thing worth proving is not that the
 * resolver is tidy — it is that loosening the input cannot undercharge anybody.
 *
 * The failure that matters is a typo in a Dhaka address resolving to ৳80, or an
 * unrecognised district silently costing the reduced rate. Both are asserted below as
 * mechanical properties over all 64 districts, not as a handful of examples.
 *
 * The real `districts.ts`, `config.ts` and `deliveryFee.ts` are loaded, not reimplemented.
 * A copy of the fee rule in a test is a second source of truth, and this project already
 * has a check whose entire job is preventing that.
 */
import { loadTsModule, cleanup } from './lib/load-ts-module.mjs'

const results = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ ok, label, actual, expected })
}

try {
  const { DISTRICTS, INSIDE_DHAKA_DISTRICT, resolveDistrict, isInsideDhaka } =
    await loadTsModule('src/constants/districts.ts')
  const { config } = await loadTsModule('src/constants/config.ts')
  const { deliveryFeeForDistrict } = await loadTsModule('src/utils/deliveryFee.ts')

  const REDUCED = config.deliveryFees.insideDhaka
  const FULL = config.deliveryFees.outsideDhaka

  // ── the list itself is still intact ──────────────────────────────────────────────
  check('the district list still holds 64 entries', DISTRICTS.length, 64)

  // ── every canonical name round-trips ─────────────────────────────────────────────
  const badRoundTrip = DISTRICTS.filter((d) => resolveDistrict(d.name)?.name !== d.name)
  check('every canonical name resolves to itself', badRoundTrip.map((d) => d.name), [])

  // ── case and padding ─────────────────────────────────────────────────────────────
  check('case and padding are forgiven', [
    resolveDistrict('  dhaka  ')?.name,
    resolveDistrict('CHATTOGRAM')?.name,
    resolveDistrict(' boGuRa ')?.name,
  ], ['Dhaka', 'Chattogram', 'Bogura'])

  // ── Bangla, which is how customers actually look for their own district ──────────
  const badBangla = DISTRICTS.filter((d) => resolveDistrict(d.bn)?.name !== d.name)
  check('every Bangla name resolves to its district', badBangla.map((d) => d.name), [])

  // ── a trailing "district" ────────────────────────────────────────────────────────
  check('a trailing "district" is accepted', [
    resolveDistrict('Dhaka District')?.name,
    resolveDistrict('Sylhet District')?.name,
  ], ['Dhaka', 'Sylhet'])

  // ── the pre-2018 spellings still in circulation ────────────────────────────────
  // Named explicitly rather than derived from the table, because the contents of the
  // alias table are a product decision and a test that reads them back proves only that
  // the code agrees with itself. `Daka` is the one that costs money: it is the most
  // likely way a Dhaka customer types their own district, and dropping it would bill
  // them ৳150 instead of ৳80 while the field looked like it had accepted the input.
  check('the pre-2018 spellings and Daka resolve', [
    resolveDistrict('Bogra')?.name,
    resolveDistrict('Barisal')?.name,
    resolveDistrict('Jessore')?.name,
    resolveDistrict('Chittagong')?.name,
    resolveDistrict('Comilla')?.name,
    resolveDistrict('Daka')?.name,
  ], ['Bogura', 'Barishal', 'Jashore', 'Chattogram', 'Cumilla', 'Dhaka'])

  // ── the apostrophe, which is the same district written four ways ────────────────
  check("Cox's Bazar resolves however the apostrophe is typed", [
    resolveDistrict("Cox's Bazar")?.name,
    resolveDistrict('Coxs Bazar')?.name,
    resolveDistrict('Cox Bazar')?.name,
    resolveDistrict('cox\'s  bazar')?.name,
  ], ["Cox's Bazar", "Cox's Bazar", "Cox's Bazar", "Cox's Bazar"])

  // ── nonsense is rejected rather than guessed at ─────────────────────────────────
  check('unrecognised text resolves to nothing', [
    resolveDistrict('')?.name,
    resolveDistrict('   ')?.name,
    resolveDistrict('Atlantis')?.name,
    resolveDistrict('Dhakka')?.name,
    resolveDistrict('99')?.name,
    resolveDistrict('dhaka, chattogram')?.name,
    resolveDistrict(null)?.name,
    resolveDistrict(undefined)?.name,
  ], Array(8).fill(undefined))

  // ── the money invariant, part 1: the resolver never changes a district's fee ─────
  // A district that is not Dhaka must cost the full rate after resolution, and Dhaka
  // must still get the reduced one. Any drift here is a pricing bug.
  const mispriced = DISTRICTS.filter((d) => {
    const fee = deliveryFeeForDistrict(resolveDistrict(d.name)?.name)
    return fee !== (isInsideDhaka(d.name) ? REDUCED : FULL)
  })
  check('resolving a district never changes its fee', mispriced.map((d) => d.name), [])

  // ── the money invariant, part 2: the reduced rate is reachable only via Dhaka ────
  const reducedNames = DISTRICTS.filter((d) => deliveryFeeForDistrict(d.name) === REDUCED)
  check('exactly one district earns the reduced rate', reducedNames.map((d) => d.name), [
    INSIDE_DHAKA_DISTRICT,
  ])

  // ── the money invariant, part 3: no typo can undercharge ────────────────────────
  // Every district name is corrupted three ways — a dropped character, a doubled one,
  // and a transposed pair. If any of those resolves to Dhaka, a one-keystroke mistake
  // in any of the other 63 districts would be billed ৳80 instead of ৳150. Corruptions of
  // "Dhaka" itself are excluded from the expectation, since landing on Dhaka from a
  // near-miss of Dhaka is not the undercharge being guarded against.
  const corrupt = (name) => [
    name.slice(0, -1),
    name + name.slice(-1),
    name.length > 2 ? name[1] + name[0] + name.slice(2) : name + name[0],
  ]

  const undercharges = []
  for (const d of DISTRICTS) {
    for (const variant of corrupt(d.name)) {
      const hit = resolveDistrict(variant)
      if (hit && hit.name === INSIDE_DHAKA_DISTRICT && d.name !== INSIDE_DHAKA_DISTRICT) {
        undercharges.push(`${variant} -> ${hit.name}`)
      }
    }
  }
  check('a corrupted district name never resolves to Dhaka', undercharges, [])

  // ── and unrecognised text always costs the full rate ────────────────────────────
  const wrongFeeForJunk = [
    'Atlantis',
    'Dhakka',
    '   ',
    'dhaka, chattogram',
    '999',
  ].filter((junk) => deliveryFeeForDistrict(resolveDistrict(junk)?.name) !== FULL)
  check('an unrecognised district always costs the full rate', wrongFeeForJunk, [])
} finally {
  cleanup()
}

// ── report ────────────────────────────────────────────────────────────────────────

let failed = 0
for (const r of results) {
  if (r.ok) {
    console.log(`  ok    ${r.label}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${r.label}`)
    console.log(`          expected ${JSON.stringify(r.expected)}`)
    console.log(`          actual   ${JSON.stringify(r.actual)}`)
  }
}

console.log(
  failed === 0
    ? `\n=== all ${results.length} district-resolver checks pass ===`
    : `\n=== ${failed} of ${results.length} district-resolver checks FAILED ===`,
)
process.exit(failed === 0 ? 0 : 1)
