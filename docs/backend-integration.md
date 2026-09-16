# Hibbullah Backend Integration Guide

> Prepared for the backend developer who will connect the existing frontend to the real **Supabase** backend.
>
> **Scope of this document:** explain how data flows today (mock), what the frontend expects, what Supabase currently has, what mismatches exist, and a safe implementation order.
>
> **Out of scope:** redesigning the UI, adding features, or modifying Supabase auth/schema/RLS.

---

## 1. Current architecture

The app is an **Expo (SDK 57) / React Native app with expo-router** and a single codebase for both the customer storefront and the admin dashboard.

```
UI (screens)
   │
   ▼
Hooks (useState + useEffect, e.g. useAdmin, useProducts, useOrders)
   │
   ▼
Services (async functions in src/services/**)
   │
   ▼
Data source
   ├─ src/services/mockData.ts  →  the in-memory seed store (used today for ALL business data)
   └─ Supabase                 →  used ONLY for auth + storage helpers today
```

- **Every screen** calls a service (or in several places reads the mock store directly — see §10).
- **The mock store** (`store` in `src/services/mockData.ts`) is a single in-memory object seeded at module load. All services currently mutate/read it directly.
- **The UI does not know** whether data comes from mock or Supabase *only in the places that go through services*. Several screens shortcut services and import `mockXxx` constants directly.
- **Environment flag:** `src/lib/env.ts` exposes `env.useMock` (true unless `EXPO_PUBLIC_USE_MOCK=false`) and `isBackendReady()`.
- **Supabase client:** `src/lib/supabase.ts` (anon key from env). Storage helpers in `src/lib/storage.ts`.

### File tree that matters

| Area | Files |
|---|---|
| Auth provider / session | `src/providers/AuthProvider.tsx`, `src/services/authService.ts`, `src/lib/session.ts` |
| Supabase client + storage | `src/lib/supabase.ts`, `src/lib/storage.ts` |
| Database types (frontend contract) | `src/types/database.ts` |
| Domain types | `src/types/*.ts` |
| Mock data | `src/services/mockData.ts` |
| Admin services | `src/services/admin/*.ts` |
| Customer services | `src/services/*.ts` |
| Admin screens | `src/app/(admin)/**` |
| Customer screens | `src/app/(customer)/**` |

---

## 2. Authentication

- **Where Supabase authentication happens:** `src/lib/supabase.ts` (client), `src/services/authService.ts` (Google OAuth + session resolution), `src/providers/AuthProvider.tsx` (session bootstrap + admin gate).
- **How the current session is obtained:**
  1. `AuthProvider` calls `supabase.auth.getSession()` on mount.
  2. Registers `supabase.auth.onAuthStateChange(...)`.
  3. For a real user, it runs `resolveAuthSession(sbSession)` (from `authService.ts`) which reads the `profiles` row and merges auth metadata into a frontend `User`.
- **How admin authorization is determined:**
  - `verifyAdminStatus(email)` queries `admin_users` (`select email .ilike cleanEmail .maybeSingle()`) — see `AuthProvider.tsx:37-60`.
  - The result forcibly overrides the session role: `isAdminUser ? "admin" : "customer"` (`AuthProvider.tsx:132-135`).
  - Route guard: `src/app/(admin)/_layout.tsx` redirects away when `!isAdmin`.
- **Mock fallback (development only):** when `env.useMock` is true and no real Supabase session exists, `AuthProvider` synthesizes a mock admin session from `store.users` (`AuthProvider.tsx:72-89`). Real Supabase sessions always out-rank it.
- **Login flow:** Google OAuth only (`signInWithGoogle`). `login()` and `register()` throw "disabled" errors.

### Files the backend developer must NOT change

| File | Why |
|---|---|
| `src/lib/supabase.ts` | Client creation + storage adapter |
| `src/services/authService.ts` | OAuth + session resolution |
| `src/lib/session.ts` | Local session persistence |
| `src/lib/storage.ts` | Storage upload/URL helpers |
| `src/providers/AuthProvider.tsx` | Session lifecycle + admin gate |
| `src/types/database.ts` | Frontend DB contract |
| `supabase/migrations/*` | Schema + RLS (already deployed) |
| `.env`, `app.json`, `eas.json`, `package.json` | Environment/build config |

---

## 3. Admin modules

Format legend — every module that exists is listed with its real wiring state.

### 3.1 Dashboard

