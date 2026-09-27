# Hibbullah — TODO / Implementation Checklist

Big picture: [`docs/ROADMAP.md`](./ROADMAP.md).

## 🏁 DONE

- [x] Schema applied to `xkvjhvwrzfczymbgapip` — all 20 migrations + migration-history rows (via Supabase Management API, each returned HTTP 201).
- [x] Schema verified — 16/16 tables answer `200 []` on the REST API.
- [x] Auth config: email confirm OFF, redirect allow-list includes `hibbullah://**` family + `exp://**`.
- [x] Backend E2E smoke test: signup → auto profile (`role=customer`) → `is_admin()` RPC → public read. Test user deleted.
- [x] Cloudinary upload verified twice (HTTP 200, `secure_url`).
- [x] `shadow*` → `boxShadow` migration: `src/constants/shadows.ts`, `src/components/products/ProductCard.tsx`, `src/app/(customer)/products/[productId].tsx`, `src/app/(customer)/account/notifications.tsx`, `src/app/(customer)/checkout.tsx`, `src/app/(customer)/(tabs)/index.tsx`. Zero `shadow*` remain.
- [x] Realtime subscribe sites (cart/products/notifications) ignore PGRST205 silently; removed noisy handled `console.error` in CartProvider.
- [x] Error handling: `normalizeError` surfaces real Supabase messages + friendly PGRST205 guidance; orders and cart screens show proper states (`No orders yet` / error + Retry).
- [x] Add/Edit product: inline **＋ Add category / Manufacturer** creation for empty-DB onboarding; image fields explicitly optional.
- [x] `npx tsc --noEmit` = 0 errors · ESLint = 0 errors · `expo export --platform web` = clean bundle.

### Profile, avatars, and product search (6 migrations, `20260926100000`–`20260926150000`)

- [x] Phone is stored and displayed as `+880`: fixed prefix input, `+8801…` / `018…` / `880…` all normalize to 10 editable digits, `profiles_phone_format` keeps the column canonical.
- [x] Settings has exactly one profile entry — the name/email/avatar row opens the editor. The separate "Profile Details" row, and the unreachable `account/overview.tsx` + `account/settings.tsx`, are gone.
- [x] Profile-picture upload for user **and** admin. One slot per account (`avatars/<uid>`), re-upload overwrites in place, remove destroys via the Edge Function. The admin sidebar shows the real picture.
- [x] "Password & Security" is its own screen: change password (current password verified) + "email me a reset link". It no longer opens the profile editor.
- [x] "Migrate image to cloudinary" is gone. Images upload to Cloudinary at pick time; all text/number/location data goes to Supabase. `src/services/imageMigration.ts` deleted.
- [x] Search is server-side everywhere (home overlay, search, products tab, category, manufacturer, admin catalog) — ranked in Postgres, debounced 250 ms, one request per term with in-flight aborts, real match totals.
- [x] Catalog holds up at 4k+ products: every list is a FlashList with `drawDistance`, images load lazily, browse pages by keyset cursor and search by offset. No screen maps over the whole catalog.
- [x] Both product write-path bugs fixed: create is one `create_product` transaction, and edit is a **partial** update (`undefined` = unchanged, `null` = clear), so an edit no longer silently nulls `cost_price` / `original_price` / `discount_percent`.
- [x] FlashList replaces the `ScrollView`-over-everything lists (no `columnWrapperStyle` in v2 — gutters come from paired padding).
- [x] Unsearchable chip strips for categories/manufacturers replaced by a `SearchableSelect` (search-as-you-type + virtualized).
- [x] `EXPO_PUBLIC_CLOUDINARY_*` added to `eas.json` for both build profiles (product image upload was failing in every EAS build).
- [x] `.env.example` documents the Cloudinary contract, including why avatars need their own folder-scoped preset.
- [x] `ImageUpload` menu no longer renders clipped inside the preview's `overflow: hidden`.
- [x] Removed the `as any` at `(admin)/inventory/adjustment.tsx:19`. `AGENT.md` is satisfied.
- [x] `npx tsc --noEmit` = 0 errors · ESLint = 0 errors · `expo export --platform web` = clean bundle.

### Admin dashboard: customers, reports, returns, audit log

