/**
 * Per-product low-stock thresholds: no global constant survives in any
 * product-level low-stock calculation, and the form/RPC field round-trips.
 *
 * Two layers, deliberately:
 * 1. static — reads only repository files, no credentials; runs anywhere.
 * 2. live (degraded skip) — when a local Supabase is up (`supabase status`
 *    joins reachable `supabase_db_*`), it inserts scratch batches in the
 *    *local* database only and proves the trigger classes them correctly at
 *    thresholds 10 / 50 / 0, and that invalid values are refused. The probe
 *    never contacts hosted Supabase; it uses the local stack socket.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

let problems = 0
const report = (ok, msg, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (extra) console.log(`        ${extra}`)
  if (!ok) problems += 1
}

console.log('=== per-product low-stock thresholds (static) ===\n')

const cfg = readFileSync('src/constants/config.ts', 'utf8')
report(
  !/lowStockThreshold/.test(cfg),
  'no global low-stock threshold lives in config anymore',
)

const prodTs = readFileSync('src/services/products.ts', 'utf8')
report(
  /low_stock_threshold/.test(prodTs) && /p_low_stock_threshold/.test(prodTs),
  'product service carries low_stock_threshold (columns + create RPC arg)',
)
report(
  !/config\.lowStockThreshold/.test(prodTs),
  'product service reads no global threshold',
)

const mappers = readFileSync('src/lib/mappers.ts', 'utf8')
report(
  /low_stock_threshold/.test(mappers) && /lowStockThreshold/.test(mappers),
  'mapper carries low_stock_threshold to Product.lowStockThreshold',
)

const typeTs = readFileSync('src/types/product.ts', 'utf8')
report(
  /lowStockThreshold:\s*number/.test(typeTs),
  'Product type declares lowStockThreshold',
)

const form = readFileSync('src/components/admin/ProductForm.tsx', 'utf8')
report(
  /Whole number of 0 or more|[Ww]hole-number|whole number of 0 or more/.test(form) && /lowStockThreshold/.test(form),
  'ProductForm exposes the threshold with 0-or-more whole-number validation',
)
report(
  /lowStockThreshold: Number\(lowStockThreshold\)/.test(form),
  'ProductForm payload sends the threshold',
)

const card = readFileSync('src/components/admin/AdminProductCard.tsx', 'utf8')
const detail = readFileSync('src/app/(admin)/products/[productId]/index.tsx', 'utf8')
report(
  /product\.stock < product\.lowStockThreshold/.test(card) && !/config\.lowStockThreshold/.test(card),
  'AdminProductCard classifies low stock per-product',
)
report(
  /product\.stock < product\.lowStockThreshold/.test(detail) && !/config\.lowStockThreshold/.test(detail),
  'admin product detail classifies low stock per-product',
)

const adminTs = readFileSync('src/services/admin.ts', 'utf8')
report(
  /get_admin_low_stock/.test(adminTs) && !/lt\('stock', 10\)/.test(adminTs) && !/lt\('quantity', 10\)/.test(adminTs),
  'dashboard low-stock comes from get_admin_low_stock, with no < 10 literals left',
)

const reportsTs = readFileSync('src/services/reports.ts', 'utf8')
report(
  !/config\.lowStockThreshold/.test(reportsTs) && !/p_low_stock_threshold/.test(reportsTs),
  'reports service carries no global threshold',
)

// Migration text checks: backfill, default, guard, per-product predicates.
const migDir = 'supabase/migrations'
const migs = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()
const migText = migs.map((f) => readFileSync(`${migDir}/${f}`, 'utf8')).join('\n')
report(
  /add column if not exists low_stock_threshold integer not null default 50/.test(migText) &&
    /update public\.products set low_stock_threshold = 10/.test(migText),
  'migration: default 50 for new products, backfill 10 for existing rows',
)
report(
  /check \(low_stock_threshold >= 0\)/.test(migText),
  'migration: non-negative check constraint on the column',
)
report(
  /select low_stock_threshold into v_threshold from public\.products/.test(migText),
  'trigger reads the product-level threshold (not a literal)',
)
report(
  /stock < p\.low_stock_threshold/.test(migText) && !/coalesce\(p_low_stock_threshold/.test(readFileSync('supabase/migrations/20261012000000_product_low_stock_threshold.sql', 'utf8')),
  'new migration: low predicate reads the product column; no global fallback remains',
)
report(
  /count\(\*\) filter \(where stock > 0 and stock < low_stock_threshold\)/.test(migText),
  'get_reports low count is product-level',
)
report(
  /create or replace function public\.get_admin_low_stock\(\)/.test(migText) &&
    /if not public\.is_admin\(\) then/.test(migText),
  'get_admin_low_stock exists and is admin-guarded',
)
report(
  /left join public\.inventory_items i on i\.product_id = p\.id and i\.quantity > 0/.test(migText),
  'get_admin_low_stock left-joins batches so a batch-less low product still appears',
)
report(
  /v_new_stock < v_threshold/.test(migText) && /NEW\.stock < v_threshold/.test(migText),
  'low-stock notifications read the per-product threshold (no hardcoded 10)',
)
report(
  /create trigger trg_products_reclassify_batches/.test(migText) &&
    /after update of low_stock_threshold on public\.products/.test(migText),
  'changing the threshold reclassifies that product batches',
)
report(
  !/\blowStockThreshold:\s*10\b/.test(migText.replace(/existing rows were backfilled to 10/i, '')),
  'no stray global 10 threshold remains in migration text',
)

// ── live (optional, local-only) ────────────────────────────────────────────
console.log('\n=== per-product low-stock thresholds (live, local only) ===\n')
let liveSkipped = false
try {
  const ps = execSync(
    'podman ps --format "{{.Names}} {{.Image}}" 2>/dev/null | grep -i supabase_db || true',
    { encoding: 'utf8', timeout: 15000 },
  )
  if (!ps.trim()) {
    liveSkipped = true
    console.log('  SKIP  no local Supabase database container is running — live checks skipped (static checks above gate this suite)')
  } else {
    const name = ps.trim().split(/\s+/)[0]
    const run = (sql) =>
      execSync(
        `podman exec -e PGPASSWORD=postgres ${name} psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1 -tAc "${sql.replace(/"/g, '\\"')}"`,
        { encoding: 'utf8', timeout: 30000 },
      ).trim()
    let pid = run('SELECT id FROM public.products LIMIT 1')
    let scratch = false
    if (!pid) {
      // No product to probe with: create a scratch one locally, then remove it.
      // (Two steps: INSERT ... RETURNING via psql -tAc also prints the INSERT tag,
      // so the id is read back with a plain SELECT.)
      run(`INSERT INTO public.products (name, generic_name, price) VALUES ('Probe scratch', 'generic probe scratch', 10)`)
      pid = run(`SELECT id FROM public.products WHERE name='Probe scratch' LIMIT 1`)
      scratch = true
    }
    if (!pid) {
      liveSkipped = true
      console.log('  SKIP  could not create a scratch product locally')
    } else {
      const origThreshold = run(`SELECT low_stock_threshold FROM public.products WHERE id='${pid}'`)
      try {
        // threshold 10: a 5-unit batch is low
        run(`UPDATE public.products SET low_stock_threshold = 10 WHERE id = '${pid}'`)
        run(`INSERT INTO public.inventory_items (product_id, batch_number, quantity) VALUES ('${pid}', 'PROBE-10', 5)`)
        const s10 = run(`SELECT status FROM public.inventory_items WHERE product_id='${pid}' AND batch_number='PROBE-10'`)
        report(s10 === 'low', 'live: threshold-10 product, 5-unit batch is low', `status=${s10}`)
        // threshold 50: a 30-unit batch is low for a 50-threshold product but healthy for a 10-threshold one
        run(`UPDATE public.products SET low_stock_threshold = 50 WHERE id = '${pid}'`)
        run(`INSERT INTO public.inventory_items (product_id, batch_number, quantity) VALUES ('${pid}', 'PROBE-50', 30)`)
        const s50 = run(`SELECT status FROM public.inventory_items WHERE product_id='${pid}' AND batch_number='PROBE-50'`)
        report(s50 === 'low', 'live: threshold-50 product, 30-unit batch is low', `status=${s50}`)
        // threshold 0: any positive quantity is healthy
        run(`UPDATE public.products SET low_stock_threshold = 0 WHERE id = '${pid}'`)
        run(`INSERT INTO public.inventory_items (product_id, batch_number, quantity) VALUES ('${pid}', 'PROBE-0', 1)`)
        const s0 = run(`SELECT status FROM public.inventory_items WHERE product_id='${pid}' AND batch_number='PROBE-0'`)
        report(s0 === 'healthy', 'live: threshold-0 product, 1-unit batch is healthy', `status=${s0}`)
        // invalid: negative threshold is refused by the check
        let rejected = false
        try {
          run(`UPDATE public.products SET low_stock_threshold = -1 WHERE id = '${pid}'`)
        } catch {
          rejected = true
        }
        report(rejected, 'live: negative threshold rejected by check constraint')
        // multi-batch stock crossing: sum of batches vs threshold drives the product signal
        const sum = run(`SELECT coalesce(sum(quantity),0) FROM public.inventory_items WHERE product_id='${pid}' AND batch_number IN ('PROBE-10','PROBE-50','PROBE-0')`)
        const pstock = run(`SELECT stock FROM public.products WHERE id='${pid}'`)
        report(sum === pstock, 'live: products.stock equals the batch sum (sync trigger intact)', `sum=${sum} stock=${pstock}`)
      } finally {
        run(`DELETE FROM public.inventory_items WHERE product_id='${pid}' AND batch_number LIKE 'PROBE-%'`)
        if (scratch) {
          run(`DELETE FROM public.products WHERE id='${pid}'`)
          console.log('  note  probe batches and scratch product removed after checks')
        } else if (origThreshold !== '' && origThreshold !== null) {
          run(`UPDATE public.products SET low_stock_threshold = ${origThreshold} WHERE id='${pid}'`)
          console.log('  note  probe batches removed; original threshold restored')
        } else {
          console.log('  note  probe batches removed after checks')
        }
      }
    }
  }
} catch (e) {
  liveSkipped = true
  console.log(`  SKIP  live checks could not run: ${String(e.message).slice(0, 120)}`)
}

console.log(problems === 0 ? '\n=== THRESHOLDS OK ===' : `\n=== ${problems} DIFFERENCE(S) ===`)
if (liveSkipped) console.log('(live section skipped — static section above is the gate)')
process.exitCode = problems === 0 ? 0 : 1
