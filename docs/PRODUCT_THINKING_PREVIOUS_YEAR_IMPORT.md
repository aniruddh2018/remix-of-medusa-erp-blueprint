# Product Thinking Report: Previous-Year Data Import

> **Feature**: Historical / Previous-Year Data Import (MARG / Tally Migration)
> **Status**: Implemented (Phase 1 complete)
> **Date**: 2026-08-20
> **Feature ID**: prev-year-import-v1

---

## 1. Problem Statement

### The "Cold Start" Problem

When a pharmacy or distributor migrates from legacy ERP software (MARG, Tally) to Dawa Dukan, they are not starting from day zero. They have:

- **3–10 years of historical purchase/sales data** that affects current stock valuation
- **Outstanding balances** (sundry creditors/debtors) that must match the old system exactly
- **GST filing continuity** — tax authorities do not accept "we switched software" as an excuse for mismatched GSTR-1/GSTR-3B
- **Opening stock batches** with expiry dates, MRP, and purchase rates that determine current pricing

### Why This Matters

| Stakeholder | Pain if historical data is missing |
|-------------|-----------------------------------|
| **Accountant** | Cannot reconcile closing balances with new opening balances. Trial Balance will never match. |
| **GST Auditor** | Filed returns from previous quarters don't match current system data. Mismatch triggers scrutiny. |
| **Pharmacist** | Current stock MRP/purchase rate is unknown because historical batch data is missing. |
| **Business Owner** | Cannot answer "What was my revenue last year?" — the single most common question asked by banks/CA. |

> **Core insight**: A user who imports only masters (products, ledgers) but not historical transactions will have a **broken ERP** on day one. The Trial Balance will be wrong, stock valuation will be wrong, and GST reconciliation will be impossible.

---

## 2. Target Users (Personas)

### Primary: The Data Migration Operator
- **Who**: Staff accountant, CA, or software vendor's migration team
- **Skill**: Understands MARG/Tally XML exports, knows ledger groups, can identify GST errors
- **Goal**: Import all data from old software so the new system is ready for billing on day one
- **Frustration**: "I uploaded the XML, but now 200 ledgers have errors and I don't know which ones."

### Secondary: The Business Owner / Admin
- **Who**: Pharmacy owner or distributor manager
- **Skill**: Not technical; verifies numbers match the old system
- **Goal**: See a "Closing Balance = Opening Balance" reconciliation report before going live
- **Frustration**: "The system says I owe ₹50,000 to a supplier but my old software says ₹72,000."

### Tertiary: The GST Compliance Officer
- **Who**: External auditor or CA filing GST returns
- **Skill**: Deep GST knowledge; checks for HSN/GSTIN mismatches
- **Goal**: Ensure imported sales/purchase history matches filed GSTR-1/2B/3B
- **Frustration**: "The imported data has wrong GST rates. This will cause a mismatch in the next filing."

---

## 3. Jobs-to-be-Done

### JTBD 1: "Help me import everything from my old software without breaking my current system."
- **Current state**: User has a MARG `.dbf` or Tally `.xml` backup file.
- **Desired state**: All products, ledgers, batches, and transactions are in Dawa Dukan with zero data loss.
- **Anxiety**: "What if I overwrite something that is already working?"

### JTBD 2: "Let me review and fix errors before they become permanent."
- **Current state**: User sees a progress bar, then an error message after 10 minutes.
- **Desired state**: User sees a preview of what will be imported, with clear error counts, and can fix mapping issues before confirming.
- **Anxiety**: "If I import 5,000 ledgers and 200 are wrong, I have to delete everything and start over."

### JTBD 3: "Make my previous year's closing balance match this year's opening balance."
- **Current state**: User closes FY 2024-25 in old software and opens FY 2025-26 in Dawa Dukan.
- **Desired state**: The closing balance of every ledger and every stock batch in the old system becomes the exact opening balance in the new system.
- **Anxiety**: "If the opening balance is wrong, my entire year's accounting will be wrong."

### JTBD 4: "Let me run this import without babysitting the browser."
- **Current state**: Import takes 20–40 minutes. If the user closes the tab, the import is lost and they don't know what was imported vs. what was skipped.
- **Desired state**: User can upload, navigate to another page (Sales, Inventory), and return to see live progress or completed results.
- **Anxiety**: "I have 3,000 invoices to import. I can't stare at a progress bar for 30 minutes."

---

## 4. Feature Design & Decisions

### 4.1 Staging-First Architecture (Never Import Directly to Production)

**Decision**: All imported data lands in `staging_*` tables first. User reviews, then confirms.

**Why**: The #1 support ticket for ERP migrations is "I imported bad data and now my system is corrupted." Staging tables are the safety net.