- [x] **Five unauthenticated data paths closed.** `get_customers_with_stats`,
      `get_customer_stats`, `deduct_inventory_fifo`, `notify_user` and `is_admin_email`
      were `SECURITY DEFINER` with EXECUTE open to `public` — reachable with an anonymous
      key. Migration `20260928010000` revokes them and adds an in-body admin guard, and is
      generated from live `prosrc` by `supabase/build-lockdown.mjs` rather than
      hand-written, so the rewritten body is provably the old one plus a guard. Proved
      live: `401` for anon, `403`/`400` for a signed-in customer, admin unaffected, and
      `products`/`categories` still readable by anon so the shop still opens.
- [x] **`create_order` and `validate_return` refuse a foreign `p_customer_id`** —
      "Customer ID must match authenticated user".
- [x] **Reports aggregate in the database** via a new `get_reports()` RPC that takes
      `p_low_stock_threshold` / `p_expiry_warning_days` as parameters, so `config` stays
      the single source of truth. The old client-side two-request version and a hard-coded
      90-day expiry window are gone; `reports/index.tsx` now makes one round trip.
- [x] **Report and customer-spend scope is deliberate and documented** — revenue and
      discounts count `DELIVERED` orders only, while a customer's "total spent" is
      everything except `CANCELLED` because it is lifetime value; their order *count*
      still includes cancelled ones.
- [x] **The audit log says what changed** — `src/utils/auditDiff.ts` derives an
      INSERT/DELETE/UPDATE-aware diff from `old_value` / `new_value`, honouring the
      dropped-field cap with "+N more".
- [x] **Returns retries on error, confirms before approving or rejecting, and shows
      quantity and date**; the customers screen paginates for real (fetches `pageSize + 1`),
      deduplicates by id, and surfaces `totalSpent`.
- [x] **A write that changed nothing can no longer report success.** PostgREST answers an
      `UPDATE`/`DELETE` matching no rows with the same `204` as one that matched, so
      `updateReturnStatus`, `deleteAddress`, `setDefaultAddress` and
      `markNotificationAsRead` now append `.select()` and assert a row came back, via
      `src/lib/requireAffected.ts`. Bulk writes are deliberately excluded — "clear all"
      matching nothing is the outcome the user asked for.
- [x] **`supabase/verify-admin-areas.mjs`** — 68 live checks across all four areas plus the
      lockdown negatives: admin-only reads, report and spend arithmetic checked against
      independently hand-written SQL, the full return lifecycle, ownership on every write,
      and the `deduct_inventory_fifo` / `notify_user` / `is_admin_email` refusals. Wired
      into `npm run verify`, and it asserts it left no residue behind.
- [x] **The static guards are not decorative.** `supabase/mutation-test-sql-sync.mjs`
      breaks each of the 20 assertions in `verify-sql-sync.mjs` in turn and requires every
      one to fail. Also wired into `npm run verify`.

## 👉 User follow-up (no code)

Everything in this list is something only the account owner can do. It is split by whether
the item is still owed, and the finished ones say **how** they were confirmed — a checklist
that marks work done without saying how is worth nothing.

### Still owed

- [ ] **Rotate the `sbp_…` Supabase Management API token.** It was shared in chat, so treat
      it as disclosed. Nothing can be applied or verified until a fresh one is in
      `HIBBULLAH_SUPABASE_TOKEN`; see `supabase/apply-and-diff.mjs` for the script shape.
- [ ] **Rotate `CLOUDINARY_API_SECRET` and the Supabase service-role keys**, which were
      also shared in chat. The secret is live in the `delete-cloudinary-asset` function:
      `supabase secrets set CLOUDINARY_API_SECRET=… CLOUDINARY_API_KEY=… CLOUDINARY_CLOUD_NAME=eomwaokm && supabase functions deploy delete-cloudinary-asset`.
- [ ] **Sign in with the two other admin Gmails** — `hibbullah82026@gmail.com` and
      `hibbullah2027@gmail.com`. They are on the allowlist but have no `auth.users` row, so
      they cannot sign in yet; the `handle_new_user` trigger assigns `role=admin` on signup.
      Verified still outstanding: `profiles` holds exactly one row, `icrmahin@gmail.com`.

### Confirmed done

- [x] **The `hibbullah_avatars` unsigned upload preset exists**, folder-scoped to
      `avatars/`. Probed against the live Cloudinary API with a stub image: the preset
      resolves and authorises the upload, failing only at the image decoder — a missing
      preset is rejected before it ever gets that far.
- [x] **The Cloudinary secrets are set and `delete-cloudinary-asset` is deployed** —
      `npm run verify:edge` and `npm run verify:avatar` exercise the live function.
