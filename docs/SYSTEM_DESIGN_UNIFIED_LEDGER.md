# Unified Ledger System — System Design

## Overview

A centralized ledger architecture inspired by Marg ERP, Tally, SAP Business One, and Oracle ERP. Replaces separate customer/supplier/manufacturer tables with a unified `ledgers` table + `ledger_roles` for multi-role assignment.

## ERD

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   ledger_groups   │     │     ledgers       │     │   ledger_roles   │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ id (PK) UUID      │◄──┐ │ id (PK) UUID      │◄──┐ │ id (PK) UUID      │
│ company_id (FK)   │   │ │ company_id (FK)   │   │ │ ledger_id (FK)    │
│ name TEXT UNIQUE   │   │ │ ledger_group_id   │──►│ │ company_id (FK)   │
│ parent_id (FK→self)│   │ │ name TEXT UNIQUE   │   │ │ role_type ENUM    │
│ group_type ENUM    │   │ │ alias TEXT         │   │ │ is_primary BOOL   │
│ materialized_path  │   │ │ ledger_code TEXT   │   │ │ priority INT      │
│ level INT          │   │ │ opening_balance   │   │ │ metadata JSONB    │
│ sort_order INT     │   │ │ balance_type ENUM │   │ └──────────────────┘
│ affects_stock BOOL │   │ │ current_balance   │   │
│ is_system BOOL     │   │ │ gst_number TEXT    │   │
│ source_system TEXT │   │ │ pan_number TEXT    │   │ ┌──────────────────┐
│ is_active BOOL     │   │ │ tax_id TEXT        │   │ │  ledger_balances  │
└──────────────────┘   │ │ contact_person    │   │ ├──────────────────┤
                       │ │ phone/mobile/email│   │ │ id (PK) UUID      │
                       │ │ address JSONB     │   │ │ ledger_id (FK)    │
                       │ │ city/state/pincode│   │ │ company_id (FK)   │
                       │ │ bank details      │   │ │ financial_year    │
                       │ │ party_type ENUM   │   │ │ opening_balance   │
                       │ │ source_system     │   │ │ current_balance   │
                       │ │ import_metadata   │   │ │ total_debit       │
                       └─┤ is_active BOOL     │   │ │ total_credit      │
                         └──────────────────┘     │ │ closing_balance   │
                                                   │ └──────────────────┘
┌──────────────────────────┐  ┌──────────────────────────┐
│  ledger_import_sessions   │  │   staging_ledger_groups   │
├──────────────────────────┤  ├──────────────────────────┤
│ id (PK) UUID              │  │ id (PK) UUID              │
│ company_id (FK)           │  │ session_id (FK)           │
│ user_id (FK)              │  │ company_id (FK)           │
│ name TEXT                  │  │ name TEXT                  │
│ source_system ENUM         │  │ parent_name TEXT          │
│ status ENUM                │  │ group_type TEXT           │
│ groups_imported/failed     │  │ validation_status ENUM    │  ┌──────────────────┐
│ ledgers_imported/failed    │  │ mapped_group_id UUID      │  │  staging_ledgers   │
│ error_log JSONB            │  └──────────────────────────┘  ├──────────────────┤
└──────────────────────────┘                                 │ id (PK) UUID      │
                                                              │ session_id (FK)   │
                                                              │ name TEXT          │
                                                              │ parent_group_name  │
                                                              │ role_types TEXT[]  │
                                                              │ validation_status  │
                                                              │ mapped_ledger_id   │
                                                              │ mapped_group_id    │
                                                              └──────────────────┘