- **Frontend route:** `/(admin)`
- **Frontend screen:** `src/app/(admin)/index.tsx`
- **Current service:** `src/services/admin/dashboardService.ts` → `getAdminDashboard()`
- **Current hook:** `src/hooks/useAdmin.ts`
- **Current mock source:** `store.orders`, `store.products`, `store.inventory`, `store.returns`, `store.audit`
- **Expected real database source:** `orders`, `products`, `product_batches`, `returns`, `audit_logs`
- **Read operations:** pending/processing order counts, active product count, low-stock count, attention lists (pending orders, low stock batches, pending returns), recent orders, recent audit entries
- **Create / Update / Delete:** none (read-only snapshot)
- **Required fields:** order status + total, product `is_active`/`stock`, batch `status`/`expiry_date`/`quantity`, return `status`
- **Optional fields:** actor names on audit entries
- **Image/storage requirements:** none
- **Loading state:** `LoadingState` via `useAdmin().loading`
- **Empty state:** inline note for attention; `EmptyState` for recent orders
- **Error state:** none currently (`getAdminDashboard` never throws) — backend should add error handling

### 3.2 Products — list

- **Frontend route:** `/(admin)/products`
- **Frontend screen:** `src/app/(admin)/products/index.tsx`
- **Current service:** `src/services/admin/adminProductService.ts` → `getAdminProducts()` + `src/services/categoryService.ts` → `getCategories()`
- **Current mock source:** `store.products`, `store.categories`
- **Expected real database source:** `products`, `categories`
- **Read operations:** all products + all categories
- **Create/Update/Delete:** none on this screen
- **Loading/Empty/Error:** `LoadingState`, `EmptyState`, `ErrorState` — all present

### 3.3 Product — create

- **Frontend route:** `/(admin)/products/add`
- **Frontend screen:** `src/app/(admin)/products/add.tsx`
- **Current service:** `src/services/admin/adminProductService.ts` → `createProduct(input)` + category/manufacturer services
- **Current mock source:** `store.products`, `store.categories`, `store.manufacturers`
- **Expected real database source:** `products`, `categories`, `manufacturers`
- **Create operations:** insert into `products`
- **Update/Delete:** none
- **Required fields:** `name`, `brand`, `generic_name`, `manufacturer_id`, `category_id`, `description`, `price`, `stock`, `unit`
- **Optional fields:** `original_price`, `discount_percent`, `image_path`, `is_active`, `is_featured`, batch fields
- **Image/storage requirements:** two image upload slots (see §4) — upload to `products` bucket via `src/lib/storage.ts`
- **Loading/Empty/Error:** `LoadingState` / `ErrorState` present

### 3.4 Product — edit

- **Frontend route:** `/(admin)/products/[productId]/edit`
- **Frontend screen:** `src/app/(admin)/products/[productId]/edit.tsx`
- **Current service:** `src/services/admin/adminProductService.ts` → `updateProduct(productId, patch)`
- **Current mock source:** `store.products`
- **Expected real database source:** `products`
- **Update operations:** patch `products` row
- **Read operations:** product by ID + categories + manufacturers (to initialize the form)
- **Loading/Empty/Error:** present

### 3.5 Product — detail / activate / delete

- **Frontend route:** `/(admin)/products/[productId]`
- **Frontend screen:** `src/app/(admin)/products/[productId]/index.tsx`
- **Current service:** `adminProductService` → `setProductActive(productId, isActive)`, `deleteProduct(productId)`; `productService.getProductById()`
- **Current mock source:** `store.products`
- **Expected real database source:** `products`
- **Update operations:** set `is_active`
- **Delete operations:** delete row (or hard delete — current mock hard-deletes). Backend should decide soft vs hard delete.
- **Loading/Empty/Error:** present

### 3.6 Inventory — list

- **Frontend route:** `/(admin)/inventory`
- **Frontend screen:** `src/app/(admin)/inventory/index.tsx`
- **Current service:** `src/services/admin/inventoryService.ts` → `getInventory()`
- **Current mock source:** `store.inventory`
- **Expected real database source:** `product_batches` joined with `products`
- **Read operations:** batch list with product name + batch number + quantity
- **Loading/Empty/Error:** `LoadingState` present, minimal error/empty

### 3.7 Inventory — batches / expiry

- **Frontend routes:** `/(admin)/inventory/batches`, `/(admin)/inventory/expiry`
- **Frontend screens:** `src/app/(admin)/inventory/batches.tsx`, `src/app/(admin)/inventory/expiry.tsx`
- **Current service:** `src/services/admin/batchService.ts` → `getBatches()`, `getExpiringBatches(withinDays)`
- **⚠️ Currently the screens read `mockInventory` directly instead of the service**
- **Expected real database source:** `product_batches`
- **Read operations:** all batches / batches expiring within 90 days
- **Loading/Empty/Error:** missing (must be added)

### 3.8 Inventory — stock adjustment

- **Frontend route:** `/(admin)/inventory/adjustment`
- **Frontend screen:** `src/app/(admin)/inventory/adjustment.tsx`
- **Current service:** `src/services/admin/inventoryService.ts` → `adjustStock(input)`
- **⚠️ The screen is a hardcoded placeholder** — product “Amoxicillin 250mg”, batch “AMX-732”, reason, quantity `-6`, and Save just calls `router.back()`.
- **Expected real database source:** `product_batches.quantity` (+ `admin_users` as actor, `audit_logs`)
- **Create/Update:** update batch quantity; append audit entry
- **Required fields:** `productId`, `batchNumber`, `type` (`increase`|`decrease`), `quantity`, `reason`, `adminName`
- **Known problem:** screen must be wired to `adjustStock` (a UI/feature task — flag to product owner)