- [x] **Every migration is applied to the hosted project and the bootstrap is in sync** —
      `npm run verify:sql-sync` diffs `supabase/apply-to-hibbullah-hosted.sql` against all
      of `supabase/migrations/` and reports `IN SYNC` across 42 functions, 27 triggers and
      60 policies.
- [x] **Catalog content exists** — one category, one manufacturer, one product
      (`Napa 500 mg Tablet`).
- [x] **An order was placed and driven to `DELIVERED` end to end** by
      `npm run verify:lifecycle` (57 checks: address → cart → `create_order` → status
      transitions → FIFO stock deduction → notifications). Proven by script, not by a
      person tapping the app — see the browser item below.
- [x] `custom_access_token_hook` — deliberately not enabled; the app does not need it.

### Earning is profit, and stock comes back

Both of these shipped broken, and both were invisible: the dashboard's "Earning" card was
answered by a JavaScript fallback rather than the database, and nothing restored inventory.
Migration `20260930010000_real_profit_and_stock_restore.sql`, proven by
`npm run verify:profit-restock` (66 checks).

- [x] **Earning counts delivered profit, and nothing else.** `DELIVERED` orders only, minus
      returns approved inside the window, and a product with no `cost_price` is **excluded
      and reported** rather than given a made-up margin.
- [x] **The guess had moved, not gone.** The JavaScript fallback was removed, the SQL was
      corrected, the dashboard check went green — and `createProduct` went on sending
      `cost_price: price * 0.8` for every product whose cost box was left empty. The
      exclusion was being undone one RPC call earlier, and `profit_since` was faithfully
      summing an invention as earnings. A check about the database is not a check about what
      the client sends to it; both are now guarded.
- [x] **The product form told the shop to rely on the guess.** Its hint read *"Leave cost
      empty to auto-set price×0.8"* — accurate for the old behaviour, and left behind when
      the behaviour changed. A form that describes a removed feature is its own kind of bug,
      and no check on the arithmetic can see it, so the copy is checked as a promise.
- [x] **"N products have no cost price set" was counting order lines.** `count(*)`, so one
      product sold three times in the window read as three products — and the number's link
      went to a catalog that could not hold three of them. Now `count(distinct p.id)`, and
      the card says what the number is: *earnings exclude N products sold with no cost
      price set · M units*. The migration's own comment claimed the card could "say which
      products to price" while the function only ever returned a count, so that is corrected
      too.
- [x] **An unpriced product still saves.** Not knowing what you paid for something is an
      ordinary state for a shop; refusing the save would be worse than the gap. What it costs
      is that the product is listed for the owner to fill in, which is the whole reason the
      report names the count at all.
- [x] **The client-side fallback is gone.** It summed `order_items` with no join to `orders`
      (so a cancelled order read as sales) and filled a missing cost price as
      `unit_price * 0.8` (so it reported an invented 20% margin as money earned). It ran
      whenever the RPC failed — and the RPC always failed, because its guard read
      `auth.jwt() ->> 'role'`, a claim this project has no mechanism to produce. An RPC
      error is now an error, not a licence to substitute a different number.
- [x] **`get_admin_dashboard_sales` guards on `is_admin()`**, so a real administrator can
      read it and a customer or a logged-out visitor cannot.
- [x] **Cancelling an order returns the units to the batch they came from.** A new
      `order_item_allocations` table records which batch each line drew from, so a cancel is
      an exact undo rather than a guess — the previous behaviour removed the stock from the
      shop for good.
- [x] **Approving a return restocks it and reverses the profit**, dated by the approval.
      Fires only on the crossing to `APPROVED`, so approving twice cannot restock twice.
- [x] **An approval is never blocked and never silent.** A return that cannot be matched to
      an order line, or that asks for more units than were sold, is still approved — the
      quantity is capped and `restock_note` says in plain words what happened. The note is
      shown on the returns screen, so stock cannot quietly drain away.
- [x] **The app names the order line when filing a return.** It previously sent only a
      product *name*, so the database had a string to match on and nowhere to restock from.
- [x] **The inventory helpers are unreachable from outside the database.** Supabase's
      default privileges grant `EXECUTE` to `anon` *and* `authenticated` on every new
      function at `CREATE` time, so `revoke … from public` alone left every signed-in
      customer able to call `restock_order_lines` — a way to add stock to any batch. Revoked
      from `public, anon, authenticated` together, which is now a check.
