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
const PROFIT = 'supabase/migrations/20260930010000_real_profit_and_stock_restore.sql'
const SEARCH = 'supabase/migrations/20260930020000_search_by_brand_and_manufacturer.sql'
const HOSTED = 'supabase/apply-to-hibbullah-hosted.sql'
/**
 * The two SQL files a `search_products` change has to be mirrored into.
 *
 * Both, always. `verify-sql-sync` also asserts the hosted bootstrap and the migrations
 * agree, so changing one without the other trips the drift check — and the mutation harness
 * would then report the case as caught, by a guard that has nothing to do with the property
 * under test. A suite that depends on the reader noticing which guard fired is not a suite.
 */
const SEARCH_SQL = [SEARCH, HOSTED]
const REPORTS_TS = 'src/services/reports.ts'
const EXPIRY_TS = 'src/app/(admin)/inventory/expiry.tsx'
const DIFF_TS = 'src/utils/auditDiff.ts'
const PUSH = 'supabase/migrations/20261003020000_push_notifications.sql'

const cases = [
  // Both notify_user cases are aimed at the push migration, not the lockdown one. The
  // check reads from the migration that LAST defines the function, and the push migration
  // redefined notify_user with the reference parameter — so the lockdown's revoke is
  // outside the window now, and mutating it would prove nothing. Same lesson as
  // deduct_inventory_fifo below: a mutation has to break the copy that is load-bearing.
  ['drop the notify_user revoke', PUSH, (s) => s.replace(/^revoke all on function public\.notify_user[^\n]*\n/m, '')],
  // Retargeted. This used to break the `deduct_inventory_fifo` revoke in the lockdown
  // migration, and it quietly stopped proving anything the moment the profit migration
  // redefined that function with a third argument: the old signature's revoke became
  // irrelevant, so removing it left the current function correctly covered and the check
  // rightly passed. A mutation has to break the thing that is actually load-bearing, and
  // this suite exists precisely to notice when one quietly stops doing that.
  //
  // `deduct_inventory_fifo` is now mutated where it is defined instead, further down.
  [
    'narrow the notify_user revoke to PUBLIC only',
    PUSH,
    (s) =>
      s.replace(
        /^revoke all on function public\.notify_user\(.*\) from public, anon, authenticated;$/m,
        'revoke all on function public.notify_user(uuid, text, text, text, uuid) from public;',
      ),
  ],
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
  // ── profit and restock ──────────────────────────────────────────────────────────
  //
  // Every case below undoes one specific thing that shipped broken. They are grouped here
  // because the reason they are worth mutating is the same reason: each defect was locally
  // reasonable, so nothing short of deliberately breaking it would have shown the check
  // was watching.
  [
    'narrow the restock revokes to PUBLIC only, leaving customers able to add stock',
    PROFIT,
    (s) =>
      s
        .replace(
          /^revoke all on function public\.restock_order_lines[^\n]*$/m,
          'revoke all on function public.restock_order_lines(uuid, uuid, integer, text) from public;',
        )
        .replace(
          /^revoke all on function public\.profit_since[^\n]*$/m,
          'revoke all on function public.profit_since(timestamptz) from public;',
        ),
  ],
  [
    'put a client-side profit guess back in the dashboard service',
    'src/services/admin.ts',
    (s) => s.replace('const j = data as DashboardSalesJson', 'const j = { totalSalesQty: 0, totalSalesRevenue: 0, totalEarning: 0, salesTrend: [], earningTrend: [] } as unknown as DashboardSalesJson\n  const _guess = (unit: number) => unit * 0.8\n  void _guess'),
  ],
  [
    'let the dashboard service re-aggregate order_items, which is how cancelled orders counted as sales',
    'src/services/admin.ts',
    (s) => s.replace('const j = data as DashboardSalesJson', "const j = { ...data, totalEarning: (await supabase.from('order_items').select('quantity')).data?.length ?? 0 } as unknown as DashboardSalesJson"),
  ],
  [
    'stop letting a Postgres raise be a validation refusal',
    'src/lib/errors.ts',
    // The condition lists three SQLSTATEs, so it has to be matched whole — an earlier
    // version of this mutation stopped at the first `'P0001'` looking for a closing paren
    // that is not there, never applied, and the harness correctly reported it as BROKEN
    // rather than as a passing test.
    (s) => s.replace(/\n {2}if \(error\?\.code === 'P0001'[^\n]*\{[\s\S]*?\n {2}\}\n/, '\n'),
  ],
  [
    'stop sending the order line, so approving a return restores nothing',
    'src/services/returns.ts',
    // Scoped to the `it.` form on purpose. `createReturnRequest` and `createReturnRequests`
    // both write `order_item_id`, and a bare `replace` takes the first — the `input.` one
    // — leaving the line the order screen actually uses intact, so the mutation applied and
    // the check still passed. A mutation that cannot fail proves nothing, and this one was
    // proving nothing while reporting as though it were.
    (s) => s.replace('order_item_id: it.orderItemId ?? null,', 'order_item_id: null,'),
  ],
  [
    'revert the dashboard guard to the role claim the project has never had',
    PROFIT,
    (s) => s.replace("if not public.is_admin() then\n    raise exception 'Only admins can query dashboard sales';", "if auth.jwt() ->> 'role' <> 'admin' then\n    raise exception 'Only admins can query dashboard sales';"),
  ],
  [
    'invent a cost price for a product the owner never priced',
    PROFIT,
    (s) => s.replace('and p.cost_price is not null', "and coalesce(p.cost_price, oi.unit_price * 0.8) is not null"),
  ],
  [
    'date the return reversal by the order instead of the approval',
    PROFIT,
    (s) => s.replace('and r.approved_at >= p_since', 'and r.created_at >= p_since'),
  ],
  [
    'let a restock exceed what the order line actually took',
    PROFIT,
    (s) => s.replace('and a.restocked_quantity < a.quantity\n', ''),
  ],
  [
    'fall back to another batch even when the line has already given everything back',
    PROFIT,
    (s) => s.replace('if v_alloc_rows > 0 then', 'if v_alloc_rows >= 0 then'),
  ],
  [
    'stop restocking when an order is cancelled',
    PROFIT,
    (s) => s.replace("if p_new_status = 'CANCELLED' then", 'if false then'),
  ],
  [
    'fire the return trigger on every save, so approving twice restocks twice',
    PROFIT,
    (s) => s.replace("new.status = 'APPROVED' and (old.status is distinct from 'APPROVED')", "new.status = 'APPROVED'"),
  ],
  // ── corner consistency ───────────────────────────────────────────────────────────
  [
    'hard-code a border radius again, so the UI starts drifting on corners',
    'src/app/(customer)/(tabs)/index.tsx',
    // The home screen specifically, because it is the first thing anyone looks at and its
    // card radius was one of the 14 competing values.
    (s) => s.replace('borderRadius: radius.lg', 'borderRadius: 16'),
  ],
  // ── one palette, and a shadow that actually casts one ────────────────────────────
  //
  // These are the dark-mode defects, each of which was invisible in a screenshot: a black
  // shadow on a near-black page casts nothing, a retuned background silently switches off a
  // hex comparison, and a hex literal in a `StyleSheet` cannot change with the theme at all.
  //
  // The first two were rewritten when the flat redesign removed the shadow system, because
  // the shapes they mutated no longer exist. What they now guard is the same property in
  // its new form: the glow is retained in the palette but unread by the hook (a token
  // nothing implements), and `buildShadows` takes no parameter (an argument accepted and
  // ignored was the original bug). Each mutation below reintroduces exactly that shape.
  [
    'delete the retained glow, so the palette no longer documents why it existed',
    'src/constants/darkColors.ts',
    // The guard tests both halves of the glow rule: the token is still *defined*, and the
    // flat hook correctly does not read it. Dropping the definition breaks the first half,
    // which is the one that matters — a palette entry removed while a comment elsewhere
    // still explains it.
    (s) => s.replace(/^\s*glow:.*$/m, '').replace(/^\s*glowStrong:.*$/m, ''),
  ],
  [
    'take a parameter and ignore it again',
    'src/constants/shadows.ts',
    // The original signature, in the shape the flat version can still take: a parameter
    // that exists and is not read is precisely how the black-shadow bug got in.
    (s) => s.replace('function buildShadows() {', 'function buildShadows(_colors: unknown) {'),
  ],
  [
    'vary the steps again, so one of them casts and six do not',
    'src/constants/shadows.ts',
    // Flat means all seven are the same value. One different step is a shadow that
    // reappears in one place only, which is the hardest version of this to notice.
    (s) => s.replace('lg: { boxShadow: FLAT },', 'lg: { boxShadow: "0px 12px 24px rgba(0,0,0,0.08)" },'),
  ],
  [
    'hard-code a colour in a screen again',
    'src/app/(customer)/delivery-cycle.tsx',
    // The style entry the price used to carry its colour in. The migration moved colour to
    // the call site (`{ color: colors.text }`), so the mutation puts the literal back in
    // the stylesheet — same crime, same check.
    (s) => s.replace('itemPrice: {', "itemPrice: { color: '#3D4A46',"),
  ],
  [
    'infer the theme by comparing a colour to a hex',
    'src/app/(customer)/(tabs)/account.tsx',
    // Exactly the expression that was there before, and exactly the failure mode: it is
    // not an error, it is a comparison that quietly returns false for every value except
    // the one it was written against.
    (s) => s.replace('const resolvedDark = resolvedTheme === "dark";', 'const resolvedDark = colors.background === "#111A17";'),
  ],
  // ── one grid ───────────────────────────────────────────────────────────────────────
  //
  // "Two cards per row on a phone" had eight implementations. These four break the policy
  // in the four ways it actually broke, one per guard.
  [
    'go back to one card per row on a phone',
    'src/hooks/useResponsive.ts',
    // The value the map had for its whole life, and the reason five screens each wrote
    // their own `isMobile ? 1 :` in front of it.
    (s) => s.replace(/const PRODUCT_COLUMNS = \{\n  xs: 2,\n  sm: 2,/, 'const PRODUCT_COLUMNS = {\n  xs: 1,\n  sm: 1,'),
  ],
  [
    'let the grid lose a column as the screen gets wider',
    'src/hooks/useResponsive.ts',
    // A tablet showing more products than a desktop is the sort of thing nobody reports,
    // because both pages still render and both look deliberate.
    (s) => s.replace('  xl: 4,\n  xxl: 5,\n} as const;\n\n/**\n * Order, customer', '  xl: 2,\n  xxl: 5,\n} as const;\n\n/**\n * Order, customer'),
  ],
  [
    'force an order row two-up on a phone to match the product grid',
    'src/hooks/useResponsive.ts',
    // What a single `columns` would have done. An order row at 170px — a status, a date, an
    // item count and a total — is the version of this that looks like a bug in a screenshot.
    (s) => s.replace('const LIST_COLUMNS = {\n  xs: 1,\n  sm: 1,', 'const LIST_COLUMNS = {\n  xs: 2,\n  sm: 2,'),
  ],
  [
    'let one screen keep its own column count',
    'src/app/(customer)/(tabs)/favorites.tsx',
    // `numColumns={2}` is the policy in its shortest form, and the home screen's
    // `(width - spacing.lg * 2 - spacing.md) / 2` is the same policy written out longhand.
    (s) => s.replace('numColumns={columns}', 'numColumns={2}'),
  ],
  [
    'reinvent the 20% margin on the client, where the database cannot catch it',
    'src/services/products.ts',
    // The line that survived the profit migration. The SQL was fixed, the dashboard check
    // passed, and `createProduct` went on handing every unpriced product a cost of
    // `price * 0.8` — which `profit_since` then faithfully reported as money earned. A
    // check about the database is not a check about what the client sends to it.
    (s) =>
      s.replace(
        'const costPrice = Number.isFinite(costInput) ? costInput : null',
        'const costPrice = Number.isFinite(costInput) ? costInput : Math.round(price * 0.8 * 100) / 100',
      ),
  ],
  [
    'count order lines again and call them products',
    PROFIT,
    // One product sold three times in the window reported as "3 products have no cost
    // price set", and the link on that line went to a catalog that held one of them. The
    // word "products" and the number underneath it were two different quantities.
    (s) => s.replace('count(distinct p.id) filter (where p.cost_price is null)', 'count(*) filter (where p.cost_price is null)'),
  ],
  [
    'give the catalog half the page margin the rest of the app has',
    'src/app/(customer)/(tabs)/products.tsx',
    // The gutter was uniform at 8px and the *margin* was half of everyone else's, so the
    // same card sat flush to the screen edge in the catalog and inset on the home page. A
    // difference that is invisible on one screen and obvious with two side by side.
    (s) => s.replace('content: { paddingHorizontal: spacing.md,', 'content: { paddingHorizontal: spacing.sm,'),
  ],
  [
    'leave a product screen on the library default of one card per row',
    'src/app/(customer)/products/category/[categoryId].tsx',
    // Two `FlashList`s with no `numColumns`, which is 1. Those routes showed one full-width
    // card per row while the catalog beside them showed two, and the check that existed at
    // the time could not see it: it asked whether a screen with a column policy got it from
    // the hook, and this screen had no policy to get wrong.
    //
    // Matched on the line rather than an exact indent: the first attempt hard-coded twelve
    // spaces against a prop that sits at ten, the replacement silently did nothing, and the
    // suite reported the case as broken rather than as passing — which is the outcome that
    // is wanted, but only because a mutation that does not apply is never counted as a catch.
    (s) => s.replace(/^[ \t]*numColumns=\{columns\}\n/m, ''),
  ],
  [
    'put back the hint that promises an automatic cost price',
    'src/components/admin/ProductForm.tsx',
    // The string outlived the behaviour. The app stopped guessing a 20% margin in this very
    // work, and the hint that told the shop to rely on the guess stayed in the form,
    // describing a feature that no longer exists. No check on the arithmetic finds it.
    (s) =>
      s.replace(
        '"Add what you pay for it and this product starts counting towards your earnings."',
        '"Leave cost empty to auto-set price×0.8"',
      ),
  ],
  // ── search must be able to search what it shows ────────────────────────────────────
  //
  // `search_products` returned a `manufacturer_name` column and never used it in the
  // predicate, so `search_products('square')` answered with zero rows on a catalogue with a
  // real Square-branded product. Every existing check passed: the function was present, the
  // two SQL files agreed, it was `stable`, granted to `anon`, indexed, ranked, paginated.
  //
  // The six cases below each undo one specific piece of that fix. They are applied to the
  // migration *and* the hosted bootstrap together, because mutating one alone trips the
  // drift check instead — see SEARCH_SQL.
  //
  // The original bug, verbatim.
  [
    'unmatch the company name again, so "square" finds nothing',
    SEARCH_SQL,
    (s) =>
      s
        .replace(/\n\s*or lower\(m\.name\) like \(select pat from term\) \|\| '%'/g, '')
        .replace(/\n\s*or m\.name ilike '%' \|\| \(select pat from term\) \|\| '%'/g, '')
        .replace(/\n\s*or m\.name % \(select v from term\)/g, ''),
  ],
  [
    'keep the company searchable but prefix-only, so a company mid-name is a lucky miss',
    SEARCH_SQL,
    (s) => s.replace(/\n\s*or m\.name ilike '%' \|\| \(select pat from term\) \|\| '%'/, ''),
  ],
  [
    'make a brand prefix-only again, so a name like "500 mg Zylora" stops matching "Zylora"',
    SEARCH_SQL,
    // Only the contains rung goes. The prefix rung stays, so the field is still matched, and
    // a check that asked nothing more than "is p.brand in the WHERE" would still pass.
    (s) => s.replace(/\n\s*or p\.brand ilike '%' \|\| \(select pat from term\) \|\| '%'/, ''),
  ],
  [
    'drop the company from the ranking ladder, so a company hit ties with a description hit',
    SEARCH_SQL,
    (s) => s.replace(/\n\s*when lower\(m\.name\) like \(select pat from term\) \|\| '%' then \d+/, ''),
  ],
  [
    'interpolate the raw term into the LIKE patterns, so a caller-supplied % becomes a wildcard',
    SEARCH_SQL,
    // `(select pat from term)` -> `(select v from term)` everywhere. `pat` is the escaped
    // copy; `v` is the raw term, and a raw term in a pattern turns a search into
    // "return the whole catalogue" for anyone holding the publishable key.
    (s) => s.replace(/\(select pat from term\)/g, '(select v from term)'),
  ],
  [
    'rank the description fallback above the fuzzy rungs, so a word in a paragraph outranks a brand',
    SEARCH_SQL,
    (s) => s.replace(/(\n\s*else )\d+(\n\s*end as rank)/, '$14$2'),
  ],
  [
    'put the fuzzy rungs above the prefix rungs, so a typo outranks a brand the customer typed',
    SEARCH_SQL,
    // A rank number that goes backwards, with every expression untouched. This is the shape
    // a reordering takes in a diff: the CASE still reads as a list of sensible predicates, and
    // the only thing wrong is the arithmetic, so nothing that looks at the SQL semantics
    // notices. It has to be asserted on the numbers.
    (s) =>
      s
        .replace("when p.name % (select v from term) then 9", 'when p.name % (select v from term) then 2')
        .replace("when p.brand % (select v from term) then 11", 'when p.brand % (select v from term) then 3'),
  ],
  // Every case above is a property that can be read out of the SQL text. The ranking *order*
  // between two real products cannot, and has its own suite against rows it creates and
  // deletes: `verify-search-matches.mjs`.
]

let notCaught = 0
let broken = 0

// A case may name more than one file, and when the change has to be mirrored the mutation is
// applied to all of them together.
//
// This is not a convenience. `verify-sql-sync` also checks that the hosted bootstrap and the
// migrations agree, so a SQL change made in only one of the two trips the *drift* check and
// the harness reports the mutation as caught — by a guard that has nothing to do with the
// property under test. Every SQL mutation below would have "passed" for that reason, while
// proving nothing at all. The `caught` list names the first two FAILs, so the wrong one is
// visible in the output, but a suite that depends on someone reading it carefully is not a
// suite.
for (const [label, target, mutate] of cases) {
  const files = Array.isArray(target) ? target : [target]
  const originals = files.map((f) => readFileSync(f, 'utf8'))
  const mutations = originals.map((src) => mutate(src))

  const unapplied = files.filter((f, i) => mutations[i] === originals[i])
  if (unapplied.length > 0) {
    console.log(
      `  BROKEN   ${label}\n           the mutation did not apply to ${unapplied.join(', ')}, so it would pass for the wrong reason`,
    )
    broken += 1
    continue
  }

  files.forEach((f, i) => writeFileSync(f, mutations[i]))
  let out = ''
  try {
    execFileSync('node', ['supabase/verify-sql-sync.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
  files.forEach((f, i) => writeFileSync(f, originals[i]))

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
