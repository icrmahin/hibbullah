# Hibbullah — Step 1: Auth + Architecture Audit Report

> **Scope:** Architecture audit only. No code was modified, no dependencies installed, no Supabase/DB/RLS/auth changes, no dashboard or mock data created, no redesign. Nothing pushed to GitHub.
>
> **Date:** 2026-09-16

---

## 1. App entry points

- **`package.json:3`** sets `"main": "expo-router/entry"` → Expo Router (file-system routing) is the app entry. App routes live in `src/app/` (a non-standard `src/` layout; `tsconfig.json:6` maps `@/*` → `./src/*`).
- **`src/app/_layout.tsx:7`** — root layout: `SafeAreaProvider → AppProviders → StatusBar → Stack`.
- **`src/app/index.tsx:5`** — root index is the **session gatekeeper**: `loading → spinner`, `!session → /(auth)/welcome`, otherwise `→ /(customer)/(tabs)`. **It always routes to the customer tabs regardless of role** (see §B discrepancy).

---

## 2. Supabase initialization

- **`src/lib/supabase.ts:14-21`** — single shared client from `@supabase/supabase-js`, anon key only, `SecureStore` storage adapter (native) / n/a (web), `persistSession`, `autoRefreshToken`, `detectSessionInUrl: false`. `getSupabase()` exported.
- Credentials come from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (`.env`; project ref `juelhrhywmaeksscghwo`, currently `EXPO_PUBLIC_USE_MOCK=true` set).
- **`src/lib/env.ts:4-8`** — `useMock` is `true` unless `EXPO_PUBLIC_USE_MOCK === "false"` **and** URL+key are present.

> ⚠️ **Finding:** The `useMock` flag exists but is **never consumed anywhere in the auth path** — the app still requires a real Supabase session even in mock mode.

---

## 3. Authentication flow

- **Google OAuth only.** `src/services/authService.ts:139-261` (`signInWithGoogle`) uses `expo-auth-session` + `WebBrowser`; manual `login`/`register` in `AuthProvider.tsx:199-210` throw `"Manual login is disabled."`
- **`src/providers/AuthProvider.tsx`** is the auth engine:
  - `init()` (`:108-151`): `supabase.auth.getSession()` on mount, then `verifyAdminStatus(email)` + `resolveAuthSession(session)` in parallel, saves to SecureStore via `src/lib/session.ts`, sets `session/user/isAdmin`.
  - `onAuthStateChange` listener (`:155-191`) re-runs the same resolution on login/logout.
  - `syncSession(sbSession)` (`:73-106`) same resolution (called by `welcome.tsx:36` after OAuth).
- **`resolveAuthSession`** (`authService.ts:12-111`) queries `profiles`, then resolves `role` via cascading fallbacks and **"Strict Role Override"** (`AuthProvider.tsx:94-97`): `role = isAdminUser ? "admin" : "customer"`, overwriting everything else.

---

## 4. Where the current user/session is retrieved

- `session`, `user`, `isAdmin`, `loading` all live in **`AuthProvider` context** (`AuthProvider.tsx:60-63`), exposed via `useAuth()` (`:256-262`).
- Re-exposed through `src/hooks/useAuth.ts` and `src/hooks/useUser.ts`.

---

## 5. Admin authorization / role checking

- **`verifyAdminStatus`** (`AuthProvider.tsx:34-57`): case-insensitive `ilike` query against `public.admin_users` — the **single source of truth** for admin. Returns `false` on any DB error.
- DB source: `supabase/migrations/20260914141707_remote_commit.sql:70-73,111` — `admin_users(id, email, created_at)` table with **SELECT policy for authenticated users**, RLS enabled.
- **Route guard** — `src/app/(admin)/_layout.tsx:6-14`: `loading → spinner`; `!isAdmin → Redirect /(customer)/account/profile`.
- **Conditional UI** — `(customer)/(tabs)/account.tsx:35-42` shows "Dashboard" when `isAdmin` (→ *customer* dashboard, not admin); `(customer)/account/profile.tsx:53-59` shows **"Go to Admin Panel" → `/(admin)`** when `isAdmin`.

---

## 6. Admin dashboard route/screen

- Route: `/(admin)` → **`src/app/(admin)/index.tsx:47`** (`AdminDashboardScreen`), under the `(admin)` guard.
- It renders KPI stat cards, operation shortcuts, recent orders — and **reads mock data directly** (`mockOrders`, `mockInventory` from `src/services/mockData.ts`), *not* `useAdmin`/`dashboardService` (both exist and are unused here).
- Full admin module already exists: products (+add/edit), inventory (+batches/expiry/adjustment), orders, customers, reports, returns, audit.

---

## 7. Customer ordering flow