- [x] **A Postgres `raise` is a stated refusal, not a crash.** "Cart is empty" and "Delivery
      address is required" were both reaching the shop as "An unexpected error occurred".

### One palette, one corner, and a dark mode that has depth

The complaint that started this was that dark mode used accent colours as backgrounds and
did not feel like black. What was actually wrong was narrower and worse than the palette:
`colors.primary` was doing two incompatible jobs, and a black shadow on a black page casts
nothing. Every number below is a WCAG 2.1 ratio, and every one of them is checked by
`npm run verify:contrast` (27 pairs, both themes).

- [x] **The brand is split into a fill and an ink.** `primary` is a fill — dark in *both*
      themes, so its label is `white` either way. `accent` is the ink: a link, an icon, a
      focus ring, a selected border. In light mode `accent` equals the old `primary`, so
      light mode did not move; dark mode gets readable links for the first time. 80 ink
      call sites moved, 28 fill call sites deliberately stayed.
- [x] **The dark surfaces are near-black, not teal.** `#111A17` and `#1A2420` were green-
      tinted, so a screen full of them was dark *green*. Now `#0A0C0B` page, `#131615` card,
      a 1.36:1 hairline edge, and 1–3 units of green on the blue channel — enough to feel
      related to the sage, far too little to tint the UI.
- [x] **A primary button is no longer a pale mint block with white text on it.** Dark mode's
      `primary` was the light sage `#8FB8A8`, used as a background in 12 places. White on
      it was **2.19:1** — less than half the 4.5:1 body text needs, and invisible as a label.
      Now 15.5:1.
- [x] **Dark mode has elevation, which it did not have at all.** `buildShadows` took the
      palette and named the parameter `_colors`; every shadow was a hard-coded
      `rgba(0,0,0,0.04..0.10)`, and a black shadow at 4% on a near-black page casts nothing
      because there is no darker neighbour. So every card, sheet and header was held off the
      page by its border alone. The ambient layer is now the **accent glow** in dark mode —
      light where a shadow cannot go — and the bug is a check.
- [x] **Two real contrast failures in light mode, not just dark.** `textMuted` was 3.37:1
      on the page behind 275 usages, most of them 11–13px captions. The low-stock count on
      the admin dashboard — the most safety-relevant number in the app — was gold at
      **2.69:1**. Both now clear 4.5:1.
- [x] **Six files had their own hex literals**, including `#1A2420` — a dark-mode surface —
      as the placeholder behind a product photo in *both* themes, so light mode showed a
      near-black rectangle behind every product with no picture. `auth-callback.tsx` used
      `'red'` and `'#666'`, the one page in the app with no way to respect dark mode.
- [x] **Dark mode is no longer inferred by comparing a colour to a hex.** `account.tsx` did
      `colors.background === "#111A17"`, which fails *silently* the moment the background
      is retuned — and retuning it is what this change did. It is now `resolvedTheme`.
- [x] **The cart and notification badges carry a label that reads.** A status fill inverts
      between the themes, so its label does too — `textInverse` rather than `white`. This is
      the opposite of a `primary` fill, which is dark in both and takes white. Collapsing
      the two roles is what put a 3.5:1 count on the cart.
- [x] **Every corner comes from the scale.** 85 call sites had a hard-coded `borderRadius`
      across 14 values, ten of them off-scale. Most of the damage was `width / 2` written
      longhand — a 36×36 button at 18, a 28×28 tile at 14 — so a circle was a magic number
      sitting next to a card that was also `16` meaning something else. The lint rule is
      `hibbullah/radius-token`.
- [x] **Three palette tokens that changed nothing are gone.** `onStatus` was byte-identical
      to `textInverse` in both themes; `backgroundElevated` and `canvas` were identical to
      `backgroundAlt` and read by nothing. A token that never differs from another token is
      documentation of an intent nothing implements.

### One grid, and a form a shopkeeper can read without a glossary

"Two product cards per row on any phone, more as the screen grows" was stated once and
implemented seven times. The copy had already drifted: two screens capped the result at
three, three did not, the catalog and the search grid disagreed about tablets, and the
admin's own product list was one-up on the handset the owner was holding.

- [x] **The policy has one statement.** `useResponsive` held `COLUMNS = { xs: 1, sm: 1, ... }`
      and five screens copied `isMobile ? 1 : isTablet ? 2 : columns` over the top of it —
      the `xs: 1` is what made the catalog one-up on every phone, so the copies were working
      around the very thing they were supposed to read. It is now `PRODUCT_COLUMNS`
      (2 / 2 / 3 / 3 / 4 / 5) and `LIST_COLUMNS` (1 / 1 / 2 / 2 / 3 / 3), and all eight call
      sites read one or the other.