### 3.9 Orders — list

- **Frontend route:** `/(admin)/orders`
- **Frontend screen:** `src/app/(admin)/orders/index.tsx`
- **Current service:** `src/services/admin/orderManagementService.ts` → `getAdminOrders(status?)`
- **⚠️ Currently the screen imports `getOrders` from the CUSTOMER `orderService` (defaults to `customerId="user-001"`), so it only shows one customer’s orders**
- **Expected real database source:** `orders` joined with `profiles` + `order_items`
- **Read operations:** orders (optionally filtered by status)
- **Loading/Empty/Error:** partial (loading only)

### 3.10 Orders — detail

- **Frontend route:** `/(admin)/orders/[orderId]`
- **Frontend screen:** `src/app/(admin)/orders/[orderId].tsx`
- **Current service:** none wired — reads `mockOrders` directly; **Confirm/Cancel buttons are no-ops** (`router.back()`)
- **Expected real database source:** `orders`, `order_items`, `profiles`, `addresses`
- **Read operations:** order by ID with items + customer + address
- **Update operations:** accept (→ `CONFIRMED`), reject / cancel (→ `CANCELLED`)
- **Loading/Empty/Error:** missing (must be added)

### 3.11 Customers — list / detail

- **Frontend routes:** `/(admin)/customers`, `/(admin)/customers/[customerId]`
- **Frontend screens:** `src/app/(admin)/customers/index.tsx`, `src/app/(admin)/customers/[customerId].tsx`
- **Current service:** `src/services/admin/customerService.ts` → `getCustomers()`, `getCustomerById(id)`
- **⚠️ Screens read `mockCustomerList` directly (list screen fakes loading with a `setTimeout`)**
- **⚠️ `CustomerRecord` shape (orderCount, totalSpent, dueAmount, status) is mock-only — it does NOT exist in `database.ts`**
- **Expected real database source:** `profiles` (+ aggregates over `orders`)
- **Read operations:** customer list + customer detail
- **Loading/Empty/Error:** missing (must be added)

### 3.12 Reports

- **Frontend routes:** `/(admin)/reports`, `/(admin)/reports/sales`, `/(admin)/reports/inventory`
- **Frontend screens:** `src/app/(admin)/reports/index.tsx`, `sales.tsx`, `inventory.tsx`
- **Current service:** `src/services/admin/reportService.ts` → `getSalesReport()`, `getInventoryReport()`
- **⚠️ Screens are fully static/hardcoded (numbers baked into JSX); `reportService` is unused**
- **Expected real database source:** `orders`, `order_items`, `product_batches`
- **Read operations:** revenue, delivered count, discounts, low/out-of-stock, expiring/expired, inventory value
- **Loading/Empty/Error:** missing (must be added)

### 3.13 Returns

- **Frontend routes:** `/(admin)/returns`, `/(admin)/returns/[returnId]`
- **Frontend screens:** `src/app/(admin)/returns/index.tsx`, `src/app/(admin)/returns/[returnId].tsx`
- **Current service:** `src/services/admin/returnService.ts` → `getReturns()`, `getReturnById(id)`, `updateReturnStatus(id, status)`
- **⚠️ Screens read `mockReturns` directly; detail screen has no approve/reject controls**
- **Expected real database source:** `returns` joined with `profiles`/`products`
- **Read/Update:** read list + detail; update `status` (PENDING → APPROVED/REJECTED/PROCESSED)
- **Loading/Empty/Error:** missing (must be added)

### 3.14 Audit / history

- **Frontend route:** `/(admin)/audit`
- **Frontend screen:** `src/app/(admin)/audit/index.tsx`
- **Current service:** `src/services/admin/auditService.ts` → `getAuditLog()`
- **⚠️ Screen reads `mockAuditEntries` directly**
- **Expected real database source:** `audit_logs`
- **Read operations:** recent entries
- **⚠️ Contract mismatch:** frontend `AuditEntry` has `actor: string` and `oldValue/newValue?: string`; DB `audit_logs` has `actor_id` (uuid) and `old_value/new_value: Json`. The service must resolve `actor_id` → display name and stringify JSON history.

---

## 4. Products

### Frontend type (`src/types/product.ts`)

```ts
export type Product = {
  id: string;
  name: string;
  brand: string;
  genericName: string;
  manufacturerId: string;
  categoryId: string;
  description: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  stock: number;
  unit: string;
  image?: string;            // legacy single image (URL)
  primaryImage?: string;     // first upload slot  → maps to products.image_path
  secondaryImage?: string;   // second upload slot → NO column exists yet
  isActive: boolean;
  isFeatured?: boolean;
  batchNumber?: string;
  expiryDate?: string;
  createdAt: string;
};
```

