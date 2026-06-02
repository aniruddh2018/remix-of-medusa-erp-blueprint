# Feature Memory: Pharma ERP Migration Engine

> **Purpose**: This document is a handoff memory for the Pharma ERP Migration Engine feature.
> When model context limits are hit, read this file to resume work.
> **Status**: IMPLEMENTED (needs DB migration + testing)
> **Created**: 2026-05-29
> **Feature ID**: migration-engine-v1

---

## 1. Executive Summary

A staging-based migration engine that imports legacy Marg/Tally XML exports into the Dawa Dukan ERP cloud platform. The system validates data before importing, supports rollback, and auto-maps legacy tax/ledger structures.

### Key Capabilities
- Upload Tally/Marg XML (up to 500 MB via streaming parser)
- Stage → Validate → Preview → Confirm → Rollback workflow
- Auto-classify ledgers (supplier, customer, bank, cash, GST, etc.)
- Auto-map Tally stock groups → manufacturers
- Auto-map Tally units → ERP unit names (TAB→Tablet, CAP→Capsule, etc.)
- Auto-extract GST rates (CGST, SGST, IGST) from STOCKITEM GSTDETAILS
- 30% failure threshold triggers automatic rollback
- Error export to CSV

---

## 2. Architecture

```
┌─ Frontend ─┐     ┌─ Supabase Edge Functions ─┐     ┌─ PostgreSQL ─┐
│ Migration   │────▶│ tally-import (XML parse)    │     │ staging_*    │
│ Dashboard │       │ migration-staging (staging)   │     │ production   │
└───────────┘       └─────────────────────────────┘     │ import_      │
                                                        │ sessions     │
```

**Important**: All staging operations now use **direct Supabase client calls** (not edge functions). The `tally-import` edge function is only needed for XML parsing (CPU-intensive). Staging/validation/import all work via direct `supabase.from().insert()` calls.

---

## 3. Files (CRITICAL — read these first)

| File | Purpose | Status |
|------|---------|--------|
| `docs/SYSTEM_DESIGN_ERP_MIGRATION_ENGINE.md` | Full system design doc | ✅ Complete |
| `supabase/migrations/20260528000000_add_migration_engine.sql` | DB schema for staging tables, manufacturers, ledger_groups, ledgers, gst_tax_structures | ✅ Needs `supabase db push` |
| `supabase/functions/tally-import/index.ts` | XML parser (streaming, block-splitting for 700K+ line files) | ✅ Complete |
| `supabase/functions/migration-staging/index.ts` | Staging edge function (superseded by direct client) | ✅ Complete but optional |
| `src/services/migrationStaging.ts` | Frontend service — direct Supabase calls for all staging operations | ✅ Complete |
| `src/services/mappingEngine.ts` | Auto-mapping: units, ledger groups, manufacturers, GST | ✅ Complete |
| `src/types/dataImport.ts` | Extended types: ImportSession, TallyMastersParseResult, staging types | ✅ Complete |
| `src/pages/MigrationDashboard.tsx` | UI wizard: Upload → Parse → Stage → Review → Confirm → Done | ✅ Complete |
| `src/App.tsx` | Route `/migration` added | ✅ Complete |
| `src/components/layout/AppSidebar.tsx` | Sidebar "Migration Engine" menu added | ✅ Complete |

---

## 4. Database Schema (What Must Be Migrated)

Run `supabase db push` to apply:

```sql
-- New tables (RLS policies included)
manufacturers          -- Normalized manufacturer master
ledger_groups          -- Accounting group hierarchy (parent_id self-ref)
ledgers                -- All accounting ledgers (ledger_type enum)
gst_tax_structures     -- GST rate mapping (CGST, SGST, IGST)
import_sessions        -- Migration session tracking
staging_products       -- Product staging with validation_status
staging_ledgers        -- Ledger staging with validation_status
staging_batches        -- Batch staging with validation_status
staging_suppliers      -- Supplier staging with validation_status

-- Extended constraints
import_jobs            -- Added ledger_group, ledger, manufacturer, gst_structure entity types
import_templates       -- Same entity type extensions
import_mappings      -- Same entity type extensions
products               -- Added manufacturer_id FK
```

**If migration fails**: The staging tables and new tables are independent. The existing `products`, `suppliers`, `customers`, `inventory_batches` tables still work normally.

---

## 5. UI Flow

1. **Navigate to `/migration`** (Admin/SuperAdmin only — RBAC protected)
2. **Upload XML** → calls `tally-import` edge function (or fails if not deployed)
3. **Parse Results** → shows counts: products, ledgers, categories, GST rates
4. **Select Entities** → checkboxes: Products, Ledgers, Suppliers, Batches
5. **Stage for Import** → direct Supabase inserts into staging_* tables
   - Validation runs per row (required fields, GST format, MRP checks)
   - Spinner shows while inserting (batch size: 200 rows)
6. **Review** → shows valid/invalid counts per entity
   - Preview button → shows first 20 rows
   - Export Errors button → downloads CSV