```

## Ledger Role System

A single ledger can have **multiple roles** — e.g., a party can be both a supplier and a manufacturer:

| Role | Description | Group Assignment |
|------|-------------|-----------------|
| customer | Buyer/debtor | Sundry Debtors |
| supplier | Vendor/creditor | Sundry Creditors |
| manufacturer | Produces goods | Sundry Creditors |
| distributor | Distributes goods | Sundry Creditors |
| employee | Staff payroll | Current Liabilities |
| doctor | Medical professional | Sundry Debtors |
| bank | Bank account | Bank Accounts |
| tax | Tax authority | Duties & Taxes |
| expense | Expense head | Direct/Indirect Expenses |
| income | Income head | Direct/Indirect Incomes |
| asset | Asset account | Fixed/Current Assets |
| liability | Liability account | Current Liabilities |

## API Contracts

### Ledger Groups

```
GET    /api/ledgers/groups?companyId=&parentId=&groupType=&search=
GET    /api/ledgers/groups/tree?companyId=
GET    /api/ledgers/groups/flat?companyId=
GET    /api/ledgers/groups/:id
POST   /api/ledgers/groups           { name, parentId?, groupType?, sortOrder?, affectsStock? }
PUT    /api/ledgers/groups/:id        { name?, parentId?, groupType?, sortOrder?, affectsStock? }
DELETE /api/ledgers/groups/:id        (soft delete: is_active=false)
POST   /api/ledgers/groups/seed       { companyId } — seed default groups
```

### Ledgers

```
GET    /api/ledgers?companyId=&search=&role=&groupId=&isActive=&limit=&offset=
GET    /api/ledgers/:id
GET    /api/ledgers/by-role/:role?companyId=&limit=
POST   /api/ledgers                   { name, roles[], primaryRole?, groupId?, ... }
PUT    /api/ledgers/:id                { name?, roles?, ... }
DELETE /api/ledgers/:id                (soft delete)
```

### Ledger Roles

```
POST   /api/ledgers/:ledgerId/roles    { roleType, isPrimary? }
DELETE /api/ledgers/:ledgerId/roles/:roleType
PUT    /api/ledgers/:ledgerId/roles/sync { roles[], primaryRole? }
```

### Ledger Balances

```
GET    /api/ledgers/:ledgerId/balances/:financialYear
GET    /api/ledgers/balances?companyId=&financialYear=
```

### Import Pipeline

```
POST   /api/ledgers/import/session     { name, sourceSystem, fileName? }
POST   /api/ledgers/import/stage-groups  { sessionId, groups[] }
POST   /api/ledgers/import/stage-ledgers { sessionId, ledgers[] }
GET    /api/ledgers/import/preview/:sessionId
POST   /api/ledgers/import/confirm     { sessionId, dryRun? }
POST   /api/ledgers/import/rollback/:sessionId
```

## Service Layer Design

```
src/services/ledgerService.ts
├── getLedgerGroups(filter)          → LedgerGroup[]
├── getLedgerGroupTree(companyId)   → LedgerGroupNode[]
├── getLedgerGroupFlatList(companyId) → LedgerGroupFlat[]
├── getLedgerGroupById(id)          → LedgerGroup | null
├── createLedgerGroup(companyId, input) → LedgerGroup
├── updateLedgerGroup(id, companyId, input) → LedgerGroup
├── deleteLedgerGroup(id, companyId) → void
├── getLedgers(filter)              → LedgerListResponse
├── getLedgerById(id)               → Ledger | null
├── getLedgersByRole(companyId, role) → Ledger[]
├── createLedger(companyId, input)  → Ledger
├── updateLedger(id, companyId, input) → Ledger
├── deleteLedger(id, companyId)     → void
├── syncLedgerRoles(ledgerId, companyId, roles, primaryRole?) → void
├── addLedgerRole(ledgerId, companyId, roleType, isPrimary?) → LedgerRole
├── removeLedgerRole(ledgerId, roleType) → void
├── getLedgerBalance(ledgerId, financialYear) → LedgerBalance | null
├── getLedgerBalances(companyId, financialYear) → LedgerBalance[]
├── seedDefaultLedgerGroups(companyId) → void
└── getLedgerStats(companyId)       → { totalLedgers, activeLedgers, totalGroups, roleBreakdown }

src/services/ledgerImportService.ts
├── createImportSession(companyId, userId, name, sourceSystem) → LedgerImportSession
├── getImportSession(sessionId)     → LedgerImportSession | null
├── updateSessionStatus(sessionId, status, updates?) → void
├── stageGroups(sessionId, companyId, groups[]) → { staged, duplicates, errors }
├── stageLedgers(sessionId, companyId, ledgers[]) → { staged, duplicates, errors }
├── previewImport(sessionId, companyId) → ImportPreview
├── confirmImport(sessionId, companyId, dryRun?) → ImportResult
├── rollbackImport(sessionId, companyId) → void
├── resolveStagingGroup(stagingId, action, mappedGroupId?) → void
└── resolveStagingLedger(stagingId, action, mappedLedgerId?, mappedGroupId?) → void
```

## Import Workflow (Marg/Tally XML)

```
  ┌─────────┐    ┌──────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐
  │  UPLOAD  │───►│  PARSE   │───►│  STAGE  │───►│  REVIEW  │───►│ CONFIRM  │
  │ XML file │    │ Extract  │    │ Validate │    │ Preview  │    │ Write to │
  │          │    │ groups + │    │ Detect   │    │ Resolve  │    │ prod.    │
  │          │    │ ledgers  │    │ dups     │    │ errors   │    │ tables   │
  └─────────┘    └──────────┘    └─────────┘    └──────────┘    └──────────┘
                                                                      │
                                                            ┌──────────┐
                                                            │ ROLLBACK │
                                                            │ (on fail)│
                                                            └──────────┘