### Supabase `products` table (frontend DB contract, `src/types/database.ts`)

```ts
products: {
  id: string;             // uuid
  name: string;
  brand: string;
  generic_name: string;
  manufacturer_id: string;
  category_id: string;
  description: string;
  price: number;
  original_price: number | null;
  discount_percent: number | null;
  unit: string;
  image_path: string | null;   // ← single image column
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
}
```

### Field source audit

| Field (frontend) | DB column | Currently mock? | Exists in Supabase type? |
|---|---|---|---|
| `id` | `id` | ✅ seed | ✅ |
| `name` | `name` | ✅ seed | ✅ |
| `brand` | `brand` | ✅ seed | ✅ |
| `genericName` | `generic_name` | ✅ seed | ✅ |
| `manufacturerId` | `manufacturer_id` | ✅ seed | ✅ |
| `categoryId` | `category_id` | ✅ seed | ✅ |
| `description` | `description` | ✅ seed | ✅ |
| `price` | `price` | ✅ seed | ✅ |
| `originalPrice` | `original_price` | ✅ seed | ✅ |
| `discountPercent` | `discount_percent` | ✅ seed | ✅ |
| `stock` | **no column** (derived from batches) | ✅ seed | ❌ (not a products column) |
| `unit` | `unit` | ✅ seed | ✅ |
| `image`/`primaryImage` | `image_path` | ✅ seed (remote Unsplash URLs) | ✅ single column |
| `secondaryImage` | **no column** | ❌ | ❌ |
| `isActive` | `is_active` | ✅ seed | ✅ |
| `isFeatured` | `is_featured` | ✅ seed | ✅ |
| `batchNumber` | `product_batches.batch_number` | ✅ seed | ✅ (related table) |
| `expiryDate` | `product_batches.expiry_date` | ✅ seed | ✅ (related table) |
| `createdAt` | `created_at` | ✅ seed | ✅ |

### Image requirements (IMPORTANT)

The product form **`ProductForm.tsx`** has **TWO image upload slots**:

1. **Primary image** (`primaryImage`) — stored to `products.image_path`, shown in admin cards (`AdminProductCard` renders `product.primaryImage ?? product.image`).
2. **Secondary image** (`secondaryImage`) — a second product view. **There is currently no `products` column for it.** The storage layer already supports two named files:
   - `src/lib/storage.ts` → `uploadProductVariantImage(productId, "primary"|"secondary", file)` writes `{productId}-primary.webp` / `{productId}-secondary.webp` into the `products` bucket.
   - `getProductImageUrl(path)` resolves a path (or full URL) to a public URL.
3. There is also a legacy free-text **`Image URL (fallback)`** field (`image`) that mirrors `primaryImage` on pick.

**Backend decision needed:** if the two-slot UI must persist, either (a) add a `secondary_image_path` column, or (b) resolve both images from `product_batches`/storage naming. Document this decision; do not silently drop the second slot.

**Upload wiring gap:** `createProduct`/`updateProduct` in `adminProductService.ts` currently store whatever string the form sends (a local `file://` URI in real use). They do **not** call `storage.ts`. The backend integration must upload the picked image to the `products` bucket and store the returned path in `image_path`.

---

## 5. Orders

### Frontend type (`src/types/order.ts`)

```ts
export type OrderStatus = "PENDING" | "CONFIRMED" | "PROCESSING"
  | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED" | "RETURNED";

export type OrderItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  total: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  createdAt: string;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  paymentMethod: "CASH_ON_DELIVERY";
  address: string;            // flattened delivery address string
  items: OrderItem[];
  timeline: Array<{ label: string; time: string; note?: string }>;
};
```

### Supabase source tables (frontend DB contract)

- `orders` — `order_number`, `customer_id`, `delivery_cycle_id`, `status`, `subtotal`, `discount`, `delivery_fee`, `total`, `payment_method` (`CASH_ON_DELIVERY`), `address_id`, `created_at`
- `order_items` — `order_id`, `product_id`, `quantity`, `unit_price`, `discount_percent`, `total`
- `addresses` — used to build the flattened `address` string (`label, street, city, county, postal_code`)
- `profiles` — for `customerName`

### Required derivations (service must provide)

- `customerName` ← `profiles.name` via `orders.customer_id`
- `address` ← `addresses` row via `orders.address_id`
- `productName` ← join `order_items.product_id` → `products.name`
- `timeline` ← needs an order-history source. Nothing in `database.ts` defines order status history except `audit_logs` (actor/action/record). If the backend rebuilds a timeline, deriving it from `audit_logs` (filter `record_type = 'orders'`, `record_id = orderId`) is the existing-tables-supported approach. Otherwise a new table is required (out of scope to invent).
- `orderNumber` ← `orders.order_number`

### Admin actions required

