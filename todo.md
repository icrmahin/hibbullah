# TODO — Admin Order Bills (Invoice PDF)

- Status: planned, not started
- Date: 2026-10-04
- Rule: ONE phase at a time. Finish a phase, verify it, STOP, wait for the
  user. Never start the next phase unasked. Never commit to GitHub.

## Goal (plain words)

The admin — not the customer — can see bills. Two views:
1. **Per-order bill:** open any order, see and download its invoice PDF.
2. **Monthly bills:** pick a month, see every order bill of that whole
   month with totals, download any of them.

Free forever, no limits, ships as an over-the-air update — no reinstall.

## Locked decisions (do not revisit without asking)

- **jsPDF inside the app.** Pure JavaScript, open-source, runs on the phone.
  No server calls, no API key, no quota, no bill.
- **Rejected:** iLovePDF API (paid after ~100 requests/month).
- **Preview is a normal app screen** built from existing components
  (Card, ListItem, Text). NEVER pull in a WebView/PDF-viewer package to
  preview — that adds native code and would force a rebuild.
- **Saving uses only the already-installed `expo-file-system`.**
  No new native module → stays OTA-safe.
- **Customers see no bill UI anywhere.** If a phase touches a file under
  `src/app/(customer)/`, stop — wrong place.
- Native print/share is OUT of scope.

## Bill content (fixed spec)

- Header: Hibbullah Pharmacy, shop address, shop phone.
- Meta: invoice no (= order `orderNumber`), order date (`createdAt`),
  payment method, order status.
- Customer: `customerName`, delivery `address`. Phone only if the loaded
  customer record has one — never invent it.
- Items table, one row per `OrderItem`: `productName`, `quantity`,
  `unitPrice`, line `total`.
- Totals, straight from the order snapshot: `subtotal`, `discount`,
  `deliveryFee` (flat ৳80), grand `total`. Recompute nothing from live
  prices — a bill must never change after the order is placed.
- Footer: "Dhaka only for now" + thank-you line.

## Known traps (read before every phase)

1. **jsPDF built-in fonts are Latin-only.** The ৳ sign and any Bangla text
   print as garbage unless a Bengali TTF is embedded. Rule: if a Bengali
   font is embedded, use ৳; otherwise write `Tk` (e.g. `Tk 80`).
2. **expo-file-system v57 changed its API.** The old
   `StorageAccessFramework` namespace lives only under
   `expo-file-system/legacy`; the modern API is the `Directory`/`File`
   classes. NEVER write file code from memory — Phase 3 starts by reading
   the real `.d.ts` files in `node_modules/expo-file-system/build/`.
3. **Fingerprint gate.** Every `eas update` must be published from the
   exact tree the build was made from. Before publishing: no uncommitted
   native/config changes, `node_modules` must be a clean `npm ci` state
   (stale `*/android/build` residue inside `node_modules` broke a build
   before — check with the command in Phase 6).

---

## Phase 1 — Install jsPDF, prove OTA-safe

**Read first:** `package.json` (confirm `expo` ~57, no `jspdf` yet).

**Do:**
1. Run `npm install jspdf` (plain npm — it is NOT an Expo module, so do
   NOT use `npx expo install` for it).
2. Run `npx expo config --json` and confirm the `plugins` array is
   byte-identical to before (no config plugin added).
3. Confirm `app.json` was not modified: `git diff --stat app.json`
   must show nothing except already-planned changes.

**Verify:** `npx tsc --noEmit` (exit 0), `npx eslint src/` new-file scope,
`npx expo install --check` (only the two known pre-existing drifts:
expo-constants, expo-router — nothing new).

**Do NOT:** install `react-native-webview`, `expo-print`,
`expo-sharing`, `expo-media-library`, or any package with a config
plugin or native code. If `npm install` wants to touch `app.json`,
abort the phase and report.

**Stop when:** jsPDF imports in a scratch check without errors and all
three verifications pass.

## Phase 2 — Invoice builder (pure function, no UI, no files)

**Read first:** `src/types/order.ts` (exact `Order`/`OrderItem` fields),
one existing util in `src/utils/` for style (imports, JSDoc, exports).

**Do:**
1. Create `src/utils/buildInvoicePdf.ts`: signature
   `(order: Order) => ArrayBuffer` (or `Uint8Array` — pick one, document
   it). No React imports, no filesystem imports, no network.
2. Layout with jsPDF primitives only: header band in brand dark green,
   meta/customer blocks, items table drawn with lines + text (no
   autotable plugin — one less dependency to break), totals block, footer.
3. Money formatting helper: integers with thousands separators;
   currency string follows the font rule from Trap 1 (`৳` only if the
   Bengali font is embedded, else `Tk`).
4. Font decision, in this order: (a) check `assets/` for a Bengali TTF
   (e.g. Noto Sans Bengali, OFL-licensed). If present → embed via
   `addFileToVFS` + `addFont` and use it for the whole bill.
   (b) If absent → English-only bill, report it as a known limitation,
   do NOT download random fonts from the internet without asking.

**Verify:** `npx tsc --noEmit`; a scratch Node script that feeds a fake
order object and writes the output to `/tmp/opencode/invoice-test.pdf`;
open it and eyeball: header, table lines add up, totals match input.

**Do NOT:** read prices from anywhere except the passed-in order object;
round money with floats (work in whole taka integers).

**Stop when:** the test PDF looks right and TypeScript is clean.

## Phase 3 — Save to Downloads (no UI yet)

**Read first:** the REAL API — `node_modules/expo-file-system/build/`
(`Directory.d.ts`, `File.d.ts`, and `legacy/` only if the new API can't
do Downloads). Copy exact method names from there into the code.