```

### Mapping Rules

| Tally/Marg Group | ERP Group | ERP Type |
|---|---|---|
| SUNDRY CREDITORS | Sundry Creditors | sundry_creditors |
| SUNDRY DEBTORS | Sundry Debtors | sundry_debtors |
| BANK ACCOUNTS | Bank Accounts | bank |
| CASH-IN-HAND | Cash-in-Hand | cash |
| DUTIES & TAXES | Duties & Taxes | tax |
| CAPITAL ACCOUNT | Capital Account | capital |
| DIRECT EXPENSES | Direct Expenses | expenses |
| INDIRECT EXPENSES | Indirect Expenses | expenses |
| DIRECT INCOMES | Direct Incomes | income |
| INDIRECT INCOMES | Indirect Incomes | income |
| FIXED ASSETS | Fixed Assets | assets |
| CURRENT LIABILITIES | Current Liabilities | liabilities |

## Folder Structure

```
src/
├── types/ledger.ts                           ✅ TypeScript types
├── lib/validation/ledgerSchemas.ts           ✅ Zod validation schemas
├── services/
│   ├── ledgerService.ts                      ✅ Repository/CRUD layer
│   ├── ledgerImportService.ts                ✅ Import pipeline service
│   ├── ledgerBridge.ts                       ✅ Dual-write bridge (customer/supplier ↔ ledger)
│   └── mappingEngine.ts                      ✅ Tally/Marg mapping
├── utils/ledgerPdfGenerator.ts               ✅ PDF generation
├── components/
│   ├── LedgerViewTab.tsx                     ✅ Reusable ledger view component
│   ├── forms/CustomerFormDialog.tsx          ✅ Bridge integrated (dual-write)
│   └── forms/SupplierFormDialog.tsx          ✅ Bridge integrated (dual-write)
├── pages/
│   ├── LedgerManagement.tsx                  ✅ Chart of Accounts page
│   ├── Customers.tsx                         ✅ Ledger View tab added
│   ├── Suppliers.tsx                         ✅ Ledger View tab added
│   └── MigrationDashboard.tsx               ✅ Ledger import + Sync Legacy tab
└── components/layout/AppSidebar.tsx          ✅ Sidebar entry

supabase/
├── migrations/
│   ├── 20260528000000_add_migration_engine.sql   ✅ Original schema
│   └── 20260529000000_unified_ledger_system.sql  ✅ Enhanced unified schema
└── functions/
    └── tally-import/index.ts                     ✅ XML parser edge function
```

## UI Wireframes

### Chart of Accounts Page (/ledgers)

```
┌──────────────────────────────────────────────────────────────────┐
│  Chart of Accounts                [Seed Defaults] [+ New Ledger] │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌────────────────────────────┐       │
│  │ 42  │ │ 38  │ │ 12  │ │ customer: 15, supplier: 12 │       │
│  │Total│ │Actv │ │Grps │ │ tax: 5, bank: 3 ...        │       │
│  └─────┘ └─────┘ └─────┘ └────────────────────────────┘       │
│                                                                  │
│  [Ledgers] [Groups]                                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 🔍 Search ledgers...  [Role ▼] [Group ▼]                   ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ Name          │ Roles        │ Group    │ Balance │ Actions ││
│  ├───────────────┼──────────────┼──────────┼─────────┼─────────┤│
│  │ Abbott India  │ [supplier]   │ Creditors│ ₹12,500 │ ✏️ 🗑️  ││
│  │ Cipla Ltd     │ [supplier]   │ Creditors│ ₹8,300  │ ✏️ 🗑️  ││
│  │ Apollo Pharmacy│ [customer]  │ Debtors  │ ₹5,200  │ ✏️ 🗑️  ││
│  │ State Bank    │ [bank]       │ Bank Acct│ ₹1,50,00│ ✏️ 🗑️  ││
│  │ CGST          │ [tax]        │ Duties   │ ₹0      │ ✏️ 🗑️  ││
│  └───────────────┴──────────────┴──────────┴─────────┴─────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### Groups Tab (Tree View)