| Action | Current mock behavior | Target behavior |
|---|---|---|
| **Accept** | `confirmOrder(orderId)` → status `CONFIRMED`, also flips `deliveryCycle.status` | update `orders.status` → `CONFIRMED` (+ append audit entry) |
| **Reject / cancel** | `cancelOrder(orderId)` → status `CANCELLED` | update `orders.status` → `CANCELLED` (+ audit) |
| **Update status** | `updateOrderStatus(orderId, status)` (mock, used by customer service) | update `orders.status` through the enum `order_status` |

The admin order detail screen today uses fake buttons (`router.back()`); the backend dev should wire them through `orderManagementService.confirmOrder / cancelOrder` (already prepared in this task).

---

## 6. Customers

The admin dashboard expects customers in this shape (mock `src/services/mockData.ts` → `CustomerRecord`):

```ts
export type CustomerRecord = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: "active" | "inactive";
  orderCount: number;
  totalSpent: number;
  dueAmount: number;
};
```

- **List screen** (`customers/index.tsx`) shows `name` + `phone`.
- **Detail screen** (`customers/[customerId].tsx`) shows `phone`, `orderCount`, `totalSpent` (formatted with `formatCurrency`).
- **Expected real source:** `profiles` (id, name, phone) **plus aggregates** — `orderCount` (count of `orders` for the user), `totalSpent` (sum of `orders.total`), `dueAmount` (no source column — document; there is no “due/payment” table in `database.ts`), `status` (no source column; could be derived from recency/last order).
- **Mismatch:** `CustomerRecord` fields `status` and `dueAmount` have no backing table/column in `database.ts`. The backend must either compute them or the UI must be adjusted (flag to product owner).

Where displayed: list screen, detail screen, and dashboard "Needs attention" + customer names on recent orders.

---

## 7. Inventory

### Frontend types (`src/types/inventory.ts`)

```ts
export type InventoryStatus = "healthy" | "low" | "out_of_stock";

export type InventoryItem = {
  id: string;
  productId: string;
  productName: string;
  batchNumber: string;
  quantity: number;
  expiryDate?: string;
  status: InventoryStatus;
  lastUpdated: string;
};

export type StockAdjustment = {
  id: string;
  productId: string;
  productName: string;
  batchNumber: string;
  type: "increase" | "decrease";
  quantity: number;
  reason: string;
  timestamp: string;
  adminName: string;
};
```

### Supabase source table (`product_batches`, frontend DB contract)

```ts
product_batches: {
  id: string;
  product_id: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  purchase_cost: number | null;
  status: "active" | "expired" | "depleted";
}
```

### Covered by the dashboard

- **Stock:** `product_batches.quantity` (sum per product for product-level `stock`)
- **Batches:** `inventory/batches.tsx` lists each batch (`batch_number`, `product_name`, `quantity`)
- **Expiry dates:** `inventory/expiry.tsx` lists `expiry_date`; `getExpiringBatches(withinDays=90)` filters
- **Adjustments:** `inventoryService.adjustStock()` mutates a batch’s `quantity` and re-derives status; records a `StockAdjustment` + audit entry
- **Low-stock:** threshold from `config.lowStockThreshold` (currently `10`)

### Frontend ↔ database mismatches

| Concept | Frontend | DB (type contract) | Gap |
|---|---|---|---|
| Batch id | `InventoryItem.id` | `product_batches.id` | fine |
| Product name | `productName` | via join `products.name` | service must join |
| Status | `"healthy" \| "low" \| "out_of_stock"` | `"active" \| "expired" \| "depleted"` | **different vocabularies** — mapper needed |
| `lastUpdated` | string | not in `product_batches` | no column (only `created_at` absent too) |
| `purchase_cost` | unused by screens | exists | unused |
| Low-stock at product level | derived from `products.stock` | products has no `stock` column | **`products.stock` must be derived from batches** |

Also, `products.stock` (used everywhere on product cards and admin) has **no column in the `products` table** — it must be an aggregate of `product_batches.quantity`.

---

## 8. Supabase integration requirements

Use the frontend DB contract in `src/types/database.ts` as the canonical shape. The real Supabase project currently contains **only `admin_users` and `profiles`** (see `supabase/migrations/20260914141707_remote_commit.sql`). **All other tables below are declared in the type contract but must be created/verified by the backend developer.**

### Tables to create / verify

