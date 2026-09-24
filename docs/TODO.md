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

## 👉 User follow-up (no code)

- [ ] Sign in with both admin Gmails → confirm `role=admin` shows in app (dashboard → Auth → Users)
- [ ] Add catalog content: categories → manufacturers → products (images optional)
- [ ] Place & confirm a test order end-to-end
- [ ] Rotate the `sbp_…` access token + secret/service-role keys shared in chat
- [ ] Optional: enable `custom_access_token_hook` (not needed by app)

## 🔜 Backlog ideas

- [ ] Cloudinary delete on product removal (Edge Function holding `CLOUDINARY_API_SECRET` — client can't delete)
- [ ] Dedicated admin Categories & Manufacturers management screens (currently inline-created in ProductForm)
- [ ] First-run admin help banner for empty catalog
- [ ] Local `supabase db reset` sanity check (needs Docker)