```
┌─────────────────────────────────────────────────────────────────┐
│  Accounting Groups                                [+ New Group] │
│  ▼ Assets                                             [assets] │
│    ▼ Current Assets                                             │
│      ▶ Sundry Debtors                                          │
│      ▶ Bank Accounts                                           │
│      ▶ Cash-in-Hand                                            │
│    ▶ Fixed Assets                                              │
│  ▼ Liabilities                                       [liab...] │
│    ▼ Current Liabilities                                       │
│      ▶ Sundry Creditors                                        │
│      ▶ Duties & Taxes                                          │
│    ▶ Loans                                                     │
│  ▼ Income                                            [income]  │
│  ▼ Expenses                                          [expense] │
│  ▼ Capital Account                                   [capital] │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Roadmap

### Phase 1: Core Schema & Types ✅ COMPLETE
- [x] SQL migration (`20260529000000_unified_ledger_system.sql`)
  - ledger_groups, ledgers, ledger_roles, ledger_balances
  - staging tables, import sessions
  - RLS policies, triggers, views, helper functions
- [x] TypeScript types (`src/types/ledger.ts`)
- [x] Zod validation schemas (`src/lib/validation/ledgerSchemas.ts`)

### Phase 2: Service Layer ✅ COMPLETE
- [x] Ledger CRUD service (`src/services/ledgerService.ts`)
- [x] Import pipeline service (`src/services/ledgerImportService.ts`)
- [x] Mapping engine (already exists in `src/services/mappingEngine.ts`)

### Phase 3: UI ✅ COMPLETE
- [x] Ledger Management page (`src/pages/LedgerManagement.tsx`)
  - Group tree view with expand/collapse
  - Ledger table with search, role/group filters
  - Create/edit dialogs for groups and ledgers
  - Role assignment (multi-role toggle)
  - Stats dashboard
- [x] Route `/ledgers` added to App.tsx
- [x] Sidebar entry "Chart of Accounts" added

### Phase 4: Deployment ✅ COMPLETE
- [x] Run `supabase db push` to apply migration (ALTER migration `20260529180000`)
- [x] Verify RLS policies work correctly
- [x] Generate Supabase TypeScript types

### Phase 5: Integration ✅ COMPLETE
- [x] Create ledger bridge service (`src/services/ledgerBridge.ts`)
  - `syncCustomerToLedger()` — auto-sync on customer create/update
  - `syncSupplierToLedger()` — auto-sync on supplier create/update
  - `bulkSyncCustomersToLedgers()` / `bulkSyncSuppliersToLedgers()` — bulk migration
- [x] Integrate bridge into CustomerFormDialog (dual-write on create/update)
- [x] Integrate bridge into SupplierFormDialog (dual-write on create/update)
- [x] Add "Ledger View" tab to Customers page (`LedgerViewTab` component)
- [x] Add "Ledger View" tab to Suppliers page (`LedgerViewTab` component)
- [x] Wire up MigrationDashboard to use `ledgerImportService` for ledger entity
- [x] Add "Sync Legacy" tab to MigrationDashboard (bulk sync customers/suppliers)

### Phase 6: Advanced Features ✅ COMPLETE
- [x] Ledger merge/duplicate detection UI
  - `detectDuplicateLedgers()` — finds by GST number match + name normalization
  - `mergeLedgers()` — merges roles, contact, bank, tax into primary; deactivates duplicates
  - Duplicates tab in Chart of Accounts page with merge buttons
- [x] Bulk import from CSV (non-XML)
  - `importLedgersFromCsv()` — parses CSV with papaparse, creates ledgers with role assignment
  - CSV Import tab with file upload, result stats
  - Columns: name*, alias, parentGroupName, ledgerCode, openingBalance, balanceType, gstNumber, panNumber, phone, email, state, city, contactPerson, roleTypes
- [x] Ledger audit trail (who changed what, when)
  - `ledger_audit_log` table with auto-trigger on ledger INSERT/UPDATE/DELETE
  - `getLedgerAuditLog()` — filterable by action, ledger, with pagination
  - Audit tab with action filter and changed fields display
- [x] Financial year closing workflow
  - `close_financial_year()` RPC — finalizes closing balances
  - `openFinancialYear()` — carries forward closing balances as opening balances
  - Year Close tab with Open/Close buttons and result table
- [x] Trial balance / Balance sheet generation
  - `trial_balance()` RPC — groups by ledger group with debit/credit totals
  - Trial Balance tab with financial year selector, totals cards, balanced indicator

## Scalability for 1M+ Ledgers

| Technique | Implementation |
|-----------|---------------|
| Composite indexes | `(company_id, name)`, `(company_id, role_type)`, `(company_id, is_active)` |
| Materialized path | Fast subtree queries via `LIKE path%` |
| Full-text search | GIN index on `to_tsvector(name \|\| alias)` |
| Pagination | All list queries use `range()` with limit/offset |
| Batch inserts | Staging writes in batches of 200 rows |
| RLS | Company isolation enforced at database level |
| View with roles | `ledgers_with_roles` view avoids N+1 queries |

## Best Practices Applied

| Source | Practice |
|--------|----------|
| Tally | Materialized path hierarchy, GROUP/Ledger separation, balance_type debit/credit |
| Marg | Auto-classification from parent group, reserved_name tracking |
| SAP B1 | Multi-role party model (one entity = many business functions) |
| Oracle ERP | Financial year balances, separate closing balance tracking |
