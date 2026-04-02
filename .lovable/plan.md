
# Financial Year Management - Implementation Plan

## Phase 1: Database Foundation
Create core tables:
- `financial_years` (id, company_id, name, start_date, end_date, status [active/closed/archived], closed_by, closed_at)
- `opening_balances` (id, company_id, financial_year_id, balance_type [customer/supplier/inventory], reference_id, amount, quantity, created_at)
- `fy_audit_logs` (id, company_id, financial_year_id, action, details, performed_by, created_at)

Auto-create current FY record during onboarding or first access.

## Phase 2: FY-Aware Transaction Locking
- Add `financial_year_id` reference to `sales_orders`, `purchase_orders`, `payments`, `credit_notes`, `debit_notes`
- Add DB trigger to auto-assign FY based on transaction date
- Add RLS/trigger to block INSERT/UPDATE/DELETE on closed FY transactions

## Phase 3: Year-End Validation & Closure Workflow
- Pre-closure checks: pending invoices, unmatched payments, stock inconsistencies
- Closure action: lock FY, snapshot balances
- Opening balance generation:
  - Customer outstanding = sum(sales) - sum(payments received)
  - Supplier outstanding = sum(purchases) - sum(payments made)
  - Inventory = current stock snapshot (quantity × value per batch)

## Phase 4: UI - Financial Year Settings Page
- Show all FYs with status badges
- "Close Financial Year" button with pre-flight checklist
- Adjustment entry support for post-closure corrections
- Audit log viewer

## Phase 5: Invoice Number Reset & Reporting
- Configurable invoice prefix per FY
- FY filter on all reports
- GST reports scoped to FY

---

**Recommended approach**: Start with Phase 1 (DB tables) + Phase 4 (basic UI), then layer in locking and validation.
