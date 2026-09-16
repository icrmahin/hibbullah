Aponar project-er ekhon porjonto complete kora shob changes, authentication architecture, Supabase schema sync, ebong production-ready setup represent kore ekta well-structured **README.md** file content format kore dewa holo.

Aponi direct ei text-tuku copy kore aponar project-er root directory-te **README.md** file-e save kore nite paren:

```markdown
# Hibbullah App - Admin Access & Authentication System

This project features a secure, role-based access control (RBAC) authentication flow built with React Native (Expo Router) and Supabase. The application conditionally manages UI components, restricts administrative navigation paths, and maintains localized database migration states via the Supabase CLI.

## Key Features & Changes Implemented

### 1. Database Schema & Policy Configuration
* Admin Access Repository: Established the `public.admin_users` table in Supabase to track administrative privileges via manually inserted email records.
* Row Level Security (RLS): Enabled RLS on `admin_users` with SELECT policies allowing authenticated sessions to read admin credentials securely.
* TypeScript Schema Integration: Mapped database definitions in `src/types/database.ts` covering Row, Insert, and Update properties for strict query typing.

### 2. Authentication Context Engine (`AuthProvider.tsx`)
* Admin Verification: Integrated case-insensitive email evaluation (`ilike` / lowercase comparison) against the `admin_users` table during initial hydration, session sync, and session state changes.
* Dynamic State Management: Maintained `isAdmin` boolean state alongside standard user context while ensuring `loading` remains active until database validation resolves.
* Session Purging: Configured automatic cache invalidation using `clearSession()` upon user logout or missing active sessions to prevent stale administrative state persistence.

### 3. Navigation Security & Layout Guards
* Dynamic UI Rendering (`src/app/(customer)/(tabs)/account.tsx`): Wrapped administrative entry options with `isAdmin` checks to ensure customer dashboard controls display conditionally based on user role.
* Layout Middleware Interceptor (`src/app/(admin)/_layout.tsx`): Protected the `(admin)` folder path using Expo Router. Non-admin or unauthenticated access attempts are immediately trapped and redirected to `/(customer)/account/profile`.
* Route Coordination (`src/app/(customer)/_layout.tsx`): Removed hard bounces to allow administrators full access to customer-facing profile screens without premature redirects.

### 4. Supabase CLI & Schema Migration Flow
* Project Link: Local environment linked to the remote Supabase project reference (`juelhrhywmaeksscghwo`).
* Migration Sync: Resolved remote migration history tracking via CLI repair tools and populated `supabase/migrations/` with the current database schema state.
* Automated Types Generation: Synchronized remote schema changes directly into `src/types/database.ts`.

---

## Technical Stack

* Framework: React Native with Expo Router (File-based routing)
* Backend / Database: Supabase (PostgreSQL, Auth, RLS)
* Language: TypeScript
* Operating Context: Fedora Linux (KDE Plasma)

---

## Directory Structure Overview


```

src/
├── app/
│   ├── (admin)/               # Protected Admin Routes
│   │   └── _layout.tsx        # Route Guard Middleware
│   └── (customer)/
│       └── (tabs)/
│           └── account.tsx    # Conditional UI Display
├── hooks/
│   └── useAuth.ts             # Auth State Consumer Hook
├── lib/
│   ├── session.ts             # Storage Persistence Helpers
│   └── supabase.ts            # Supabase Client Instance
├── providers/
│   └── AuthProvider.tsx       # Auth Context & DB Verification
└── types/
├── auth.ts                # Context & User Type Definitions
└── database.ts            # Supabase Generated Types

```

---

## CLI Commands Reference

### Sync Remote Database Schema
```bash
npx supabase db pull

```

### Repair Migration Tracking History

```bash
npx supabase migration repair --status applied <migration_timestamp>

```

### Generate TypeScript Definitions

```bash
npx supabase gen types typescript --project-id juelhrhywmaeksscghwo > src/types/database.ts

```

```

```