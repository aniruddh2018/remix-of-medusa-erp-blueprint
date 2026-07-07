
# MARG Import in Company Creation + Existing-Data Guard

## Goals
1. New companies get an optional "Migrate from MARG" step right after business-type selection, with a **Skip for now** button.
2. `/data-import` stays available from the sidebar (already is) so users can run/resume the migration later.
3. When importing MARG data into a company that already has products/batches/purchases/sales, show a **preflight warning with typed-confirmation** gate before any writes.

## Scope of changes

### 1. Onboarding wizard — add MARG step
File: `src/pages/Onboarding.tsx`

- Extend `step` state: `"company" | "type" | "migrate"`.
- After `complete_onboarding` succeeds, instead of hard-redirecting to `/`, set the returned `companyId` into local state and advance to `step="migrate"` (don't reload yet — BusinessContext will still say `needsOnboarding=false` after refetch, but we stay on this page).
- New `MigrateStep` panel renders the four sub-stages sequentially (reusing existing components):
  1. Products — `<MargMasterImport />`
  2. Stock — `<MargStockImport />`
  3. Purchase History — `<MargPurchaseImport />`
  4. Sales History — `<MargSalesImport />`
  - Each sub-stage has **Skip this step** and **Continue** buttons. A small stepper at the top shows 1/4 · 2/4 · 3/4 · 4/4.
  - "Skip all & go to dashboard" button always visible in the header.
- On finish (or full skip): `window.location.href = "/dashboard"`.

Since the existing importers already resolve `companyId` from `BusinessContext`, and BusinessContext will have the new company after `complete_onboarding`, no prop drilling is needed — we just need to trigger a context refetch before rendering the migrate step (call the existing refresh path in BusinessContext, or briefly `await` a re-query).

### 2. Sidebar entry point
`/data-import` is already reachable from the sidebar — no change. Add a small banner on `/data-import` "Coming from a new company? Follow the tabs left→right: Products → Stock → Purchase → Sales."

### 3. Existing-data preflight guard
New file: `src/components/data-import/ExistingDataGuard.tsx`

A small wrapper shown by each MARG importer **before** the file-drop UI when the target company is not empty. It:

- Runs one query per relevant table scoped to `company_id`:
  - Products importer → counts `products`
  - Stock importer → counts `inventory_batches` with `quantity > 0`
  - Purchase importer → counts `purchase_orders`
  - Sales importer → counts `sales_orders`
- If all counts are 0 → renders children directly (no prompt).
- Otherwise renders a warning card:
  ```
  This company already has:
  • 1,204 products
  • 87 batches with stock
  • 43 purchase bills
  • 12 sales bills
  Importing will MERGE — duplicate bill numbers are skipped,
  matching products are updated, batches accumulate quantities.
  Type the company name to confirm:  [_________]  [Proceed]
  ```
- Only after typed confirmation matches `companies.name` (case-insensitive trim) does it render children.
- No wipe/delete path — merge-only, matching the user's choice.

Wire it into `MargMasterImport`, `MargStockImport`, `MargPurchaseImport`, `MargSalesImport` (wrap the top-level Card).

### 4. Merge semantics (already implemented, documented here for clarity)
The existing importers already behave as merge:
- Purchase: `skipDuplicateBills` default true (by `order_number`); `upsertBatch` accumulates quantity.
- Stock: opens a `STOCK-OPENING-<date>` batch per product; `overrideExisting` toggle already lets user zero prior batches — leave as-is, off by default when re-importing.
- Sales: unchanged.
- Master (products): upsert by name.

No behavior change required in the import services — the guard only *warns* and gates.

## Technical details

- `ExistingDataGuard` props:
  ```ts
  { companyId: string; scope: "products" | "stock" | "purchase" | "sales"; children: ReactNode }
  ```
- Skip button in onboarding sets a flag `localStorage["marg_migration_deferred"] = "1"` so the dashboard can show a one-time reminder toast ("Finish MARG import in Data Import") — nice-to-have.
- No DB migrations, no RLS changes, no new tables.

## Files touched
- `src/pages/Onboarding.tsx` (add migrate step)
- `src/components/data-import/ExistingDataGuard.tsx` (new)
- `src/components/data-import/MargMasterImport.tsx` (wrap)
- `src/components/data-import/MargStockImport.tsx` (wrap)
- `src/components/data-import/MargPurchaseImport.tsx` (wrap)
- `src/components/data-import/MargSalesImport.tsx` (wrap)
- `src/pages/DataImport.tsx` (small helper banner + ensure tab order Products→Stock→Purchase→Sales)

## Out of scope
- Wipe/delete flows (user rejected).
- Any schema changes.
- Auto-detection of MARG file format on onboarding (user picks files per sub-stage).