1. **Browse** — `(customer)/(tabs)/index.tsx`, `products.tsx`, product detail `[productId].tsx` (cards → `useCart().addItem` → `cartService.addToCart`, in-memory `store.cartItems`).
2. **Cart** — `(customer)/(tabs)/cart.tsx` via `CartProvider` (`src/providers/CartProvider.tsx`).
3. **Checkout** — `src/app/(customer)/checkout.tsx:26-42` `handleSubmit` → `submitOrder(...)` (`src/services/orderService.ts:17-88`): builds `Order`, pushes to in-memory `store.orders`, creates/resets `deliveryCycle`, calls `clearCart()`.
4. **Follow-up** — `delivery-cycle.tsx`, `order/[orderId].tsx`, `(tabs)/orders.tsx` (via `useOrders` → `getOrders(session?.userId)`).

All mock/in-memory — **no Supabase table reads/writes** in the entire ordering path.

---

## 8. Product / medicine data model

- **Domain type** — `src/types/product.ts:1-20` (`id, name, brand, genericName, manufacturerId, categoryId, description, price, originalPrice, discountPercent, stock, unit, image, isActive, isFeatured, batchNumber, expiryDate, createdAt`).
- **DB schema** — `src/types/database.ts:37-57` `products`, plus `product_batches:77-89`, `categories`, `manufacturers`.

> ⚠️ **Finding — mismatch:** the DB `products` table has no `stock`/`image`/`batchNumber` (stock lives in `product_batches`), while the app domain type carries them. The mock domain model is ahead of the pushed schema. Fine for a mock-driven UI, but relevant when wiring the real backend.

---

## 9. Order data model

- **Domain** — `src/types/order.ts` (`Order`, `OrderItem`, `OrderStatus` = 7 states; `timeline` array).
- **DB** — `orders` + `order_items` (`database.ts:116-146`).

---

## 10. API / service / repository layer

Layered separation exists:

- **`src/services/*`** — `authService`, `productService`, `orderService`, `cartService`, `categoryService`, `manufacturerService`, `deliveryCycleService`, `notificationService`, `addressService`.
- **`src/services/admin/*`** — `dashboardService`, `orderManagementService`, `adminProductService`, `inventoryService`, `customerService`, `batchService`, `returnService`, `reportService`, `auditService`.
- **Single mock store** — `src/services/mockData.ts` (`store` + exported `mock*` arrays). All non-auth services are async reads/writes against this in-memory store with artificial latency (`src/lib/result.ts` `wait()`).
- **Hooks** (`src/hooks/*`) wrap services; screens consume hooks.

> ⚠️ **Finding — dead code:** the mock layer's contract is mirrored into `dashboardService`/`useAdmin`, but the admin dashboard screen bypasses them and reads mock arrays inline.

Supabase is only touched by: client init (`lib/supabase.ts`), auth (`authService`, `AuthProvider`), and storage (`lib/storage.ts`).

---

## 11. Styling system

- **`StyleSheet.create` + shared theme constants**, consistently:
  - `src/constants/colors.ts` (brand tokens, default export), `typography.ts`, `spacing.ts` (4–40 scale), `sizes.ts`, `config.ts` (business constants incl. `deliveryFee`, `lowStockThreshold`).
  - All screens/components import `colors/spacing/typography` — no CSS-Vars, no theme library, no styled-components/nativewind.
- Some legacy screens (e.g. `(tabs)/account.tsx`) hardcode hex values instead of tokens — known inconsistency.

---

## 12. Reusable components / icons

- **Shared** — `components/common/`: `Button`, `Input`, `Header`, `SearchBar`, `StatusBadge`, `EmptyState`, `ErrorState`, `LoadingState`, `Modal`, `FilterChip`, `AppLogo`, `CustomerNavigation`.
- **Domain** — `products/` (ProductCard, ProductImage, ProductPrice, DiscountBadge, ManufacturerCard, CategoryCard), `orders/` (OrderCard, OrderSummary, OrderStatus), `cart/` (CartItem, CartSummary, QuantitySelector), `admin/` (AdminHeader, AdminStatCard, AdminProductCard, AdminOrderCard, InventoryStatus).
- **Icons** — `expo-symbols` `SymbolView` with cross-platform name objects `{ios, android, web}` (the established icon convention).

---

## 13. Files that must NOT be modified (backend/auth infrastructure)

| File | Reason |
|---|---|
| `src/lib/supabase.ts` | Supabase client init |
| `src/services/authService.ts` | OAuth + session resolution |
| `src/lib/session.ts` | Session persistence (SecureStore/localStorage) |
| `src/lib/storage.ts` | Supabase Storage |
| `src/types/database.ts` | Generated schema types (regenerated via `supabase gen types`) |
| `src/providers/AuthProvider.tsx` | Auth engine (see §F caveat) |
| `supabase/migrations/*` | DB schema + RLS policies |
| `.env` | Credentials/config |
| `app.json`, `eas.json`, `package.json` | Build/Expo config |

---

## A. Current authentication flow