| Table | Purpose | Key columns from type contract |
|---|---|---|
| `profiles` | customer + admin profiles | `id`, `name`, `email`, `phone`, `role` ⚠️ **real DB uses `full_name`/`phone_number`, no email/role — mismatch** |
| `products` | catalog | §4 |
| `categories` | product categories | `id`, `name`, `slug`, `description?` |
| `manufacturers` | drug manufacturers | `id`, `name`, `country?` |
| `product_batches` | batch/expiry/stock | §7 |
| `carts` / `cart_items` | customer carts | `carts(customer_id)`, `cart_items(cart_id, product_id, quantity)` |
| `delivery_cycles` | 24h order cycle | `customer_id`, `status`, `started_at`, `closes_at` |
| `orders` | order header | §5 |
| `order_items` | order lines | §5 |
| `addresses` | delivery addresses | `customer_id`, `label`, `street`, `city`, `county?`, `postal_code?`, `is_default` |
| `notifications` | in-app notifications | `user_id`, `title`, `body`, `type`, `read`, `created_at` |
| `returns` | return requests | `order_id`, `customer_id`, `product_id`, `quantity`, `reason`, `status`, `created_at` |
| `audit_logs` | admin history | `actor_id`, `action`, `record_type`, `record_id`, `old_value`, `new_value` |
| `admin_users` | admin whitelist (exists) | `id`, `email`, `created_at` — **do not change** |

### Verify relationships

- `products.manufacturer_id → manufacturers.id`
- `products.category_id → categories.id`
- `product_batches.product_id → products.id`
- `order_items.order_id → orders.id`; `order_items.product_id → products.id`
- `orders.customer_id → profiles.id`; `orders.address_id → addresses.id`; `orders.delivery_cycle_id → delivery_cycles.id`
- `carts.customer_id → profiles.id`; `cart_items.cart_id → carts.id`
- `returns.order_id/product_id/customer_id → orders/products/profiles`
- `notifications.user_id → profiles.id`
- `audit_logs.actor_id → admin_users.id`

### Storage operations

- Bucket: `products`
- Existing helpers (`src/lib/storage.ts`): `uploadProductImage`, `uploadProductVariantImage(productId, "primary"|"secondary")`, `deleteProductVariantImage`, `getProductImageUrl`
- Storage path convention: `{productId}-primary.webp`, `{productId}-secondary.webp`, or legacy `{productId}.webp`
- Public URL resolution via `supabase.storage.from("products").getPublicUrl(path)` — uses anon key; ensure bucket is public or RLS-aware.

---

## 9. Frontend/backend contract

### Frontend expects (service return shapes)

- `getAdminProducts(): Promise<Product[]>` (camelCase, flattened — §4)
- `getProductById(id): Promise<Product | undefined>`
- `createProduct(input: Omit<Product, "id"|"createdAt">): Promise<Product>`
- `updateProduct(id, patch: Partial<Product>): Promise<Product>`
- `setProductActive(id, isActive): Promise<Product>`
- `deleteProduct(id): Promise<void>`
- `getAdminOrders(status?): Promise<Order[]>` (flattened with customerName/address/items — §5)
- `confirmOrder(id): Promise<Order>` / `cancelOrder(id): Promise<Order>`
- `getCustomers(): Promise<CustomerRecord[]>` / `getCustomerById(id)`
- `getInventory(): Promise<InventoryItem[]>` / `getBatches()` / `getExpiringBatches(withinDays?)`
- `adjustStock(input): Promise<StockAdjustment>`
- `getReturns() / getReturnById(id) / updateReturnStatus(id, status)`
- `getSalesReport()` / `getInventoryReport()` (single flat object each)
- `getAuditLog(): Promise<AuditEntry[]>` (actor resolved to name)

### Backend should return

- camelCase domain objects exactly shaped like `src/types/*.ts` (do **not** leak snake_case DB columns into components)
- IDs as strings (`uuid`s)
- ISO-8601 date strings for all date fields
- A consistent throw-on-error contract — screens use `normalizeError(err).message` and render `ErrorState`

### Frontend sends

- Product create: `Omit<Product, "id"|"createdAt">` (all fields camelCase; images as paths/URLs)
- Product update: `Partial<Product>`
- Order status: literal of `OrderStatus`
- Return status: literal of `ReturnStatus`
- Stock adjustment: `{ productId, batchNumber, type, quantity, reason, adminName }`
- Auth events: handled by `supabase-js` directly (authService)

### Backend should accept

- The exact shapes above, mapped to snake_case columns on insert/update
- `adminName` is currently a display string from the mock actor “Dr. Yusuf Ali”; Supabase should resolve the actor from the authenticated session (`auth.uid()`) and store `actor_id`. The **display name** stays a frontend concern.

---

## 10. Known problems