```
XML Upload → Parse → Staging Tables → Validate → Preview → Confirm → Production Tables
                    ↓
              Review / Fix / Skip
                    ↓
              Rollback (if needed)
```

**Trade-off**: Adds one extra step to the flow. But this step prevents 90% of migration disasters.

### 4.2 Migration Mode Switch (Admin-Controlled)

**Decision**: A per-company toggle (`fy-migration-mode-{companyId}` in localStorage) that the admin must explicitly turn ON.

**Why**: When migration mode is OFF, the day-to-day UI is clean. When ON, the system exposes:
- Historical import affordances
- Backdated entry guards (relaxed for admins)
- Reconciliation tools
- Rollback buttons

**Trade-off**: Requires admin training. But prevents accidental data corruption by regular staff who don't understand historical imports.

### 4.3 Background Import Runner (Survives Page Navigation)

**Decision**: The actual import Promise runs in a module-level singleton (`margImportRunner.ts`), not inside React component state.

**Why**: Importing 3,000 invoices can take 20–40 minutes. If the user navigates to the Sales page to check something, the import must continue. When they return to the Import page, the progress bar and results must be immediately visible.

**Trade-off**: Slightly more complex state management. But the alternative (losing the import on navigation) is unacceptable for a business-critical operation.

### 4.4 Financial Year Isolation

**Decision**: Every imported transaction is tagged with a `financial_year_id`. Previous-year data is never mixed with current-year data in reports.

**Why**: If previous-year sales appear in the current year's Sales Report, the user will panic. The FY filter ensures users see exactly what they expect.

**Trade-off**: Requires creating `financial_years` records for past years. But this is a one-time setup handled automatically by the `fy-backfill` edge function.

### 4.5 Carry-Forward Balance Engine

**Decision**: The `close-financial-year` edge function computes closing balances from `ledger_entries` + `inventory_movements` and writes them as `opening_balance` for the next FY.

**Why**: Users don't manually calculate opening balances. The system computes them from the actual transaction history.

```
Opening Balance (FY N) = Previous Year's Closing Balance
                     = Opening + Σ(Dr) - Σ(Cr) [for ledgers]
                     = Opening + Purchased - Sold [for stock]
```

**Trade-off**: Requires all previous-year transactions to be imported correctly before closing. But this is the only way to guarantee the Trial Balance matches.

### 4.6 Auto-Classification & Mapping

**Decision**: `mappingEngine.ts` automatically classifies MARG/Tally ledgers into ERP roles (supplier, customer, bank, GST, etc.) and maps stock groups to manufacturers.

**Why**: A pharmacy migration may have 2,000+ ledgers. Manual classification would take days. Auto-classification handles 80%+ of cases.

**Examples**:
- `SUNDRY CREDITORS` → `supplier`
- `SUNDRY DEBTORS` → `customer`
- `DUTIES & TAXES` → `tax`
- `TAB` → `Tablet`, `CAP` → `Capsule`

**Trade-off**: 10–15% of classifications may be wrong. The staging review step lets the user fix these before confirming.

---

## 5. User Journey

### Phase 1: Pre-Import (Day 0)
1. Admin enables **Migration Mode** in Financial Year Admin
2. Admin creates missing financial years (e.g., FY 2022-23, 2023-24, 2024-25) if not already present
3. Admin exports XML/DBF from MARG/Tally and saves to local machine

### Phase 2: Import (Day 1–2)
1. **Upload** XML file → browser parses (streaming, handles 500MB+ files)
2. **Stage** → data lands in `staging_products`, `staging_ledgers`, `staging_batches`
3. **Review** → user sees:
   - "1,200 products: 1,180 valid, 20 invalid (missing GST rate)"
   - "850 ledgers: 820 valid, 30 duplicates"
4. **Fix** → user clicks into invalid rows, fixes GSTIN, re-classifies ledgers
5. **Confirm** → system imports to production tables in background
6. **Navigate away** → user goes to Sales page to verify a customer; import continues
7. **Return** → user sees "Import complete: 1,180 products, 820 ledgers imported"

### Phase 3: Reconciliation (Day 3)
1. Admin runs **Reconciliation Preview** → system computes stock shortfalls across FYs
2. Admin reviews cascading opening balance allocations per FY
3. Admin applies reconciliation → `inventory_opening_balances` written per FY

### Phase 4: Year-End Close (Day 4)
1. Admin verifies Trial Balance matches old system
2. Admin runs **Close Financial Year** → closing balances carried forward to new FY
3. Admin disables **Migration Mode** → system returns to normal day-to-day operation

---

## 6. Success Metrics

### Primary Metrics (Business Impact)