```
Welcome → Google OAuth (authService.signInWithGoogle)
       → syncSession → resolveAuthSession (profiles query + role fallbacks)
       → Strict Role Override (admin_users membership)
       → save to SecureStore → set session/user/isAdmin
       → index.tsx gatekeeper → (customer) tabs
```

Two layers gate access: **(1)** a real Supabase session must exist (`index.tsx` requires `session`), **(2)** admin requires the Google email to match a row in `admin_users` (`verifyAdminStatus`).

---

## B. Current admin authorization flow

`verifyAdminStatus(email)` → `admin_users` `ilike` query → `isAdmin` boolean → `(admin)/_layout.tsx` guard (`!isAdmin → /(customer)/account/profile`) + conditional UI (`profile.tsx` "Go to Admin Panel"; `account.tsx` "Dashboard").

**Discrepancies found:**
- `src/app/index.tsx:9` **always redirects to customer tabs, even for admins** — `auth-redirection.md` claims `admin → /(admin)`, but that branch is not implemented. Admins reach the panel only via `profile.tsx:56`.
- `account.tsx:38` admin "Dashboard" navigates to the **customer** account dashboard, not `/(admin)`.

---

## C. Current customer → order flow

`Browse → addToCart (CartProvider/cartService → in-memory store)` → `/(customer)/checkout` → `submitOrder (orderService)` → Order created in store + deliveryCycle reset + cart cleared → `delivery-cycle` / `order` detail screens. Entirely mock/in-memory.

---

## D. Current product/data flow

Screens → hooks (`useProducts`, `useOrders`, `useCart`, …) → services → in-memory `store` in `mockData.ts` → domain types (`types/product.ts`, `types/order.ts`, …). Admin screens read the same `store` (via `admin/*` services or directly). **No DB reads for products/orders**; Supabase is only in the auth + storage layer.

---

## E. Relevant files and their responsibilities

| File | Responsibility |
|---|---|
| `src/app/_layout.tsx` | Root shell + provider mount |
| `src/app/index.tsx` | Session gatekeeper (currently customer-always) |
| `src/providers/AppProviders.tsx` | Provider composition (Auth → Cart) |
| `src/providers/AuthProvider.tsx` | Auth engine: hydrate, verify, listen, sign in/out |
| `src/providers/CartProvider.tsx` | Cart state + service facade |
| `src/services/authService.ts` | OAuth, `resolveAuthSession`, `getUserById` |
| `src/lib/{supabase,session,env,storage,result}.ts` | Infra: client, persistence, config, storage, helpers |
| `src/app/(admin)/_layout.tsx` | Admin route guard |
| `src/app/(admin)/index.tsx` | Dashboard screen (mock data, bypasses service) |
| `src/services/mockData.ts` | Single in-memory datastore + domain mocks |
| `src/services/admin/*` | Admin service layer (largely unused by dashboard) |
| `src/hooks/useAdmin.ts` | Admin dashboard hook (unused by `(admin)/index.tsx`) |
| `src/app/(customer)/account/profile.tsx` | Only working entry to the admin panel |

---

## F. Safest place to introduce a dev-only mock admin session

The blocker is **`AuthProvider`'s hydration path**: `init()`, `syncSession()`, and the `onAuthStateChange` handler all require a real Supabase session and a real `admin_users` match. Mock mode (`EXPO_PUBLIC_USE_MOCK=true`) is already configured but **never consulted** in that path — that is the intended seam.

**Recommended (dev-only):** inside `AuthProvider`'s session resolution (`init()`/`syncSession()`/listener), guarded by `env.useMock === true`: when there is no real Supabase session, synthesize the existing mock admin (`store.users[1]` = admin-001 / Dr. Yusuf Ali, `src/services/mockData.ts:186-192`) into `session`/`user`/`isAdmin=true`, skipping `verifyAdminStatus` + `resolveAuthSession`. Real-auth behavior stays intact whenever `USE_MOCK !== "true"`.

**Alternative (zero code, requires Google auth to actually work):** insert the dev Google email into `admin_users` directly in Supabase — the intended admin path by design, no RLS/schema change, but does not solve the "no session" problem in Expo Go.

---

## G. Minimal implementation plan (next step)

1. **Mock branch in `AuthProvider`** — the one auth file to touch, gated by the existing `env.useMock` flag: synthesize session + user + `isAdmin=true` from `mockAdmin` when no Supabase session exists; untouched otherwise.
2. **Restore documented role routing** in `src/app/index.tsx` — `session.role === "admin" ? /(admin) : /(customer)/(tabs)` so the dev flow lands directly on the admin dashboard.
3. **Wire `(admin)/index.tsx` to `useAdmin()`/`dashboardService()`** instead of inline mock reads — keeps data flowing through the service layer.

**Scope for step 2:** no Supabase changes, no RLS changes, no dependency installs, no new screens/mock data, no redesign.