# Hibbullah — Roadmap & Setup Status

> App identity: **Hibbullah** · Android package `com.hibbullah.app` · deep-link scheme `hibbullah://`
> Supabase project: `xkvjhvwrzfczymbgapip` (PostgreSQL 17) · Cloudinary: `eomwaokm` (presets `hibbullah_products` for `products/`, `hibbullah_avatars` for `avatars/`)
> Status: **schema applied & verified** · last updated 2026-09-26

## ✅ Done

- [x] **Database schema applied to the new project** — all **20 migrations** pushed via Management API (HTTP 201 each), plus `supabase_migrations.schema_migrations` tracking rows (so a future `supabase db push` is a no-op).
- [x] **Verified tables live** (REST returns `200 []`): `profiles`, `categories`, `manufacturers`, `products`, `cart_items`, `orders`, `order_items`, `addresses`, `favorites`, `notifications`, `audit_entries`, `inventory_items`, `stock_adjustments`, `return_requests`, `delivery_cycles`, `delivery_cycle_items`. (No `product_images` table exists by design — images are Cloudinary URLs in `products`.)
- [x] **Auth config set via API**: email confirm **OFF** (`mailer_autoconfirm`), redirect allow-list includes `hibbullah://**`, `hibbullah://auth-callback`, `hibbullah://reset-password`, `hibbullah://welcome`, `exp://**`.
- [x] **End-to-end backend test passed**: signup → instant session (no email confirm), `handle_new_user` trigger auto-created profile `role=customer`, `is_admin()` RPC works, public tables readable. Test user cleaned up afterwards.
- [x] **Cloudinary verified** (real unsigned upload → HTTP 200 + `secure_url`).
- [x] **App code clean**: `shadow*` → `boxShadow` migration (shadows.ts + 5 screens) — deprecation warning gone; cart/orders/products error handling shows real/friendly messages; console noise removed.
- [x] Full rebrand to Hibbullah (identity, deep links, logo, allowlist = exactly `icrmahin@gmail.com` + `hibbullah82026@gmail.com`, empty seed).

### Profile, avatars, and a 4k-product catalog

Storage split, unchanged in spirit and now enforced in code: **every** product and profile *number and string* lives in Supabase; only image *bytes* live in Cloudinary. There is no migration button and no manual image-URL field — picking an image uploads it, at pick time, to a stable `public_id` derived from the row id (`products/<uuid>`, `avatars/<uid>`), so replacing a picture overwrites that exact asset instead of orphaning a new one.

- [x] **Phone is `+880` everywhere** — user and admin, stored canonically (`profiles_phone_format`) and displayed normalized. Pasting `+8801…`, `018…`, or `880…` all land as 10 editable digits behind a fixed `+880` prefix.
- [x] **One profile entry in Settings.** The name/email/avatar row opens the editor; the separate "Profile Details" row is gone, as are the two unreachable screens behind it.
- [x] **Real profile-picture upload** for user and admin, with the admin sidebar showing the uploaded picture rather than a typed initial.
- [x] **"Password & Security" is a real screen** — change password (current password verified) and "email me a reset link". It used to open the profile editor.
- [x] **Search is server-side and instant** on every surface: home overlay, search, products tab, category, manufacturer, admin catalog. One ranked Postgres RPC per term, 250 ms debounce, in-flight aborts, exact match totals. The home overlay used to filter only the 20 rows already on screen, so it could not match a 4,000-product catalog at all.
- [x] **Built for 4k+ products.** No screen maps over the catalog: every list is a FlashList with an explicit `drawDistance`, images mount lazily, browse pages by keyset cursor and search by offset, and a burst of realtime events coalesces into one refetch.
- [x] **Both product write-path bugs fixed** — create is one transaction (a failed inventory insert no longer leaves a product with stock 0), and edit is a partial update, so it no longer silently nulls `cost_price` / `original_price` / `discount_percent`.
- [x] **`EXPO_PUBLIC_CLOUDINARY_*` added to `eas.json`** for both build profiles. Without it, product image upload failed in *every* EAS build, because `EXPO_PUBLIC_` values are inlined at build time and a missing one is a runtime failure, not a build error.

## 🔒 Security — rotate these

- The **Management API access token** (`sbp_…`) and the **secret / service-role keys** were pasted in chat. Rotate them before applying the 6 new migrations:
  - Dashboard → Project settings → API → **Reset keys** (secret/service-role).
  - Account settings → Access Tokens → **Revoke** the `sbp_…` token.
- `CLOUDINARY_API_SECRET` is **never** in the app bundle. The client can upload with an unsigned preset but cannot `destroy`, so the `delete-cloudinary-asset` Edge Function is the only place the secret lives. It derives the public id from the verified uid (avatars) or from a product id the caller has been proven to be an admin for (products) — it never trusts a client-supplied path.

## 👉 Remaining (user actions, no code changes needed)

- [ ] **Create the `hibbullah_avatars` unsigned upload preset**, folder-scoped to `avatars/`. Reusing the product preset fails: Cloudinary rejects a folder outside the preset's allowed folders.
- [ ] `supabase secrets set CLOUDINARY_API_SECRET=… CLOUDINARY_API_KEY=… CLOUDINARY_CLOUD_NAME=eomwaokm` then `supabase functions deploy delete-cloudinary-asset`. Until then "remove picture" clears the database row but leaves the file in Cloudinary.
- [ ] **Apply the 6 new migrations** (`20260926100000`–`20260926150000`) to the hosted project, and keep `supabase/apply-to-hibbullah-hosted.sql` in sync — migrations are the source of truth, that file is the bootstrap for a fresh project.
- [ ] Sign in with `icrmahin@gmail.com` **and** `hibbullah82026@gmail.com` in the app → each gets `role=admin` automatically (allowlist in `handle_new_user`).
- [ ] Add your first category → product (with and without an image) → check customer catalog.
- [ ] Place a test order (customer) → confirm (admin) → track delivery.
- [ ] Seed ~4,000 products and confirm the catalog still scrolls and searches smoothly, and that `explain (analyze)` on `browse_products` / `search_products` stays index-only. Designed for it; not yet measured.
- [ ] Optional: enable `custom_access_token_hook` in Dashboard → Auth → Hooks. Not required — the app uses `is_admin()` DB RPC, not JWT claims.
- [ ] Optional: rename/verify project in dashboard; set a friendly project name.

## Verification commands (repo root)

```bash
npx tsc --noEmit                       # typecheck (0 errors)
npx eslint src                         # lint (0 errors; style warnings OK)
CI=1 npx expo export --platform web    # production bundle smoke test
```

See [`docs/TODO.md`](./TODO.md) for the granular checklist.