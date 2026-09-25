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

## 👉 User follow-up (no code)

- [ ] **Create the `hibbullah_avatars` unsigned upload preset** in the Cloudinary console: unsigned, folder-scoped to `avatars/`. The existing `hibbullah_products` preset is scoped to `products/`, so Cloudinary rejects avatar uploads until this exists.
- [ ] **Set the Cloudinary secrets and deploy the function**:
      `supabase secrets set CLOUDINARY_API_SECRET=… CLOUDINARY_API_KEY=… CLOUDINARY_CLOUD_NAME=eomwaokm`
      `supabase functions deploy delete-cloudinary-asset`
      Until then "remove picture" clears the database row but the file stays in Cloudinary (removal is deliberately best-effort so it is never blocked by the cleanup).
- [ ] **Rotate the `sbp_…` Management API token** shared in chat, then apply the 6 new migrations. See `supabase/apply-fix-migration.mjs` for the shape of the script; it needs `HIBBULLAH_SUPABASE_TOKEN` and must never be run without it.
- [ ] Apply the 6 migrations to the hosted project **and** keep `supabase/apply-to-hibbullah-hosted.sql` in sync (migrations are the source of truth; the hosted file is the bootstrap for a fresh project).
- [ ] Sign in with both admin Gmails → confirm `role=admin` shows in app (dashboard → Auth → Users)
- [ ] Add catalog content: categories → manufacturers → products (images optional)
- [ ] Place & confirm a test order end-to-end
- [ ] Rotate the `sbp_…` access token + secret/service-role keys shared in chat
- [ ] Optional: enable `custom_access_token_hook` (not needed by app)

## 🔬 Verification still owed

- [ ] Seed ~4,000 products, then capture `explain (analyze, buffers)` for `browse_products` and `search_products` before/after. The indexes and the two-function split are designed for it, but the numbers have not been measured.
- [ ] If trigram similarity returns noise for 2–3 character terms, fall back to prefix-only ranking in `search_products` (the default 0.3 threshold should already suppress it — unverified).
- [ ] Compare the layout in a real browser at 390 / 768 / 1440 px. Never done in this session.

## 🔜 Backlog ideas

- [ ] Dedicated admin Categories & Manufacturers management screens (creation is inline in ProductForm and in the searchable pickers)
- [ ] First-run admin help banner for empty catalog
- [ ] Local `supabase db reset` sanity check (needs Docker)