- [x] **Two intents, not one number, because two things are not the same shape.** A product
      card is a thumbnail, a name and a price, and two of those fit a 375px screen. An order
      row is a status, a date, an item count and a total, and at 170px it is the version of
      this that looks like a bug in a screenshot. A single `columns` would have forced the
      second to follow the first.
- [x] **The home page and favourites had their own copy of the same division.** Both
      computed `(width - spacing.lg * 2 - spacing.md) / 2` — the same expression, in two
      files, hard-wired to 2, so neither ever grew. The gutter now lives in the hook too.
- [x] **`contentWidth` and the old `cardWidth` were wrong, which is why nothing read them.**
      They subtracted the admin sidebar from the total, so they reported a 508px content
      area for a *customer* screen at 768px — one that has no sidebar at all. Two unused
      numbers sat in a hook long enough to be mistaken for a source of truth.
- [x] **The admin catalog's gutter was a percentage.** `flexBasis: "48%"` with no gap, so
      the space between two cards was 4% of whatever the column happened to be — about 12px
      at two columns and 8px at three. FlashList v2 has no `columnWrapperStyle`, so the
      customer grids' paired half-padding is used instead, at the same size.
- [x] **The catalog and search gave their cards 8px of screen edge where the home page
      gave the same card 16px.** The half-gutter pairing was right and the container's own
      share of it was one step too small: 4px on the container plus 4px on the cell, which
      is a uniform 8px gutter and a page margin half the rest of the app's. The container
      now carries `spacing.md`, so the two halves add up to `spacing.lg` and a search
      result sits exactly where the product it points at sits.
- [x] **The form no longer says "cost price", "original price" or "Batch · auto-handled".**
      Three section headings, seven labels, and every hint and error message were rewritten
      for the person entering the stock rather than the person reading the schema. The old
      "Advanced · batch & expiry" was not a small thing to fold away: expiry is what drives
      the expiry alerts, so it is named as a thing the shop fills in, not an implementation
      detail.
- [x] **A form that sells below cost says so, in the danger colour.** It rendered as a
      negative percentage under the word "margin". It is the single most expensive mistake
      this form allows, so it is now a sentence.

## 🔬 Verification still owed

- [ ] Seed ~4,000 products, then capture `explain (analyze, buffers)` for `browse_products` and `search_products` before/after. The indexes and the two-function split are designed for it, but the numbers have not been measured.
- [ ] If trigram similarity returns noise for 2–3 character terms, fall back to prefix-only ranking in `search_products` (the default 0.3 threshold should already suppress it — unverified).
- [ ] **Look at every screen in a real browser at 390 / 768 / 1440 px.** Never done. No
      desktop browser was attached during any of this work, so every UI change has been
      checked by types, lint, a clean web export and the database — and not once by a human
      eye. This is the largest gap in the project.
- [ ] Local `supabase db reset` sanity check (needs Docker). The migrations this session
      were applied to the hosted project over the Management API instead, so a cold start
      from the files is the one path never exercised.

## 🔜 Backlog ideas

- [ ] **Refine the dashboard's earning / sales / order / log cards** — the admin dashboard
      summary cards are the weakest part of the app.
- [ ] **The inter-card gutter is 8px in the FlashList grids and 12px in the FlatList ones.**
      Not an oversight: FlashList v2 has no `columnWrapperStyle`, so its grids can only
      express a gutter as half-padding on every cell, which costs 2× the cell padding and
      would need 6px to reach 12 — off the 4px rhythm the technique exists to keep. The page
      *margin* is now a uniform `spacing.lg` everywhere; the gutter difference is a
      property of the list library. Making it uniform means either a 4px rhythm that
      includes 6, or dropping FlashList for FlatList on the three multi-column grids.
- [ ] The admin catalog's page margin is `ResponsiveContainer`'s padding *plus* its own
      `paddingHorizontal`, so it sits 4px inside the admin screens that do not stack two
      containers. Only visible next to the other admin screens.
- [ ] Dedicated admin Categories & Manufacturers management screens (creation is inline in ProductForm and in the searchable pickers).
- [ ] First-run admin help banner for empty catalog
- [ ] Give each suite its own residue assertion in `clean-test-data.mjs`, so an interrupted
      run reports itself instead of waiting to be noticed.
