# Hibbullah — Roadmap & Setup Status

> App identity: **Hibbullah** · Android package `com.hibbullah.app` · deep-link scheme `hibbullah://`
> Supabase project: `xkvjhvwrzfczymbgapip` (PostgreSQL 17) · Cloudinary: `eomwaokm` (preset `hibbullah_products`)
> Status: **schema applied & verified** · last updated 2026-09-25

## ✅ Done

- [x] **Database schema applied to the new project** — all **20 migrations** pushed via Management API (HTTP 201 each), plus `supabase_migrations.schema_migrations` tracking rows (so a future `supabase db push` is a no-op).
- [x] **Verified tables live** (REST returns `200 []`): `profiles`, `categories`, `manufacturers`, `products`, `cart_items`, `orders`, `order_items`, `addresses`, `favorites`, `notifications`, `audit_entries`, `inventory_items`, `stock_adjustments`, `return_requests`, `delivery_cycles`, `delivery_cycle_items`. (No `product_images` table exists by design — images are Cloudinary URLs in `products`.)
- [x] **Auth config set via API**: email confirm **OFF** (`mailer_autoconfirm`), redirect allow-list includes `hibbullah://**`, `hibbullah://auth-callback`, `hibbullah://reset-password`, `hibbullah://welcome`, `exp://**`.
- [x] **End-to-end backend test passed**: signup → instant session (no email confirm), `handle_new_user` trigger auto-created profile `role=customer`, `is_admin()` RPC works, public tables readable. Test user cleaned up afterwards.
- [x] **Cloudinary verified** (real unsigned upload → HTTP 200 + `secure_url`).
- [x] **App code clean**: `shadow*` → `boxShadow` migration (shadows.ts + 5 screens) — deprecation warning gone; cart/orders/products error handling shows real/friendly messages; console noise removed.
- [x] Full rebrand to Hibbullah (identity, deep links, logo, allowlist = exactly `icrmahin@gmail.com` + `hibbullah82026@gmail.com`, empty seed).

## 🔒 Security — rotate these

- The **Management API access token** (`sbp_…`) and the **secret / service-role keys** were pasted in chat. Rotate them after this session:
  - Dashboard → Project settings → API → **Reset keys** (secret/service-role).
  - Account settings → Access Tokens → **Revoke** the `sbp_…` token.

## 👉 Remaining (user actions, no code changes needed)

- [ ] Sign in with `icrmahin@gmail.com` **and** `hibbullah82026@gmail.com` in the app → each gets `role=admin` automatically (allowlist in `handle_new_user`).
- [ ] Add your first category → product (with and without an image) → check customer catalog.
- [ ] Place a test order (customer) → confirm (admin) → track delivery.
- [ ] Optional: enable `custom_access_token_hook` in Dashboard → Auth → Hooks. Not required — the app uses `is_admin()` DB RPC, not JWT claims.
- [ ] Optional: rename/verify project in dashboard; set a friendly project name.

## Verification commands (repo root)

```bash
npx tsc --noEmit                       # typecheck (0 errors)
npx eslint src                         # lint (0 errors; style warnings OK)
CI=1 npx expo export --platform web    # production bundle smoke test
```

See [`docs/TODO.md`](./TODO.md) for the granular checklist.