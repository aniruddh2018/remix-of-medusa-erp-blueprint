## Financial Year Management

Adds a proper Indian-style year-end closure so past stock has a home and new years start clean.

### Concepts

- **Financial Year** = Apr 1 → Mar 31. Statuses: `open`, `closed`, `archived`.
- Every transaction row gets stamped with a `financial_year_id`.
- Only the currently `open` FY shows in default lists; older years are viewable via an FY switcher.

### DB changes (single migration)

1. **`financial_years`** — already exists. Add unique `(company_id, start_date)` and ensure only one row per company has `status='open'`.
2. Add nullable `financial_year_id uuid` + FK to the transactional tables:
   `sales_orders`, `sales_order_items`, `purchase_orders`, `purchase_order_items`, `payments`, `credit_notes`, `debit_notes`, `journal_vouchers`, `inventory_transactions`, `prescriptions`. Index each.
3. **`invoice_sequences`** — already keyed per company; add `financial_year_id` to the key so counters reset per FY.
4. `ledger_balances` already has `financial_year` (text) — we'll write the FY name into it during closure.
5. RPC **`create_previous_financial_year(p_company_id, p_start_date, p_end_date, p_name)`**:
   - Insert FY with status `archived`.
   - `UPDATE ... SET financial_year_id = <new_fy>` on every transactional table for rows whose date < the current open FY start (or before `p_end_date`).
   - Snapshot ledger closing balances into `ledger_balances` for that FY.
6. RPC **`close_and_open_financial_year(p_company_id, p_new_start, p_new_end, p_new_name)`**:
   - Mark current open FY as `closed`.
   - Insert new FY as `open`.
   - Copy `ledger_balances.closing_balance` → new FY's `opening_balance` (per ledger).
   - Copy `inventory_batches` with `quantity + loose_quantity > 0` → carry-forward opening batches, tagged with new FY. (Old batches stay put, linked to closed FY.)
   - Reset `invoice_sequences` for the new FY (fresh `next_number = 1` per doc type).
7. RLS: existing company scoping already covers new columns. RPCs are `SECURITY DEFINER` with company-membership check; require `admin` or `owner` role via `has_role`.

### Frontend

- **New page: `src/pages/FinancialYearManagement.tsx`** (routed at `/settings/financial-year`, link from Settings + Admin sidebar).
  - Lists all FYs for the company with status badges.
  - **"Create Previous Year"** dialog — date range + name, calls `create_previous_financial_year`. Shows count of rows that will be reassigned before confirming.
  - **"Close current & open new year"** dialog — shows: ledgers to carry (N), batches to carry (M), current open FY name, new FY name (auto Apr YYYY–Mar YYYY+1). Confirm → runs `close_and_open_financial_year`.
- **FY switcher** in `BusinessContext` — persists the "active FY" in localStorage. Default = the `open` FY.
- **Default query filter** — a small helper `withActiveFy(query)` applied in the main list hooks (Sales, Purchases, Payments, Credit/Debit Notes, Journals, Inventory Ledger) so archived years are hidden by default. Switcher can toggle to a historical FY (read-only banner shown).
- **Invoice numbering** — `invoice_sequences` lookup keyed by active FY; new bills in the new year restart at 1 with the FY prefix from Settings.

### Access

- Gated to `admin` / `owner` via `has_role`. Super admin retains access.

### Out of scope (for this pass)

- Reopening a closed year (add later — will need reverse RPC).
- Automated April 1 rollover (manual trigger for now).
- Cross-FY reports UI (data is there; reporting UI comes next).

### Files to create/edit

- **Migration:** `supabase/migrations/<ts>_financial_year_engine.sql`
- **Create:** `src/pages/FinancialYearManagement.tsx`, `src/services/financialYearService.ts`, `src/components/dialogs/CreatePreviousYearDialog.tsx`, `src/components/dialogs/CloseYearDialog.tsx`
- **Edit:** `src/App.tsx` (route), `src/pages/Settings.tsx` (entry link), `src/contexts/BusinessContext.tsx` (active FY), `src/pages/Sales.tsx`, `src/pages/Purchases.tsx`, `src/pages/Payments.tsx` — add active-FY filter, `src/components/layout/AppSidebar.tsx` (menu entry).
