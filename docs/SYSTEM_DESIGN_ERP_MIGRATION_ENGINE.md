# Pharma ERP Migration Engine — System Design

## Overview

A cloud-native migration engine for importing legacy ERP data (Marg, Tally) into the Dawa Dukan ERP platform. Uses a **staging → validate → confirm** workflow with rollback support.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                    │
│  /migration — MigrationDashboard.tsx                    │
│  Upload → Parse → Stage → Review → Confirm → Done       │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                   SERVICE LAYER                          │
│  migrationStaging.ts — staging workflow client           │
│  mappingEngine.ts — auto-map Tally/Marg → ERP schema    │
│  dataImport.ts — existing CSV/JSON import                │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                 EDGE FUNCTIONS                           │
│  tally-import — Parse Tally/Marg XML → structured data  │
│  migration-staging — Stage, validate, confirm, rollback  │
│  data-import — AI schema detection + generic import      │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  DATABASE (Supabase)                     │
│                                                          │
│  Production Tables:                                      │
│    products, suppliers, customers, inventory_batches      │
│    manufacturers, ledger_groups, ledgers                  │
│    gst_tax_structures                                    │
│                                                          │
│  Staging Tables:                                         │
│    staging_products, staging_ledgers                      │
│    staging_batches, staging_suppliers                     │
│                                                          │
│  Session Tracking:                                       │
│    import_sessions, import_jobs, import_mappings          │
│    import_templates                                      │
│                                                          │
│  All tables have RLS policies (company_id isolation)     │
└─────────────────────────────────────────────────────────┘
```

## Import Workflow

### Step 1: Upload XML
- User uploads Tally/Marg XML (up to 500 MB)
- File is sent to `tally-import` edge function

### Step 2: Parse
- `tally-import` splits XML into TALLYMESSAGE blocks (streaming, memory-safe)
- Extracts: GROUP, LEDGER, STOCKGROUP, UNIT, GODOWN, STOCKITEM
- Classifies ledgers: supplier, customer, bank, cash, GST, tax, expense
- Extracts GST rate details (CGST, SGST, IGST) from STOCKITEM GSTDETAILS
- Returns structured `TallyMastersParseResult`

### Step 3: Stage
- User selects entity types to import (products, ledgers, suppliers, batches)
- Frontend calls `migration-staging` → `write_staging`
- Each entity type is validated and written to staging tables
- Validation: required fields, GST format, MRP < purchase_price checks

### Step 4: Review
- Admin previews staging data via `preview_staging`
- Can export invalid rows as CSV via `export_errors`
- Can resolve individual rows via `resolve_staging`

### Step 5: Confirm
- `confirm_staging` imports in dependency order:
  1. ledger_group → creates ledger_groups from parent_group_name
  2. manufacturer → creates manufacturers from STOCKGROUP names
  3. supplier → upserts into suppliers table
  4. customer → upserts into customers table
  5. product → upserts into products table (with manufacturer_id FK)
  6. batch → upserts into inventory_batches (with product_id/supplier_id FKs)
- 30% failure threshold triggers automatic rollback

### Step 6: Rollback (if needed)
- `rollback_session` deletes all production rows created after session start
- Clears all staging rows for the session
- Marks session as `rolled_back`

## Mapping Engine

### Unit Mapping
Maps Tally shorthand units to full ERP names:
```
TAB → Tablet, CAP → Capsule, INJ → Injection,
BOT → Bottle, GM → Gram, ML → Milliliter, etc.
```

### Ledger Group Mapping
Maps Tally group names to ERP ledger groups:
```
SUNDRY CREDITORS → Sundry Creditors
DUTIES & TAXES → Duties & Taxes
BANK ACCOUNTS → Bank Accounts
etc.
```

### Tax Mapping
Extracts GST rates from STOCKITEM GSTDETAILS.LIST:
- Reads CGST, SGST, IGST from RATEDETAILS.LIST
- Computes effective rate (IGST if present, else CGST+SGST)
- Falls back to RATEOFVAT field

### Manufacturer Mapping
Tally STOCKGROUP names → manufacturers table:
- In Tally, STOCKGROUP represents manufacturer (e.g., "ABBOTT", "CIPLA")
- Each unique STOCKGROUP name becomes a manufacturer entry

## Entity Classification

Ledgers are auto-classified by parent group:

| Parent Group Contains | Ledger Type |
|---|---|
| SUNDRY CREDITOR | supplier |
| SUNDRY DEBTOR | customer |
| BANK | bank |
| CASH | cash |
| DUTIES / TAX | gst |
| PURCHASE/SALES | income |
| EXPENSE | expense |
| FIXED ASSET/CAPITAL | asset |
| LIABILITY/PROVISION | liability |
| (other) | general |

## Database Schema Extensions

New tables (see migration `20260528000000_add_migration_engine.sql`):

| Table | Purpose |
|---|---|
| manufacturers | Normalized manufacturer master |
| ledger_groups | Accounting group hierarchy |
| ledgers | Accounting ledgers (all types) |
| gst_tax_structures | GST rate mapping |
| import_sessions | Migration session tracking |
| staging_products | Product staging |
| staging_ledgers | Ledger staging |
| staging_batches | Batch staging |
| staging_suppliers | Supplier staging |

## APIs

### tally-import (Edge Function)
```
POST /functions/v1/tally-import
Content-Type: multipart/form-data | application/json

Response: TallyMastersParseResult
```

### migration-staging (Edge Function)
```
POST /functions/v1/migration-staging
Body: { stage: "create_session" | "write_staging" | "preview_staging" | "confirm_staging" | "resolve_staging" | "rollback_session" | "export_errors", ... }
```

## Files Created

| File | Purpose |
|---|---|
| `supabase/migrations/20260528000000_add_migration_engine.sql` | DB schema for staging, accounting, manufacturers |
| `supabase/functions/tally-import/index.ts` | Enhanced Tally/Marg XML parser |
| `supabase/functions/migration-staging/index.ts` | Staging workflow edge function |
| `src/services/migrationStaging.ts` | Frontend staging service |
| `src/services/mappingEngine.ts` | Auto-mapping engine |
| `src/pages/MigrationDashboard.tsx` | Admin migration UI |
| `src/types/dataImport.ts` | Updated type definitions |

## Performance Considerations

- XML parsing uses block-splitting (avoids OOM for 700K+ line files)
- Staging writes in batches of 200 rows
- Import confirm processes entities in dependency order
- Upsert operations prevent duplicate imports
- RLS policies enforce company_id isolation

## Security

- All staging tables have RLS policies
- Auth required on all edge functions
- Service role used for staging writes, user JWT for reads
- 30% failure threshold auto-rollback prevents partial corrupted imports