| Metric | Target | How Measured |
|--------|--------|--------------|
| **Trial Balance Match Rate** | ≥ 99% | `ledger_opening_balances` sum(DR) == sum(CR) after close |
| **Stock Valuation Accuracy** | ≥ 98% | Reconciliation shortfall ≤ 2% of total stock value |
| **Import Completion Rate** | ≥ 95% | % of users who complete upload → stage → confirm without abandoning |
| **Time to Go-Live** | ≤ 3 days | From first upload to admin disabling Migration Mode |

### Secondary Metrics (UX)

| Metric | Target | How Measured |
|--------|--------|--------------|
| **Staging Error Rate** | ≤ 10% | % of rows that need manual fixing before confirm |
| **Navigation During Import** | ≥ 70% | % of users who navigate away during import and return successfully |
| **Rollback Rate** | ≤ 5% | % of imports that require rollback after confirm |
| **Auto-Classification Accuracy** | ≥ 80% | % of ledgers correctly classified without manual intervention |

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **User imports data without staging review** | Medium | High | Migration Mode requires admin toggle. Confirmation dialog warns: "This cannot be undone easily." |
| **Browser tab closes during import** | High | Medium | Background runner survives navigation. Tab-close guard warns user. Edge functions are stateless and idempotent. |
| **GST rate mismatch in historical data** | Medium | High | Auto-extract GSTDETAILS from XML. Flag mismatches in staging review. Allow manual override. |
| **Duplicate ledgers (old vs. new system)** | High | Medium | Duplicate detection in staging. Auto-map to existing ledgers if name/GSTIN match. |
| **Negative stock after reconciliation** | Medium | High | Reconciliation preview shows shortfalls before applying. User must acknowledge. |
| **Financial year missing for old transaction** | Medium | High | `fy-backfill` auto-creates archived FYs. User sees missing FY count in preview. |
| **Ledger balance not zero (DR ≠ CR)** | Low | Critical | `close-financial-year` edge function validates balance before closing. Blocks close if unbalanced. |

---

## 8. Edge Cases & How We Handle Them

### 8.1 User uploads same XML twice
- **Staging tables** use `session_id` + `company_id` isolation. Re-upload creates a new session.
- Existing staging rows for the old session are ignored. User can delete old sessions from Import History.

### 8.2 User imports 5 years of data but only wants last 2 years
- **Staging preview** shows counts per FY. User can filter by FY range before confirming.
- Future: Add FY range filter to the upload step.

### 8.3 User has ledgers with same name but different GSTINs
- **Staging duplicate detection** checks `(name, gst_number)` tuple, not just name.
- If GSTIN differs, both are marked as valid (different parties).

### 8.4 User closes browser mid-import
- **Background runner** continues the import Promise. On return, the component re-subscribes and shows current state.
- If the import actually failed (network error), the error state is persisted and shown on return.

### 8.5 User wants to undo an import after confirming
- **Rollback** deletes all records created after the session's `created_at` timestamp.
- Scoped to `company_id` and `source_system = 'imported'`. Never touches manually created records.

---

## 9. Future Roadmap

### Phase 2: Incremental Import (Next Quarter)
- **Problem**: User imported FY 2024-25 last month. Now wants to add FY 2023-24.
- **Solution**: Incremental staging that merges with existing data without deleting current FY records.

### Phase 3: Auto-Reconciliation (Next Quarter)
- **Problem**: User must manually run reconciliation after every import.
- **Solution**: Auto-trigger reconciliation preview after confirm. Apply if shortfall < 1%.

### Phase 4: GSTR-1/3B Cross-Validation (Next Year)
- **Problem**: Imported sales data may not match filed GSTR-1.
- **Solution**: Cross-validate imported invoices against GST portal data (via API). Flag mismatches in staging.

### Phase 5: Multi-Company Migration (Next Year)
- **Problem**: A distributor with 5 branch offices needs to migrate all at once.
- **Solution**: Batch upload + centralized reconciliation dashboard.

---

## 10. Design Principles (What We Optimized For)

1. **Safety over Speed** — Staging-first workflow adds friction but prevents corruption.
2. **Transparency over Magic** — User sees every error, every duplicate, every mapping decision.
3. **Background over Blocking** — Imports are long. The UI must not block the user's work.
4. **Reconciliation over Trust** — We don't trust the XML. We reconcile closing = opening before the user goes live.
5. **Admin Control over Automation** — Migration Mode is manual. The admin must consciously enable/disable it.

---

## 11. Open Questions

1. **Should we support Excel (.xlsx) in addition to XML?** Many small pharmacies don't know how to export XML from MARG.
2. **Should we offer a "guided migration" wizard** for first-time users who have never done an ERP migration?
3. **Should we integrate with Tally's native API** (Tally Prime has a JSON API) instead of requiring XML export?
4. **Should we provide a "migration health dashboard"** that shows completeness % per entity (products, ledgers, batches, transactions)?

---

> **Document Owner**: Product Team
> **Review Cycle**: Quarterly (or after every major migration feedback cycle)