7. **Confirm Import** → imports in dependency order:
   - ledger_group → manufacturer → supplier → customer → product
   - Each uses `upsert` with `company_id,name` conflict resolution
8. **Done** → shows import summary or rollback alert (if >30% failures)

---

## 6. Known Issues & Fixes History

| # | Issue | Fix | Date |
|---|-------|-----|------|
| 1 | Staging button silent fail when edge function not deployed | All staging ops now use direct Supabase client, no edge function dependency | 2026-05-29 |
| 2 | `company?.id` null guard silently returned without error | Added explicit error display + toast | 2026-05-29 |
| 3 | `writeStaging` return type mismatch (nested `validation` object) | Fixed `WriteStagingResponse` interface | 2026-05-29 |
| 4 | Suppliers duplicated from ledgers | Separated `allLedgers` from `suppliers` in parse result; staging handles both independently | 2026-05-29 |
| 5 | Batch entity not implemented | Returns `[]` — needs STOCKITEM opening balance parsing | 2026-05-29 |

### Current Outstanding Issues
1. **Batch import not implemented** — `buildStagingRowsFromParse('batch')` returns `[]`. Need to parse STOCKITEM opening balances into batch records with expiry dates.
2. **tally-import edge function** needs `supabase functions deploy` for XML parsing to work. Without it, file upload step fails.
3. **GST tax structures** not yet imported from `gstRates` array.
4. **Ledger group hierarchy** not resolved — `parent_id` is always null. Need to map parent group names → IDs after inserting.
5. **No progress indicator during confirm import** — large imports may appear frozen.

---

## 7. How to Test

```bash
# 1. Push DB migration
supabase db push

# 2. Deploy edge function (optional but needed for XML parsing)
supabase functions deploy tally-import

# 3. Start dev server
npm run dev

# 4. Navigate to /migration as super_admin
# 5. Upload master.xml (or any Tally All Masters XML)
```

If the XML parse fails (edge function not deployed), the file upload step will show an error. The rest of the staging workflow works entirely via direct Supabase calls.

---

## 8. Resuming Work (For Future Agents)

### If Context Is Exhausted
1. **Read this file first** → `docs/FEATURE_MEMORY_MIGRATION_ENGINE.md`
2. **Read system design** → `docs/SYSTEM_DESIGN_ERP_MIGRATION_ENGINE.md`
3. **Read the DB migration** → `supabase/migrations/20260528000000_add_migration_engine.sql`
4. **Check types** → `src/types/dataImport.ts` (search for `ImportSession`, `StagingEntityType`)
5. **Check service layer** → `src/services/migrationStaging.ts`
6. **Check UI** → `src/pages/MigrationDashboard.tsx`

### Next Items to Implement (Priority Order)
1. [ ] **Batch import** — Parse STOCKITEM opening balance into `staging_batches` with batch numbers, expiry dates
2. [ ] **Ledger group parent resolution** — After inserting ledger_groups, update `parent_id` by matching parent name
3. [ ] **GST tax structure import** — Insert into `gst_tax_structures` from `gstRates` array
4. [ ] **Progress indicator** — Show real-time progress during confirm import (WebSocket or polling)
5. [ ] **Error detail view** — Click invalid row to see exact errors in UI
6. [ ] **Manual resolution UI** — Edit staging row fields inline to fix errors before confirm
7. [ ] **Duplicate detection** — Check against existing production rows before import
8. [ ] **Unit mapping UI** — Show unmapped units and allow manual mapping
9. [ ] **Manufacturer mapping UI** — Show manufacturer mapping preview
10. [ ] **Multi-company support** — Ensure session isolation works with multiple companies

### Commands That Should Work
```bash
# Lint
npx eslint src/pages/MigrationDashboard.tsx src/services/migrationStaging.ts src/services/mappingEngine.ts

# Typecheck
npx tsc --noEmit

# DB migration
supabase db push

# Edge function deploy (optional)
supabase functions deploy tally-import
```

---

## 9. Testing Checklist

- [ ] `supabase db push` applies without errors
- [ ] `/migration` page loads for super_admin
- [ ] File upload works (requires `tally-import` edge function deployed)
- [ ] Parse results show correct counts for 707K line XML
- [ ] Entity selection checkboxes work
- [ ] "Stage for Import" button inserts rows into staging tables
- [ ] Validation errors appear for bad rows
- [ ] Preview shows first 20 rows
- [ ] Error CSV exports correctly
- [ ] Confirm import creates production rows
- [ ] Rollback deletes production rows
- [ ] Migration history tab shows sessions

---

## 10. Contact / Notes

- All staging operations use **direct Supabase client calls** — no edge function required
- XML parsing is the only edge-function-dependent step
- RLS policies are already created in the migration — just needs `supabase db push`
- The 30% failure threshold auto-rollback is implemented in both `confirmStaging` and the edge function
- Batch size for inserts: 200 rows (configurable in `migrationStaging.ts`)

**Last updated**: 2026-05-29 by Kilo