1. **Real schema vs type contract divergence.** Migration contains only `admin_users` + `profiles`. `profiles` in real DB = `(id, full_name, phone_number, created_at)`; the type contract = `(id, name, email, phone, role)` and `authService.resolveAuthSession` upserts `{id, name, email, phone, role}` into `profiles` — this will fail (silently caught) against the real schema. Backend must reconcile `profiles`.
2. **~12 admin tables don’t exist yet** in the remote schema although the type contract declares them.
3. **Admin order list uses the customer service.** `orders/index.tsx` imports `getOrders` from `src/services/orderService.ts` (defaults to `customerId="user-001"`), so the admin list shows a single mock customer’s orders, not all orders. `getAdminOrders` in `orderManagementService` is unused.
4. **Admin order detail is a fake.** Reads `mockOrders`; Confirm/Cancel buttons call `router.back()`. No real status mutation (fixed in this task to use `confirmOrder`/`cancelOrder`).
5. **Direct mock-store reads bypass the service layer** (see §11 list) — the UI would break immediately if only the services were swapped to Supabase.
6. **Unused services (wired nowhere):** `customerService`, `returnService`, `auditService`, `batchService`, `reportService`, `orderManagementService.getAdminOrders`, `addressService`. Dashboard detail: `dashboardService` is used; reports are static.
7. **`products.stock` has no column** — must be derived from `product_batches`.
8. **Inventory status vocabularies differ** (`healthy/low/out_of_stock` vs `active/expired/depleted`); a mapper is required.
9. **Two image slots vs one `image_path` column.** Secondary image has no column; storage layer supports it, DB doesn’t.
10. **`ImageUpload` returns local `file://` URIs**; `adminProductService` stores them as-is. Nothing uploads to the `products` bucket yet.
11. **`CustomerRecord` (`status`, `dueAmount`) has no DB source.**
12. **`AuditEntry.actor` vs `audit_logs.actor_id`; `oldValue/newValue` string vs Json.**
13. **`returnService.updateReturnStatus` and `orderManagementService` write audit entries with a hardcoded actor “Dr. Yusuf Ali”** — real actor must come from the session.
14. **Customer-facing screens** (home, product browse/detail, search, categories, manufacturers, order detail, delivery cycle, notifications, addresses) read mock constants directly — they are out of scope for the admin integration but must be migrated eventually for a full cut-over.
15. **Reports screens are static** (values baked into JSX), `reportService` unused.
16. **`inventory/adjustment.tsx` is a hardcoded placeholder** (product/batch/reason/qty baked in, Save does nothing).
17. **`verifyAdminStatus` requires the `admin_users` RLS policy “SELECT for authenticated”** to remain intact — do not touch.
18. **Duplicate mock exports** (`mockProducts`, `mockOrders`, etc.) encourage direct reads. Prefer the singleton `store` or services.

### Direct mock access (bypasses services) — full inventory

| File | Mock symbol used |
|---|---|
| `src/app/(admin)/orders/[orderId].tsx` | `mockOrders` |
| `src/app/(admin)/inventory/batches.tsx` | `mockInventory` |
| `src/app/(admin)/inventory/expiry.tsx` | `mockInventory` |
| `src/app/(admin)/customers/index.tsx` | `mockCustomerList` |
| `src/app/(admin)/customers/[customerId].tsx` | `mockCustomerList` |
| `src/app/(admin)/returns/index.tsx` | `mockReturns` |
| `src/app/(admin)/returns/[returnId].tsx` | `mockReturns` |
| `src/app/(admin)/audit/index.tsx` | `mockAuditEntries` |
| `src/app/(customer)/(tabs)/index.tsx` | `mockProducts`, `mockCategories`, `mockManufacturers` |
| `src/app/(customer)/(tabs)/products.tsx` | `mockProducts`, `mockCategories`, `mockManufacturers` |
| `src/app/(customer)/search.tsx` | `mockProducts` |
| `src/app/(customer)/products/[productId].tsx` | `mockProducts`, `mockCategories`, `mockManufacturers` |
| `src/app/(customer)/products/categories.tsx` | `mockCategories` |
| `src/app/(customer)/products/category/[categoryId].tsx` | `mockCategories`, `mockProducts` |
| `src/app/(customer)/products/manufacturers.tsx` | `mockManufacturers` |
| `src/app/(customer)/products/manufacturer/[manufacturerId].tsx` | `mockManufacturers`, `mockProducts` |
| `src/app/(customer)/order/[orderId].tsx` | `mockOrders` |
| `src/app/(customer)/delivery-cycle.tsx` | `mockDeliveryCycle` |
| `src/app/(customer)/account/addresses.tsx` | `mockAddresses` |
| `src/app/(customer)/account/notifications.tsx` | `mockNotifications` |
| `src/app/(customer)/account/profile.tsx` | `mockUser` (fallback only) |

Auth-related direct mock usage (intentional, protected):
- `src/providers/AuthProvider.tsx` → `store.users` (mock admin session, dev-only)
- `src/services/authService.ts` → `store.users` (fallback profile resolution)

---

## 11. Integration order

Recommended safe sequence for the backend developer:

