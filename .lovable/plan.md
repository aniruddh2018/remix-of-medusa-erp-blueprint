
# Financial Year Architecture v2 — Implementation Plan

Replace the "financial_year_id nullable + Create Previous Year scans NULL" model with a date-driven FY Resolver, a canonical accounting transaction layer, FY-scoped opening balances, an inventory movement ledger, import sessions, and a controlled close engine.

Scope answers: **full redesign**, **backfill existing rows**, **backdated writes blocked for staff / allowed for owner+admin with audit**.

---

## Milestones

Delivered in order. Each milestone ends in a shippable state — the app keeps working throughout.

### M1 — Schema foundation (migration only)

New tables, all `company_id`-scoped, RLS via existing `has_role` / `is_super_admin`, GRANTs to `authenticated` + `service_role`.

- `financial_years` — extend with `is_locked BOOLEAN`, `activated_at`, `closed_at`, `closed_by`; status enum widened to `draft | active | closed | archived`.
- `transactions` — canonical accounting header. Cols: `id, company_id, transaction_type, transaction_date, financial_year_id NOT NULL, reference_type, reference_id, posting_status, source, created_by, created_at`. Unique `(reference_type, reference_id)`.
- `ledger_entries` — `transaction_id, financial_year_id, ledger_account_id, entry_date, debit, credit, narration`. Replaces ad-hoc ledger posting.
- `ledger_opening_balances` — `financial_year_id, ledger_account_id, amount, balance_type, source, source_financial_year_id`. Unique `(fy, ledger_account_id)`.
- `inventory_movements` — `transaction_id, financial_year_id, product_id, batch_id, movement_date, movement_type, quantity_in, quantity_out, rate`.
- `inventory_opening_balances` — `financial_year_id, product_id, batch_id, opening_quantity, opening_value, source_financial_year_id`. Unique `(fy, batch_id)`.
- `document_sequences` — `financial_year_id, document_type, prefix, suffix, current_number, padding`. Replaces `invoice_sequences` write path (old table kept read-only for legacy).
- `import_sessions` + `import_rows` — replaces the "tag NULLs after import" flow.
- `financial_year_close_jobs` — async close orchestration.
- `financial_year_unlocks` — timed reopen windows with `approved_by`, `expires_at`.
- `sales_orders.legacy_invoice_number`, `purchase_orders.legacy_invoice_number` — for MARG imports.

Indexes: `(company_id, financial_year_id)`, `(company_id, financial_year_id, transaction_date)`, `(financial_year_id, ledger_account_id)`, `(financial_year_id, product_id)`, `(financial_year_id, batch_id)`.

No writes yet from app code. Existing tables untouched.

### M2 — FY Resolver + Lock Validator + backdated policy

Central service in `src/services/fy/`:

- `resolveFinancialYear(companyId, txDate)` — DB lookup, throws `FinancialYearNotFoundError` on miss. No fallback to "current".
- `validateFinancialYearWritable(fyId, userRoles)` — checks status/is_locked + active unlock window; staff blocked on closed FY, owner/admin allowed with audit row in `fy_audit_logs`.
- `resolveDocumentNumber(fyId, docType)` — atomic increment on `document_sequences`.

Wired into every write path: sales, purchases, payments, credit/debit notes, journal vouchers, stock adjustments, counter sales, opening entries. Backdated attempts show a dialog:
- Staff → hard block with "ask owner to unlock FY".
- Owner/admin → confirmation dialog, proceeds, logged.

Draft rows may keep `financial_year_id = NULL`; posting requires resolution.

### M3 — Dual-post to canonical tables + backfill

Every posted sale/purchase/payment/note now also writes:
- 1 row in `transactions`
- N rows in `ledger_entries` (replaces current inline ledger service)
- N rows in `inventory_movements` (replaces direct `inventory_batches.qty` deltas — batches become permanent master; qty is derived from movements)

One-shot backfill migration:
- Reads `sales_orders`, `purchase_orders`, `payments`, `credit_notes`, `debit_notes`, `journal_vouchers`, `inventory_transactions`, `opening_balances`.
- Resolves FY by `transaction_date` (auto-creates `archived` FY rows for uncovered years using company `fiscal_year_start_month`, default 4).
- Emits `transactions` + `ledger_entries` + `inventory_movements`.
- Seeds `ledger_opening_balances` and `inventory_opening_balances` from existing `opening_balances` + earliest-batch qty.
- Idempotent — safe to re-run.

Current stock display switches to: `inventory_opening_balances + SUM(movements)` per batch. `inventory_batches.quantity` becomes a cached column, refreshable.

### M4 — Import Sessions + MARG rework

Replace `Create Previous Year` and current MARG importers' direct writes:

- Upload → parse into `import_rows` (status PENDING, raw_data JSONB).
- Analyze step: resolve FY per row, group by detected year, offer to auto-create missing archived FYs.
- Review UI: valid / needs-review / invalid counts, per-row error codes.
- Confirm → writes go through the same resolver + `transactions` layer. Imported invoice numbers land in `legacy_invoice_number`; the live `document_sequences` is untouched.
- Rollback = delete by `import_session_id`.

Existing MARG services (`margSalesImport`, `margPurchaseImport`, `margStockImport`, `margPartyMasterImport`, etc.) are refactored to emit `import_rows` instead of direct inserts.

### M5 — Close Engine + FY Switcher polish

- `financial_year_close_jobs` orchestrator (edge function) runs: pre-close validation → lock writes → compute closing balances → insert `ledger_opening_balances` + `inventory_opening_balances` for next FY → create fresh `document_sequences` → mark old FY `closed`, new FY `active`.
- Pre-close checks: debit=credit, no draft JVs, no unresolved imports, negative stock warnings, expired batches warnings.
- Reopen: owner creates `financial_year_unlocks` row with reason + expiry; auto-expires.
- FY switcher already exists — updated to store selection per-user (localStorage stays), show status badges, and drive all list queries through `financial_year_id =` (no more NULL fallbacks).

---

## Technical notes

- All new tables: `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role;` + RLS scoped to `company_id` via existing `user_companies` / `has_role` helpers. No `anon` grants.
- Close job runs as an edge function using `SUPABASE_SERVICE_ROLE_KEY` server-side; client only invokes it.
- `transactions.reference_id` is UUID, `reference_type` an enum — foreign keys are logical, not physical, to avoid coupling to every domain table.
- Backfill migration is a single SQL file with `DO $$ ... $$` blocks; wrapped in a transaction; produces a summary row per entity in a temporary `_fy_backfill_report` table.
- Types file (`src/integrations/supabase/types.ts`) regenerates after each migration approval; UI/service code lands in the same milestone as its migration.
- `financial_year_id` on posted rows becomes `NOT NULL` only at end of M3, after backfill succeeds.

## Risk / rollback

- Each milestone is independently revertible: M1 tables can be dropped; M2 resolver can be feature-flagged; M3 dual-post is additive until we cut reads over.
- Reads switch to new tables only in M3's final step. Until then, current screens keep working against `sales_orders` / `inventory_batches` directly.

## What I need from you before starting

1. Confirm milestone order — or ask me to combine.
2. Confirm the "owner + admin can bypass closed-FY block with audit" role mapping matches your `user_roles` (owner / admin / staff / super_admin).
3. Company fiscal-year start month — default `4` (April) for all existing companies, override per-company later? Yes / choose different.

Once confirmed, I'll start with M1: the schema migration.
