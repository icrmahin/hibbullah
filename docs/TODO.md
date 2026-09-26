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
      of `supabase/migrations/` and reports `IN SYNC` across 36.
- [x] **Catalog content exists** — one category, one manufacturer, one product
      (`Napa 500 mg Tablet`).
- [x] **An order was placed and driven to `DELIVERED` end to end** by
      `npm run verify:lifecycle` (57 checks: address → cart → `create_order` → status
      transitions → FIFO stock deduction → notifications). Proven by script, not by a
      person tapping the app — see the browser item below.
- [x] `custom_access_token_hook` — deliberately not enabled; the app does not need it.

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
- [ ] **Fix the card layout** — card sizing and gutters are inconsistent between the admin
      and customer surfaces.
- [ ] Dedicated admin Categories & Manufacturers management screens (creation is inline in ProductForm and in the searchable pickers).
- [ ] First-run admin help banner for empty catalog
- [ ] Give each suite its own residue assertion in `clean-test-data.mjs`, so an interrupted
      run reports itself instead of waiting to be noticed.