1. **Authentication / session verification** — confirm Google OAuth + `admin_users` gate works against the real project before touching data.
2. **Product reads** — implement `products` + `categories` + `manufacturers` reads; update `productService`/`adminProductService`/`categoryService`/`manufacturerService` to query Supabase when `env.useMock === false`.
3. **Product creation** — `createProduct` insert.
4. **Product updates** — `updateProduct` patch.
5. **Product deletion** — `deleteProduct` (decide hard vs soft delete, e.g. set `is_active = false`).
6. **Product image storage** — wire `ImageUpload`/`ProductForm` to `src/lib/storage.ts`; persist `image_path`; resolve secondary image path (see §4).
7. **Inventory** — `product_batches` reads + `adjustStock` (status vocabulary mapper, expiring batches).
8. **Orders read** — flatten `orders` + `order_items` + `addresses` + `profiles` into `Order`.
9. **Order status management** — `confirmOrder`/`cancelOrder`/`updateOrderStatus`.
10. **Customer data** — `profiles` + order aggregates into `CustomerRecord`.
11. **Reports / history** — `reportService` + `audit_logs` (resolve actor), returns.

> Always gate on `env.useMock`: when `true`, keep the mock store path so the UI still runs without a backend. When `false`, use Supabase.

---

## 12. Files backend developer should understand

| File | Purpose | Backend relevance | Should backend modify? |
|---|---|---|---|
| `src/lib/supabase.ts` | Supabase client | Auth token source | 🔒 NO |
| `src/services/authService.ts` | OAuth + session→User | Auth flow | 🔒 NO |
| `src/lib/session.ts` | Local session persistence | — | 🔒 NO |
| `src/lib/storage.ts` | Product image upload/URL | Image storage | ✅ YES (extend if needed) |
| `src/providers/AuthProvider.tsx` | Session bootstrap + admin gate | Auth UX | 🔒 NO |
| `src/types/database.ts` | DB contract (all tables) | Canonical schema | ✅ YES (align with real schema) |
| `src/types/product.ts` | Product domain type | Product mapper | ✅ YES |
| `src/types/order.ts` | Order domain type | Order mapper | ✅ YES |
| `src/types/inventory.ts` | Inventory domain types | Batch mapper | ✅ YES |
| `src/types/return.ts` | Return domain type | Return mapper | ✅ YES |
| `src/types/audit.ts` | Audit domain type | Audit mapper | ✅ YES |
| `src/types/category.ts` / `manufacturer.ts` | Lookup types | Mappers | ✅ YES |
| `src/services/mockData.ts` | In-memory seed store | Mock boundary (keep until cut-over) | 🔒 NO (keep) |
| `src/services/productService.ts` | Customer product reads | Replace with Supabase | ✅ YES |
| `src/services/orderService.ts` | Customer order reads/writes | Replace with Supabase | ✅ YES |
| `src/services/cartService.ts` | Cart ops | Replace with Supabase | ✅ YES |
| `src/services/categoryService.ts` | Category reads | Replace with Supabase | ✅ YES |
| `src/services/manufacturerService.ts` | Manufacturer reads | Replace with Supabase | ✅ YES |
| `src/services/addressService.ts` | Address CRUD | Replace with Supabase | ✅ YES |
| `src/services/deliveryCycleService.ts` | Delivery cycle | Replace with Supabase | ✅ YES |
| `src/services/notificationService.ts` | Notifications | Replace with Supabase | ✅ YES |
| `src/services/admin/dashboardService.ts` | Dashboard aggregates | Replace with Supabase | ✅ YES |
| `src/services/admin/adminProductService.ts` | Admin product CRUD | Replace with Supabase | ✅ YES |
| `src/services/admin/orderManagementService.ts` | Admin order actions | Replace with Supabase | ✅ YES |
| `src/services/admin/inventoryService.ts` | Inventory + adjustments | Replace with Supabase | ✅ YES |
| `src/services/admin/batchService.ts` | Batch/expiry reads | Replace with Supabase | ✅ YES |
| `src/services/admin/customerService.ts` | Customer reads | Replace with Supabase | ✅ YES |
| `src/services/admin/returnService.ts` | Return reads/updates | Replace with Supabase | ✅ YES |
| `src/services/admin/reportService.ts` | Sales/inventory reports | Replace with Supabase | ✅ YES |
| `src/services/admin/auditService.ts` | Audit log | Replace with Supabase | ✅ YES |
| `src/hooks/useAdmin.ts` | Dashboard hook | Keep; swap service internals | 🟡 TOUCH LIGHTLY |
| `src/hooks/useProducts.ts` / `useProduct.ts` / `useOrders.ts` / `useCart` | Data hooks | Keep | 🟡 TOUCH LIGHTLY |
| `src/app/(admin)/**` | Admin screens | Consume services (already mostly wired after this task) | 🟡 TOUCH LIGHTLY |
| `src/app/(customer)/**` | Customer screens | Consume services after admin cut-over | 🟡 TOUCH LIGHTLY |
| `src/constants/config.ts` | Thresholds, currency, delivery fee | Configuration | 🟡 TOUCH LIGHTLY |
| `src/lib/env.ts` | `env.useMock` / `isBackendReady()` | The mock↔real switch | ✅ YES |
| `supabase/migrations/*` | Deployed schema + RLS | Source of truth | 🔒 NO |