**Do:**
1. Create `src/utils/saveInvoicePdf.ts`: takes PDF bytes + filename
   `Hibbullah-INV-<orderNumber>.pdf`, saves into the phone's Downloads
   folder, returns `{ ok: true, uri }` or `{ ok: false, reason }`.
2. Permission flow: request once; if denied, return `reason:
   "permission-denied"` and let the UI explain — never throw, never
   retry-loop, never write to app-private storage as a silent fallback
   (a bill the admin can't find is worse than an honest error).
3. Filename: sanitize `orderNumber` (strip `/ \ :` etc.) so it is always
   a legal filename.

**Verify:** call it from a temporary button or scratch harness on the
emulator (`cli_emu`): file appears in Downloads, opens as a valid PDF.
`npx tsc --noEmit`, `npx eslint` on the new file.

**Do NOT:** add any new dependency; use hardcoded `/sdcard/Download`
paths (breaks on some devices — always go through the FileSystem API).

**Stop when:** a real PDF lands in the emulator's Downloads and opens.

## Phase 4 — Admin UI: per-order bill

**Read first:** `src/app/(admin)/orders/[orderId].tsx` (where the buttons
go, which order object is in scope), `src/components/common/` Button +
Alert usage on that same screen (copy the pattern, don't invent).

**Do:**
1. Add "View bill" → navigates to a bill preview: a plain React screen
   (same folder or `src/app/(admin)/orders/[orderId]/bill.tsx` following
   the router's existing nesting) rendering the bill with Card/Text/
   ListItem — same numbers as Phase 2's builder, no duplication of logic
   (preview reads the same `Order` object).
2. Add "Download" → calls Phase 2 builder + Phase 3 saver → success or
   denied message via the screen's existing Alert/feedback pattern.
3. Loading state on the button while generating (PDF gen is fast but
   never leave a dead button); disable double-tap.

**Verify:** emulator, admin login: open an order → preview matches the
Phase-2 test PDF numbers → Download → file in Downloads.
`npx tsc --noEmit`, `npx eslint` on touched files.

**Do NOT:** touch anything under `src/app/(customer)/`; add navigation
entries anywhere except the admin order flow.

**Stop when:** preview + download both work on a real order in emulator.

## Phase 5 — Admin UI: monthly bills screen

**Read first:** `src/app/(admin)/_layout.tsx` (how admin screens are
registered — add the route exactly the same way), `src/hooks/useAdmin`
(`useAdminOrders` — check whether it accepts date-range params or
returns all orders for client-side filtering; use whichever exists,
do not extend the hook's API without need).

**Do:**
1. New screen (e.g. `src/app/(admin)/reports/bills.tsx` ONLY if
   `reports/` is the established place for admin reports — otherwise
   follow whatever `_layout.tsx` shows; verify by reading, not guessing):
   month picker defaulting to the current month.
2. Query: orders with `createdAt` inside
   `[first-day-00:00, last-day-23:59:59]` of the chosen month, newest
   first. Include every status EXCEPT `CANCELLED` (a cancelled order has
   no bill — state this rule in the UI empty-state too).
3. Header summary: order count + sum of `total`. One row per order:
   date, `customerName`, `orderNumber`, `total`, download button reusing
   Phase 3 (same saver, same filename rule).
4. Empty month → plain EmptyState ("No bills this month"), not an error.

**Verify:** emulator with test orders across two months (use
`verify:*`/seed tooling already in repo — do NOT hand-insert production
data): switching months changes the list; totals add up; each download
opens. `tsc`, `eslint`.

**Do NOT:** show customer phones/addresses in the list rows (details
screen only); include cancelled orders in totals.

**Stop when:** month switching, totals, and per-row downloads all check
out in the emulator.

## Phase 6 — Device pass + ship as OTA update

**Read first:** nothing new. This phase is verification + publish.

**Do, in this exact order:**
1. Clean-room check: `git status --short` — know exactly what changed.
   Must be JS-only (utils, admin screens). If `app.json`, `eas.json`,
   or any native file changed unexpectedly → STOP, report, do not ship.
2. Residue check (caused a real build failure before):
   `find node_modules -maxdepth 4 -name build -type d | head` must print
   nothing. If anything prints → run `npm ci --include=dev` first, then
   re-run `tsc` + this check.
3. Full local gate: `npx tsc --noEmit`,
   `npx eslint` on all touched files, plus the repo's related
   `verify:*` guards that cover touched areas.
4. Emulator end-to-end (release APK currently installed): cold-start app
   → admin login → per-order bill → monthly bills → one download opens.
5. Publish ONLY after 1–4 are green:
   `npx -y eas-cli@latest update --channel production --platform android --message "admin order bills pdf" --environment production --non-interactive`
6. Confirm: `npx -y eas-cli@latest update:list --channel production`
   shows the update AND its runtime version equals the current
   production build's fingerprint (`eas build:view <id>`). If they
   differ → STOP, do not announce success; report the mismatch.
7. Emulator proof of delivery: force-close the app, reopen (cold start
   applies the update), confirm the bill buttons exist.

**Do NOT:** run `eas build` (no native change → no rebuild needed);
publish when any check above is red; commit anything to GitHub.

**Stop when:** update listed with matching runtime version AND the
emulator shows the feature after a cold start. Then write the final
one-paragraph report.

## Done means

- [ ] Admin can view and download a correct bill for any order.
- [ ] Admin can open a month and see every bill + month totals.
- [ ] Bill math matches the order (subtotal − discount + ৳80 delivery = total).
- [ ] Cancelled orders never appear in monthly bills.
- [ ] Customers see no bill UI anywhere.
- [ ] Shipped via `eas update` with matching runtime version, no new APK.
- [ ] Nothing committed to GitHub unless asked.
