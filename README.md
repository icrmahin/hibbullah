<p align="center">
  <img src="./assets/images/logo/hibbullah-main.png" alt="Hibbullah logo" width="120" />
</p>

# Hibbullah

A production-grade, cross-platform **pharmacy / medicine delivery app** built with
**Expo (React Native)**, **Expo Router**, **Supabase (PostgreSQL 17)** and
**Cloudinary**.

Hibbullah ships a complete customer storefront and a full operations back office in one
codebase:

- customers browse the catalogue, search, favourite, build a cart, check out with cash on
  delivery, track orders, request returns and manage their profile;
- admins manage the catalogue, inventory batches and expiry, orders, returns, customers,
  home-screen advertisements, sales/inventory reports, profit and an audit log.

It is Android-first (EAS production APK, arm64-v8a only), supports light/dark themes and
responsive phone/tablet/desktop layouts, and delivers JavaScript changes over the air with
Expo Updates.

> **Status:** the schema is applied and verified against the hosted Supabase project;
> the app is buildable and shippable. See [Roadmap](#roadmap-and-planned-work) for the
> remaining owner actions and planned features.

---

## Table of contents

1. [Product overview](#product-overview)
2. [Feature matrix](#feature-matrix)
3. [Tech stack](#tech-stack)
4. [Architecture](#architecture)
5. [Repository structure](#repository-structure)
6. [Route map](#route-map)
7. [Data model](#data-model)
8. [Backend: Supabase](#backend-supabase)
9. [Auth, roles and access control](#auth-roles-and-access-control)
10. [Media: Cloudinary](#media-cloudinary)
11. [Notifications and realtime](#notifications-and-realtime)
12. [Design system](#design-system)
13. [Getting started](#getting-started)
14. [Environment variables](#environment-variables)
15. [Database workflow](#database-workflow)
16. [Scripts reference](#scripts-reference)
17. [Verification and quality gates](#verification-and-quality-gates)
18. [Building and releasing](#building-and-releasing)
19. [Engineering conventions](#engineering-conventions)
20. [Troubleshooting](#troubleshooting)
21. [Roadmap and planned work](#roadmap-and-planned-work)
22. [License and contact](#license-and-contact)

---

## Product overview

Hibbullah is a single-vendor medicine shop. A customer signs in, discovers medicines by
category, search, featured/discount/new collections or admin-managed banners, and places a
**cash-on-delivery** order against a saved delivery address. The backend snapshots prices
per order line, deducts stock from inventory batches FIFO-style, and moves the order through
a fixed status pipeline. Admins work from a separate dashboard over the same data, with
server-side aggregates rather than client-side number crunching.

Core domain rules baked into the product:

| Rule               | Detail                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Currency           | Bangladeshi Taka (BDT), displayed with `৳`                                                                                                     |
| Delivery           | Flat **৳80**, **Dhaka only** for now (the two-tier district model is retained server-side so it can return without restructuring)              |
| Payment            | **Cash on delivery** only                                                                                                                      |
| Order lifecycle    | `PENDING → CONFIRMED → PROCESSING → OUT_FOR_DELIVERY → DELIVERED`, plus `CANCELLED` and `RETURNED`                                             |
| Returns            | Customer requests a return per order line; admin moves it `APPROVED / REJECTED / PROCESSED`; approved returns restore stock and reverse profit |
| Inventory          | Stock is tracked in **batches** (`inventory_items`) with expiry dates, low-stock and out-of-stock states, and auditable `stock_adjustments`    |
| Delivery cycle     | An optional **24-hour grouping window** a customer can start to batch pending orders for one delivery run                                      |
| Order numbers      | Generated server-side, short batch numbers supported                                                                                           |
| Pricing            | `price`, `originalPrice`, `discountPercent`, `costPrice`; profit is computed from delivered sales minus approved returns, never guessed        |
| Product visibility | Soft-delete / `isActive` flag so off-shelf items never surface; `isFeatured` drives the "Trending" rail                                        |

The app is deliberately **server-first**: search, browsing, dashboard aggregates, reports,
order creation and stock movement are Postgres functions/RPCs. The client never reads the
whole catalogue to do arithmetic, and the only data stored outside Supabase is image bytes
(Cloudinary).

---

## Feature matrix

### Customer app

| Area           | Capabilities                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Onboarding     | Welcome screen, login, register, forgot password, reset-password deep link, auth callback                                      |
| Home           | Search entry point, admin advertisement carousel, category rail, All / Trending / Discount / New collections, product grid     |
| Catalogue      | Paginated products, category browse, category list, product detail (price, discount, stock, expiry, images, quantity selector) |
| Search         | Dedicated search screen with debounced server-side ranked search, category filtering, empty/error states                       |
| Cart           | Add/update/remove, quantity selector, summary, stock-aware checkout entry                                                      |
| Checkout       | Address picker, add/edit address, order note, flat delivery fee, cash-on-delivery confirmation, success state                  |
| Orders         | Order list, order detail with status timeline, reorder-friendly product rows, per-line return requests                         |
| Favourites     | Local-first favourites that sync to the account once signed in                                                                 |
| Delivery cycle | Start/track a 24-hour order grouping cycle with estimated total and pending orders in the window                               |
| Account        | Profile + avatar upload, password & security (change password, reset link), addresses, notifications, dark mode                |
| Support        | Help & FAQ, contact us, about, terms & privacy                                                                                 |
| Notifications  | In-app notification centre (realtime, unread badge) plus device push notifications for order/return status                     |
| Updates        | Silent OTA download with an in-app "update ready" banner; applies on next launch                                               |

### Admin / operations app

| Area           | Capabilities                                                                                                                                                                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard      | 30-day sales quantity, revenue, gross/net earning, returned profit, unpriced-item caveats, 7-day sales & earning sparklines, pending/processing orders, active products, low-stock, orders needing attention, pending returns, low-stock and expiring batches, recent orders |
| Products       | Paginated/searchable catalogue, category filter, create product (atomic transaction), edit, activate/deactivate, soft-delete, image upload                                                                                                                                   |
| Inventory      | Batch list, low-stock / out-of-stock / expiry monitoring, stock adjustment (increase/decrease with reason)                                                                                                                                                                   |
| Orders         | Filterable order queue, order detail, status transitions, customer/address/note visibility                                                                                                                                                                                   |
| Customers      | Searchable customer records, per-customer spend/stats, block/unblock                                                                                                                                                                                                         |
| Returns        | Return queue and per-return approve/reject/process actions                                                                                                                                                                                                                   |
| Reports        | High-level performance, sales report, inventory report (single `get_reports` RPC)                                                                                                                                                                                            |
| Advertisements | Create/edit/pause/delete home banners with scheduling                                                                                                                                                                                                                        |
| Audit log      | Recent operational activity with clear-log guard                                                                                                                                                                                                                             |
| Navigation     | Responsive bottom nav on phones, sidebar on desktop, "Back to shop"                                                                                                                                                                                                          |

---

## Tech stack

| Layer         | Choice                                                        | Notes                                                                         |
| ------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Runtime       | **Expo SDK 57** (`~57.0.22`)                                  | Managed workflow, config plugins, typed routes, React Compiler enabled        |
| UI            | **React Native 0.86.3**, **React 19.2.3**                     | New Architecture; `react-native-reanimated`, gesture handler, screens, SVG    |
| Routing       | **Expo Router ~57** (`expo-router/entry`)                     | File-based routes with route groups, typed routes                             |
| Language      | **TypeScript 6** (`strict`)                                   | Path aliases `@/* → ./src/*`, `@/assets/* → ./assets/*`                       |
| Backend       | **Supabase** (`@supabase/supabase-js`)                        | Postgres 17, Auth, Realtime, Storage, Edge Functions                          |
| Database      | PostgreSQL with RLS, SECURITY DEFINER RPCs, triggers          | 55 migrations under `supabase/migrations/`                                    |
| Images        | **Cloudinary**                                                | Unsigned upload presets for products/avatars, signed delete via Edge Function |
| Lists         | **@shopify/flash-list 2**                                     | Explicit draw distance, lazy images, keyset pagination                        |
| Fonts         | **Sora** + **Plus Jakarta Sans**                              | Google Fonts via `@expo-google-fonts/*`                                       |
| Icons         | **lucide-react-native**, `@expo/vector-icons`, `expo-symbols` |                                                                               |
| Animation     | **react-native-reanimated 4**                                 | Restrained press/page motion, reduced-motion aware                            |
| Local storage | **AsyncStorage**                                              | Session fallback, theme, local favourites                                     |
| Notifications | **expo-notifications** + Supabase Realtime                    | Push tokens stored in `push_tokens`                                           |
| OTA           | **expo-updates**                                              | Fingerprint runtime version, production channel                               |
| Build/release | **EAS CLI / EAS Build**                                       | Profiles in `eas.json`                                                        |
| Lint          | **ESLint 9** + `eslint-config-expo`                           | Custom `hibbullah/radius-token` rule                                          |
| Verification  | Node `.mjs` scripts                                           | SQL sync, route sync, UI contracts, lifecycle, security, device runtime       |

---

## Architecture

### High-level data flow

```
┌─────────────────────────────── Expo app ───────────────────────────────┐
│                                                                         │
│  src/app/*  (routes / screens)                                          │
│      │                                                                  │
│      ├── src/components/*   presentation primitives                     │
│      ├── src/hooks/*        stateful data access + realtime             │
│      └── src/providers/*    Auth · Cart · Favorites · Theme             │
│                    │                                                    │
│                    └──────────────► src/services/*  (typed API layer)   │
│                                          │                              │
│                                          ├──► Supabase JS client       │
│                                          │      ├── Postgres + RLS     │
│                                          │      ├── RPCs              │
│                                          │      ├── Realtime          │
│                                          │      └── Auth              │
│                                          └──► Cloudinary (image bytes)│
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                    │
                    └──► Supabase Edge Function: delete-cloudinary-asset
                         (the only place CLOUDINARY_API_SECRET lives)
```

### Layering rules

- **Screens** (`src/app`) compose; they never talk to Supabase directly. They call hooks.
- **Hooks** (`src/hooks`) own loading/error/refresh state and realtime subscriptions.
- **Services** (`src/services`) are the only place SQL/RPC names, row mappers and
  `ServiceResult`/`AppError` handling live.
- **Types** (`src/types`) describe the domain (`Order`, `Product`, `Address`, …).
- **Lib** (`src/lib`) holds cross-cutting concerns: Supabase client, error mapping, result
  helpers, row mappers, motion, push-notification plumbing.
- **Providers** (`src/providers`) hold app-wide state: auth/session/role, cart, favourites,
  theme, and wrap the tree in `AppProviders`.
- **Constants** (`src/constants`) are the single source of design tokens and business
  config (currency, delivery fee, thresholds).
- Components are split into `common/` (design-system primitives), and feature folders
  (`admin/`, `auth/`, `cart/`, `orders/`, `products/`, `advertisements/`).

### Error and result handling

- `src/lib/errors.ts` normalises Supabase/Postgres/network failures into `AppError` with a
  user-friendly message.
- Writes that must affect a row use `src/lib/requireAffected.ts` so a silent no-op is
  surfaced instead of pretending success.
- Every data screen has explicit **loading / error / empty** branches, and mutations show
  inline action errors.

### Performance posture

- **Server-side search/browse**: `browse_products` (keyset cursor) and `search_products`
  (ranked, offset) RPCs; 250 ms debounce, in-flight aborts.
- **FlashList everywhere**: no screen maps over the full catalogue; explicit
  `drawDistance`; images mount lazily.
- **Realtime coalescing**: bursts of changes collapse into one refetch.
- **Server aggregates**: dashboard and reports use `get_admin_dashboard_sales` and
  `get_reports`, not client-side reductions, so cost does not scale with the catalogue.
- **Explicit column lists**: `PRODUCT_PUBLIC_COLUMNS` avoids `select *`, which would fail
  after `cost_price` was revoked at the column level.

---

## Repository structure

```
.
├── app.json                  Expo config (name, scheme, icons, plugins, updates)
├── eas.json                  EAS build profiles + public env values
├── tsconfig.json             strict TS, path aliases
├── eslint.config.js          Expo config + custom radius-token rule
├── plugins/
│   └── with-arm64-only.js    Restrict production APK to arm64-v8a
├── assets/                   Logos, splash, images
├── docs/
│   ├── DESIGN-SYSTEM.md      UI contract every screen follows
│   ├── ROADMAP.md            Setup status / owner actions
│   └── TODO.md               Short product TODOs
├── scripts/
│   ├── verify-routes.mjs     Route ↔ screen consistency
│   ├── verify-contrast.mjs   Colour contrast checks
│   └── reset-project.js      Expo template helper
├── src/
│   ├── app/                  Expo Router routes (see route map)
│   ├── components/           UI primitives + feature components
│   ├── constants/            colors, darkColors, typography, spacing, sizes, config, districts, limits
│   ├── hooks/                data + UI hooks
│   ├── lib/                  supabase client, errors, mappers, notifications, motion
│   ├── providers/            AuthProvider, CartProvider, FavoritesProvider, ThemeProvider
│   ├── services/             typed data-access layer
│   ├── types/                domain types
│   └── utils/                currency, date, validation, phone, navigation, etc.
├── supabase/
│   ├── config.toml           local Supabase config (auth, realtime, edge runtime)
│   ├── migrations/           55 ordered SQL migrations (source of truth)
│   ├── functions/
│   │   └── delete-cloudinary-asset/   Deno Edge Function (signed image delete)
│   ├── lib/                  admin allowlist helper + tests
│   ├── sql/                  optional reference-data seed (categories/manufacturers)
│   ├── seed.sql              empty deterministic local seed
│   ├── apply-new-migrations.mjs
│   ├── verify-*.mjs          feature/integration verifiers
│   ├── mutation-test-*.mjs   guard tests that prove verifiers can fail
│   └── clean-test-data.mjs   removes test data
└── dist/                     generated web export output
```

---

## Route map

Expo Router groups are expressed as folders. The root index redirects based on session.

```
src/app/
├── _layout.tsx                     Root stack, fonts, providers, status bar, push + OTA hosts
├── index.tsx                       Session-aware redirect (welcome vs customer shop)
├── auth-callback.tsx               Deep-link auth completion (recovery / sign-in)
│
├── (auth)/
│   ├── welcome.tsx                 Landing / get started
│   ├── login.tsx                   Sign in
│   ├── register.tsx                Create account
│   ├── forgot-password.tsx         Email reset link
│   └── reset-password.tsx          Set a new password from the link
│
├── (customer)/
│   ├── (tabs)/
│   │   ├── index.tsx               Home / discovery
│   │   ├── products.tsx            Catalogue
│   │   ├── cart.tsx                Cart
│   │   ├── favorites.tsx           Favourites
│   │   ├── orders.tsx              Order history
│   │   └── account.tsx             Settings hub
│   ├── search.tsx                  Search results
│   ├── checkout.tsx                Checkout
│   ├── delivery-cycle.tsx          24-hour delivery cycle
│   ├── products/
│   │   ├── categories.tsx          All categories
│   │   ├── category/[categoryId].tsx
│   │   └── [productId].tsx         Product detail
│   ├── order/[orderId].tsx         Order detail + return requests
│   ├── account/
│   │   ├── profile.tsx             Name / phone / avatar
│   │   ├── addresses.tsx           Address list
│   │   ├── security.tsx            Password & security
│   │   ├── notifications.tsx       In-app notifications
│   │   ├── help.tsx                Help & FAQ
│   │   ├── contact.tsx             Contact us
│   │   ├── about.tsx               About
│   │   └── terms.tsx               Terms & privacy
│   └── address/edit.tsx            Add / edit address
│
└── (admin)/                        Guarded: session + isAdmin
    ├── index.tsx                   Dashboard
    ├── products/
    │   ├── index.tsx               Catalogue management
    │   ├── add.tsx                 Create product
    │   └── [productId]/
    │       ├── index.tsx           Product detail
    │       └── edit.tsx            Edit product
    ├── inventory/
    │   ├── index.tsx               Stock overview
    │   ├── batches.tsx             Batch list
    │   ├── expiry.tsx              Expiring batches
    │   └── adjustment.tsx          Stock adjustment
    ├── orders/
    │   ├── index.tsx               Order queue
    │   └── [orderId].tsx           Order detail + status actions
    ├── customers/
    │   ├── index.tsx               Customer list
    │   └── [customerId].tsx        Customer overview
    ├── returns/
    │   ├── index.tsx               Return queue
    │   └── [returnId].tsx          Return decision
    ├── reports/
    │   ├── index.tsx               Reports overview
    │   ├── sales.tsx               Sales report
    │   └── inventory.tsx           Inventory report
    ├── advertisements/
    │   ├── index.tsx               Banner list
    │   ├── add.tsx                 Create banner
    │   └── [adId].tsx              Edit banner
    └── audit/index.tsx             Audit log
```

Navigation is responsive: phones get a bottom island/bar (`CustomerNavigation`,
`AdminNavigation`); tablets/desktop get `CustomerDesktopHeader` or `AdminSidebar`.

---

## Data model

All domain data lives in Supabase. Prices, names, statuses, counts and relationships are
stored in Postgres; only image **bytes** live in Cloudinary.

### Core tables

| Table                    | Purpose                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`               | One row per auth user: name, email, phone (canonical `+880`), avatar URL, role (`customer` / `admin`), block state                             |
| `categories`             | Product categories with slug + optional icon                                                                                                   |
| `products`               | Catalogue row: name, description, company/brand (`company_name`), category, prices, discount, image URL, featured/active flags, stock snapshot |
| `inventory_items`        | Physical batches per product: batch number, quantity, expiry date, derived status                                                              |
| `stock_adjustments`      | Auditable increase/decrease records with reason and actor                                                                                      |
| `cart_items`             | Per-user cart rows                                                                                                                             |
| `orders`                 | Order header: number, customer, status, subtotal, discount, delivery fee, total, address snapshot, note                                        |
| `order_items`            | Immutable price snapshot per order line                                                                                                        |
| `order_item_allocations` | FIFO batch allocation used to deduct/restore stock                                                                                             |
| `addresses`              | Saved delivery addresses, default flag                                                                                                         |
| `favorites`              | Account-level favourites                                                                                                                       |
| `notifications`          | In-app notifications, capped per user, created by triggers                                                                                     |
| `push_tokens`            | Device push tokens per user                                                                                                                    |
| `return_requests`        | Per-line return requests and decisions                                                                                                         |
| `delivery_cycles`        | 24-hour delivery grouping window                                                                                                               |
| `delivery_cycle_items`   | Products in a delivery cycle                                                                                                                   |
| `advertisements`         | Home banners with schedule/active state                                                                                                        |
| `audit_entries`          | Operational audit trail                                                                                                                        |

### Key server functions / RPCs

| RPC                                                            | Purpose                                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `browse_products`                                              | Keyset-paginated catalogue browse with filters                               |
| `search_products`                                              | Ranked, trigram-backed product search                                        |
| `create_product`                                               | Atomic product + inventory creation                                          |
| `create_order`                                                 | Validates ownership/address, snapshots lines, deducts stock, appends pending |
| `transition_order_status`                                      | Guarded status changes, restock on cancel/return                             |
| `get_admin_dashboard_sales`                                    | 30-day sales/profit/return aggregates + trend series                         |
| `get_reports`                                                  | Sales and inventory report totals                                            |
| `get_customers_with_stats` / `get_customer_stats`              | Customer list and spend/stat rollups                                         |
| `apply_stock_adjustment`                                       | Audited stock movement                                                       |
| `approve_return_stock`                                         | Restocks approved returns                                                    |
| `deduct_inventory_fifo` / `sync_product_stock`                 | Inventory consistency                                                        |
| `generate_order_number` / `generate_batch_number`              | Human-readable identifiers                                                   |
| `is_admin` / `is_admin_email`                                  | Role checks (single allowlist source)                                        |
| `notify_user` / `notify_order_status` / `notify_return_status` | Notification creation                                                        |
| `push_notification_to_devices`                                 | Device push dispatch                                                         |
| `sync_delivery_cycle_total`                                    | Keeps cycle estimate current                                                 |

> `supabase/migrations/` is the source of truth. `supabase/apply-to-hibbullah-hosted.sql`
> is a bootstrap bundle for a fresh hosted project and must be kept in sync via
> `npm run verify:sql-sync`.

---

## Backend: Supabase

### Project layout

- **Hosted project:** PostgreSQL 17, Auth, Realtime, Edge Functions.
- **Local config:** `supabase/config.toml` (API :54321, DB :54322, Studio :54323,
  email confirmation **off**, redirect allow-list includes `hibbullah://**` and `exp://**`).
- **Migrations:** 55 ordered SQL files under `supabase/migrations/`.
- **Seed:** `supabase/seed.sql` is intentionally empty; categories/manufacturers/products
  are created from the admin UI. `supabase/sql/seed-categories-manufacturers.sql` is an
  optional, guarded bulk reference-data helper (not a migration).
- **Edge Function:** `delete-cloudinary-asset` — the only place the Cloudinary API secret
  lives. It derives asset public IDs from the verified user or a proven admin action; it
  never trusts a client-supplied path.

### Migrations (chronological themes)

| Range                     | Theme                                                                                                                                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260918010000`          | Initial schema                                                                                                                                                                                                                                                   |
| `…02` – `…06`             | Admin RLS, stock/storage, cart/discount, expiry/concurrency, auth hardening                                                                                                                                                                                      |
| `…07` – `…09`             | Production e-commerce rules, BD phone normalisation + seed, admin parity                                                                                                                                                                                         |
| `…10` – `…11`             | Favourites, cost price                                                                                                                                                                                                                                           |
| `20260922*`               | Storage buckets, dashboard aggregates, delivery cycle items, notifications realtime, audit triggers, customer stats, pending order append, stock auto-deactivate                                                                                                 |
| `20260923*` – `20260927*` | Order/inventory sync, E.164 phones, avatars, search indexes + browse/search RPCs, atomic product create, unique manufacturer, profile backfill, notification/audit limits, order address guard, admin allowlist + return RLS, third admin, district delivery fee |
| `20260928*` – `20260930*` | SECURITY DEFINER grants/guards, reports + customer spend, real profit + stock restore, search by brand/manufacturer                                                                                                                                              |
| `20261003*` – `20261006*` | Simple address + order note, push notifications, product soft delete, flat delivery fee, discount cap, short batch numbers, advertisements, security hardening, explicit search columns, customer block, optional product fields                                 |
| `20261011*`               | `company_name` merge (brand + manufacturer), audit log clearing/guard                                                                                                                                                                                            |

### Security posture

- **Row Level Security** on customer-owned data (orders, addresses, cart, favourites,
  notifications, returns, cycles).
- **SECURITY DEFINER** functions for trusted aggregates and stock movement, with explicit
  grants and guards.
- `cost_price` is **revoked at the column level** for anon/authenticated; all product
  reads use explicit column lists.
- Customer blocking is enforced server-side (`is_blocked`), not just in the UI.
- Admin allowlist is stored **only** in `public.is_admin_email()`; `handle_new_user`,
  `is_admin`, the JWT hook and order transitions all delegate to it.
- Audit log trimming and a clear-log guard prevent accidental history loss.
- The Cloudinary secret never ships in the app bundle.

---

## Auth, roles and access control

### Flow

1. `src/app/index.tsx` waits for `AuthProvider` to resolve the session.
2. No session → `/(auth)/welcome`; session → `/(customer)/(tabs)`.
3. Email confirmation is disabled for instant signup; passwords are checked against the
   current credential before change using a **throwaway Supabase client**
   (`createCredentialCheckClient`) so the real session is untouched.
4. Email reset links land on `auth-callback.tsx`, which routes recovery links to
   `/(auth)/reset-password` and normal sign-ins to the app.
5. `AuthProvider` exposes `session`, `user`, `isAdmin`, `loading`; `useAuth()` is the only
   way screens read it.

### Roles

| Role       | Access                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `customer` | Storefront only. `(admin)` redirects to the shop.                                                                                             |
| `admin`    | Storefront **and** `(admin)`. The shop remains the default landing; the admin area is reachable from Settings → Admin and the desktop header. |

Admins are promoted automatically at signup when their email is in the server-side
allowlist. Adding an admin is a one-line migration (see
`20260927030000_add_third_admin.sql`).

---

## Media: Cloudinary

Hibbullah uses Cloudinary for image bytes only.

- **Products:** upload preset `hibbullah_products`, folder `products/`,
  deterministic public ID `products/<product-uuid>`.
- **Avatars:** upload preset `hibbullah_avatars`, folder `avatars/`,
  deterministic public ID `avatars/<user-id>`.
- Replacing an image overwrites the same asset instead of orphaning a new one.
- The client uses **unsigned** upload presets; it cannot destroy assets.
- Deletion goes through the `delete-cloudinary-asset` Edge Function, which holds
  `CLOUDINARY_API_SECRET` and verifies the caller before deleting.

Public env values are inlined at build time by Expo. They are also present in `eas.json`
for both build profiles, because a missing `EXPO_PUBLIC_*` value is a runtime failure, not a
build error.

---

## Notifications and realtime

- **In-app notifications** are rows in `notifications`, created by database triggers when
  an order or return changes status. The client never inserts them, so every row describes
  something that actually happened. Reads are capped and trimmed by the database.
- **Realtime**: `useNotifications` subscribes to `postgres_changes` filtered by `user_id`
  and refetches with request-sequence guards so stale reads cannot overwrite newer state.
- **Push**: `usePushNotifications` registers the device, stores tokens in `push_tokens`,
  and routes a notification tap into the app. Dispatch happens server-side:
  `push_notification_to_devices` forwards each new notification to the user's registered
  Expo push tokens via `pg_net`.
- **OTA updates**: `useAppUpdates` checks in the background after startup and on foreground
  return after 6+ hours, downloads silently, and shows `UpdateBanner`. It never calls
  `reloadAsync()` mid-session; the update applies on the next cold start.

---

## Design system

The contract every screen follows lives in **[`docs/DESIGN-SYSTEM.md`](./docs/DESIGN-SYSTEM.md)**.
Key rules:

- **One screen skeleton**: `<Screen header={<ScreenHeader … />}>` with `useBottomInset()`
  for scroll padding. Never double-apply the safe-area top inset.
- **One header**: `ScreenHeader` only. No floating islands, oversized titles or secondary
  header components.
- **One card vocabulary**: white card on an off-white page, no border, no shadow, one card
  level deep.
- **One type scale**: Sora for headings, Plus Jakarta Sans for body/data. Always use
  `fontFamily`, never `fontWeight`; always `fontSize.*`, never a bare number.
- **Flat UI**: `radius` is 6px everywhere (genuinely circular things compute `size / 2`).
  No gradients, no alpha-appended hex, no shadows.
- **Colour discipline**: neutral surfaces, deep green (`#06402B`) as an action colour.
  Statuses come from `status.*` soft fills via `StatusBadge`.
- **States**: `LoadingState`, `ErrorState`, `EmptyState` are the only async placeholders.
- **Enforced mechanically**: the custom ESLint rule `hibbullah/radius-token` forbids numeric
  `borderRadius` literals outside `src/constants/sizes.ts`; `verify:flat-ui` and its
  mutation test guard the palette and structural anchors.

Primary tokens live in `src/constants/`:

| File                          | Contents                                                             |
| ----------------------------- | -------------------------------------------------------------------- |
| `colors.ts` / `darkColors.ts` | Light and dark palettes (brand, text, border, status, utility)       |
| `typography.ts`               | Font families, size scale, line heights, letter spacing              |
| `spacing.ts`                  | 4px-based spacing scale                                              |
| `sizes.ts`                    | Flat radius scale, border widths, touch/layout sizes, motion springs |
| `config.ts`                   | Currency, delivery fees, order cycle hours, page size, thresholds    |
| `districts.ts`                | Bangladesh district data (Dhaka-only delivery today)                 |
| `limits.ts`                   | Notification/audit caps                                              |

Theme selection is **per user** (stored in AsyncStorage), with a device-global fallback and
`system` mode. `useThemeColors()` returns the correct palette for the resolved theme.

---

## Getting started

### Prerequisites

- **Node.js 20+** (project uses npm; `packageManager` is `npm@11.19.0`)
- **npm** (or a compatible package manager; a `package-lock.json` is committed)
- **Expo Go** for quick device testing, or Android Studio / Xcode for native builds
- A **Supabase** project (hosted or local via Supabase CLI)
- A **Cloudinary** account with unsigned upload presets for `products/` and `avatars/`
- Optional: **EAS CLI** for cloud builds and OTA updates

### 1. Install

```bash
git clone git@github.com:icrmahin/hibbullah.git
cd hibbullah
npm ci
```

### 2. Configure environment

Create `.env` in the project root (it is git-ignored):

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your_product_preset
EXPO_PUBLIC_CLOUDINARY_AVATAR_UPLOAD_PRESET=your_avatar_preset
```

- For **local Supabase**, set `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`.
- The publishable/anon key is safe in the client; **never** put a service-role key in the
  app.
- `src/lib/supabase.ts` has explicit validation messages if you paste a JWT into the URL
  field or forget the key.
- Env changes require a restart with `npx expo start --clear`.

### 3. Run

```bash
npm start            # Expo dev server (scan QR with Expo Go / dev client)
npm run android      # native Android build + install
npm run ios          # native iOS build + install (macOS)
npm run web          # web dev server
```

### 4. First-run checklist

1. Apply migrations to your Supabase project (see [Database workflow](#database-workflow)).
2. Sign in with an allowlisted admin email; `handle_new_user` creates the profile and
   promotes the role.
3. Create a category and a product (with and without an image).
4. Place a test order as a customer, then confirm it as an admin.
5. Configure the push-notification Edge Function secret and deploy the function if you
   want image deletion / push dispatch in production.

---

## Environment variables

| Variable                                      | Required     | Used for                                                                 |
| --------------------------------------------- | ------------ | ------------------------------------------------------------------------ |
| `EXPO_PUBLIC_SUPABASE_URL`                    | Yes          | Supabase project URL (or `http://127.0.0.1:54321` locally)               |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`        | Yes          | Supabase publishable/anon key                                            |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`           | Yes          | Cloudinary cloud name                                                    |
| `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET`        | Yes          | Unsigned preset for `products/`                                          |
| `EXPO_PUBLIC_CLOUDINARY_AVATAR_UPLOAD_PRESET` | Yes          | Unsigned preset for `avatars/`                                           |
| `HIBBULLAH_SUPABASE_TOKEN`                    | Tooling only | Management API token used by migration/verification scripts (never ship) |

**Build-time note:** `EXPO_PUBLIC_*` values are inlined into the bundle. Keep them in
`eas.json` `build.*.env` for EAS builds; a missing value becomes a runtime failure.

**Server-side secrets** (Supabase project secrets, never in the repo):

| Secret                  | Used by                   |
| ----------------------- | ------------------------- |
| `CLOUDINARY_CLOUD_NAME` | `delete-cloudinary-asset` |
| `CLOUDINARY_API_KEY`    | `delete-cloudinary-asset` |
| `CLOUDINARY_API_SECRET` | `delete-cloudinary-asset` |

---

## Database workflow

`supabase/migrations/` is the **source of truth**. Never edit applied migrations; add a new
one.

### Apply migrations

```bash
npm run db:apply          # applies new migrations to the configured project
```

The script (`supabase/apply-new-migrations.mjs`) tracks applied versions in
`supabase_migrations.schema_migrations`, so a future `supabase db push` is a no-op.

### Local development

```bash
npx supabase start
npx supabase db reset      # migrations + seed (empty by design)
npx supabase status
```

Local defaults: API `http://127.0.0.1:54321`, DB `54322`, Studio `54323`.

### Keep the bootstrap in sync

`supabase/apply-to-hibbullah-hosted.sql` is the one-shot bootstrap for a fresh hosted
project. After adding migrations, keep it in sync:

```bash
npm run verify:sql-sync    # fails if the bootstrap and migrations diverge
```

### Test-data hygiene

```bash
npm run db:clean-test-data
npm run db:clean-test-emails
```

`clean-test-data.mjs` removes test orders/customers; `clean-test-emails.mjs` cleans test
accounts by email. Use them instead of hand-deleting production rows.

---

## Scripts reference

### Development

| Script                  | Description                |
| ----------------------- | -------------------------- |
| `npm start`             | Start the Expo dev server  |
| `npm run android`       | Native Android build/run   |
| `npm run ios`           | Native iOS build/run       |
| `npm run web`           | Expo web dev server        |
| `npm run lint`          | `expo lint` (ESLint)       |
| `npm run reset-project` | Expo template reset helper |

### Database

| Script                         | Description              |
| ------------------------------ | ------------------------ |
| `npm run db:apply`             | Apply pending migrations |
| `npm run db:clean-test-data`   | Remove test data         |
| `npm run db:clean-test-emails` | Remove test accounts     |

### Verification (individual)

| Script                    | Guards                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `verify:routes`           | Every route file is a valid, reachable screen                                                               |
| `verify:sql-sync`         | Migrations ↔ hosted bootstrap parity, allowlist single-source rules                                         |
| `verify:mutation`         | Mutation-tests the SQL-sync verifier itself                                                                 |
| `verify:device-runtime`   | Device/runtime behaviour contracts                                                                          |
| `verify:device-mutation`  | Mutation-tests the device verifier                                                                          |
| `verify:flat-ui`          | Palette, radius and structural anchors                                                                      |
| `verify:flat-ui:mutation` | Mutation-tests the flat-UI verifier                                                                         |
| `verify:contrast`         | WCAG contrast for token pairs                                                                               |
| `verify:district`         | District resolver / delivery fee rules                                                                      |
| `verify:allowlist`        | Admin allowlist unit tests                                                                                  |
| `verify:allowlist:live`   | Live allowlist consistency                                                                                  |
| `verify:no-alert`         | Fails if the app depends on a `react-native-web` no-op such as `Alert` (confirmation must use `useConfirm`) |
| `verify:stack`            | Navigation stack registration                                                                               |
| `verify:search`           | Search matching/sanitisation and RPC behaviour                                                              |
| `verify:batch-numbers`    | Short batch-number generation                                                                               |
| `verify:advertisements`   | Advertisement lifecycle                                                                                     |
| `verify:lifecycle`        | Order/inventory lifecycle and restock                                                                       |
| `verify:notifications`    | Notification triggers/realtime shape                                                                        |
| `verify:edge`             | Cloudinary delete Edge Function contract                                                                    |
| `verify:avatar`           | Avatar upload/delete flow                                                                                   |
| `verify:admin-areas`      | Admin route access areas                                                                                    |
| `verify:profit-restock`   | Profit math + return restock                                                                                |
| `verify:order-address`    | Order address probing                                                                                       |
| `verify:audit-actor`      | Audit actor attribution                                                                                     |
| `verify:address`          | Address rules                                                                                               |

### Full gate

```bash
npm run verify
```

Runs the project's release-gate chain (all core verifiers, mutation tests and the
`db:clean-test-data` cleanup at the end). Treat a red result as a release blocker.

> The `supabase/verify-*.mjs` scripts are integration checks against the configured
> project/device. Some require a running local Supabase, a device/emulator, or the
> `HIBBULLAH_SUPABASE_TOKEN` management token. See each file's header for its exact
> preconditions.

---

## Verification and quality gates

Before merge or release, the project expects:

```bash
npx tsc --noEmit                       # strict typecheck, 0 errors
npx eslint src                         # lint, 0 errors
CI=1 npx expo export --platform web    # production web bundle smoke test
```

Plus the relevant `verify:*` scripts for the area you touched. The repository ships
**mutation tests** that deliberately break a rule to prove the verifier can fail — do not
weaken a mutation test when a verifier fails; fix the code.

Design changes must also satisfy the mechanical constraints in
[`docs/DESIGN-SYSTEM.md`](./docs/DESIGN-SYSTEM.md) §9 (radius tokens, palette anchors,
structural strings, no gradients/alpha hex).

---

## Building and releasing

### Build profiles (`eas.json`)

| Profile          | Purpose                                                           | Output               |
| ---------------- | ----------------------------------------------------------------- | -------------------- |
| `development`    | Dev client with internal distribution                             | Dev build            |
| `preview`        | Internal testing, auto-incremented                                | APK                  |
| `production-apk` | Direct-distribution APK, `channel: production`, no auto-increment | APK (arm64-v8a only) |
| `production`     | Store build, auto-incremented                                     | AAB                  |

The `with-arm64-only` config plugin narrows `reactNativeArchitectures` to `arm64-v8a`
during prebuild, so the showcase APK does not ship emulator/32-bit slices.

### Runtime version / OTA

- `app.json` uses `runtimeVersion.policy = "fingerprint"`.
- `.fingerprintignore` excludes local native build residue inside `node_modules` so the
  local fingerprint matches the cloud build.
- JS-only changes ship with:

```bash
npx -y eas-cli@latest update --channel production --platform android \
  --message "describe the change" --environment production --non-interactive
```

- A native change (new native module, config plugin, `app.json` native field) requires a
  new build — an OTA update cannot add native code.

### Release checklist

1. Working tree contains only the intended JS changes (no unexpected native/config drift).
2. `node_modules` is a clean `npm ci` state — no `node_modules/**/android/build` residue
   (`find node_modules -maxdepth 4 -name build -type d` prints nothing).
3. `npx tsc --noEmit` and `npx eslint src` are clean.
4. Relevant `verify:*` scripts pass.
5. `CI=1 npx expo export --platform web` succeeds.
6. Build or publish, then confirm the OTA update's runtime version matches the installed
   build's fingerprint.
7. Cold-start the app to prove the update applied.

---

## Engineering conventions

The repo's operating rules are in **[`AGENT.md`](./AGENT.md)**. The essentials:

- **Inspect before editing.** Follow existing architecture and patterns; reuse components,
  hooks, services, types and utilities.
- **Scope discipline.** Change only what the task needs. Report unrelated problems instead
  of silently fixing them.
- **Strict TypeScript.** No `any`, no type assertions to silence errors, no weakened types.
- **Small, explicit functions.** Early validation, explicit errors, simple control flow,
  no giant components, no magic numbers.
- **Layering.** Screens → hooks → services → Supabase. Do not bypass the service layer.
- **Data integrity first.** Writes that must affect a row use `requireAffected`; prices are
  snapshotted; profit is never invented; cancelled orders never count as sales.
- **Design tokens only.** No raw colours, font sizes or radii outside `src/constants`.
- **Every async screen** handles loading, error, empty and inline mutation errors.

---

## Troubleshooting

| Symptom                                        | Likely cause / fix                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Invalid EXPO_PUBLIC_SUPABASE_URL`             | A JWT was pasted into the URL field, or the URL is not `http(s)://`. Fix `.env`, then `npx expo start --clear`.                                               |
| `Missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `.env` is missing the key or the dev server was not restarted after changing it.                                                                              |
| Supabase queries fail with `42501` on products | A `select *` slipped in after `cost_price` was revoked. Use `PRODUCT_PUBLIC_COLUMNS` / an RPC.                                                                |
| Images upload locally but not in an EAS build  | Cloudinary `EXPO_PUBLIC_*` values are missing from `eas.json` for that profile.                                                                               |
| Avatar upload rejected by Cloudinary           | The product preset cannot upload into `avatars/`; create/use the avatar preset.                                                                               |
| OTA update never applies                       | Runtime fingerprint mismatch (local native residue) or the update was published to a different channel. Check `.fingerprintignore` and `eas update:list`.     |
| Push notifications don't arrive                | Device permission/token not registered, `push_tokens` is empty, or the server-side Expo push call failed. Check `push_tokens` and the database/`pg_net` logs. |
| Realtime notification duplication / stale list | Each hook instance uses a unique channel name; do not reuse channel names across mounts.                                                                      |
| Local web export fails on `window`             | The Supabase client detects SSR and skips AsyncStorage by design; a new direct `AsyncStorage` call during render can still break SSR.                         |
| Search returns nothing for 1 character         | `MIN_SEARCH_TERM_LENGTH = 2` by design.                                                                                                                       |
| `verify:*` fails after a design change         | Read `docs/DESIGN-SYSTEM.md` §9; fix the anchor/token rather than the verifier.                                                                               |

---

## Roadmap and planned work

### Known owner actions

- Rotate any leaked management/service keys before applying new migrations.
- Create/verify the `hibbullah_avatars` unsigned upload preset (folder `avatars/`).
- Set Edge Function secrets and deploy `delete-cloudinary-asset` for image deletion.
- Apply pending migrations and keep `apply-to-hibbullah-hosted.sql` in sync.
- Seed the real catalogue and measure `browse_products` / `search_products` with `explain
(analyze)` on a large dataset.
- Optionally enable `custom_access_token_hook` in the Supabase dashboard (the app uses the
  `is_admin()` RPC, so this is not required).

### Planned feature

**Admin invoice / bill PDFs** (see [`todo.md`](./todo.md)):

- per-order bill preview and PDF download, and monthly bill views with totals;
- built with `jsPDF` inside the app, saved with `expo-file-system`, shipped as an OTA
  update with no new native module;
- customers never see bill UI;
- bill math comes from the order snapshot, never live prices.

### Short product TODO

See [`docs/TODO.md`](./docs/TODO.md): customer-facing order proof PDF and simplified,
separate address flow.

---

## License and contact

- **Repository:** `git@github.com:icrmahin/hibbullah.git`
- **Support:** `hibbullah82026@gmail.com` (configured in `src/constants/config.ts`)
- **App identity:** `Hibbullah` · Android `com.hibbullah.app` · scheme `hibbullah://`
- **License:** see [`LICENSE`](./LICENSE)

---

_This README is the entry point. For the UI contract read
[`docs/DESIGN-SYSTEM.md`](./docs/DESIGN-SYSTEM.md); for setup status read
[`docs/ROADMAP.md`](./docs/ROADMAP.md); for engineering rules read [`AGENT.md`](./AGENT.md)._
