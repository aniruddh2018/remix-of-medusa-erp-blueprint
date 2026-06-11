# Filing-Ready GST Reports

A new **GST Filing** workspace that turns your sales, purchases, credit/debit notes into reports you can upload directly to the GST portal — or hand to your CA.

## What you'll get

A new tab in **Accounts → GST Filing** (separate from the existing summary view) with:

### 1. Period selector
- **Monthly** (default) — pick month + year
- **Quarterly** (for QRMP filers) — pick Q1/Q2/Q3/Q4 + FY
- Auto-detects financial year from existing financial year tables.

### 2. Four report tabs

**GSTR-1 (Outward supplies)** — built from `sales_orders` + `credit_notes`
- B2B (registered customers, GSTIN present) — invoice-wise
- B2CL (B2C Large — unregistered, value > ₹2.5L, inter-state) — invoice-wise
- B2CS (B2C Small) — rate-wise summary
- CDNR (Credit/Debit notes to registered)
- CDNUR (Credit notes to unregistered)
- HSN summary
- Document series summary

**GSTR-3B (Summary)** — auto-computed
- 3.1 Outward taxable supplies (taxable, IGST, CGST, SGST, cess)
- 3.1.1 Supplies u/s 9(5) (skipped if not applicable)
- 4. Eligible ITC (from purchases)
- 5. Exempt / nil-rated / non-GST inward
- 6.1 Tax payable & paid
- Single-screen, GSTN-form-aligned

**GSTR-2 / Purchase Register** — built from `purchase_orders` + `debit_notes`
- Supplier-wise inward supplies with GSTIN
- Rate-wise ITC breakup
- Export for reconciliation with GSTR-2B

**HSN-wise Summary** — both outward and inward
- HSN, description, UQC, total qty, taxable value, IGST, CGST, SGST, cess
- Sales (Table 12 of GSTR-1) and Purchase variant

### 3. Export formats (every report)
- **GSTN JSON** — schema-compliant, ready to upload to gst.gov.in portal
- **Excel** — matches GST offline utility template (so your CA can open it in the official tool)
- **CSV** — generic spreadsheet
- **PDF** — print-ready review copy with company header, GSTIN, period

## Prerequisites (one-time backend changes)

The current schema is missing a few fields required for filing. We'll add:

- `companies.state_code` (2-digit GST state code, e.g. "27" for Maharashtra) + `companies.gstin` (alias of existing `gst_number`)
- `customers.state_code` + `customers.gstin` (already has `gst_number`)
- `suppliers.state_code`
- `sales_orders.place_of_supply` (state code; defaults to customer's state, falls back to company's state)
- `sales_orders.is_interstate` (computed/stored — drives IGST vs CGST+SGST split)
- `purchase_orders.place_of_supply`, `purchase_orders.is_interstate`, `purchase_orders.supplier_invoice_date`

A small one-time backfill UI in Settings → GST will let you set your company's state and bulk-update existing customers/suppliers by GSTIN prefix (first 2 chars of GSTIN = state code).

## UI placement

- New top-level item in sidebar: **GST Filing** (separate from Accounts), under the Reports group
- Or live as a 5th tab inside `/accounts` next to "GST Summary" — call your preference

## Technical details

**New files**
- `src/pages/GSTFiling.tsx` — main page with period selector + tab layout
- `src/services/gst/gstr1.ts` — builds B2B/B2CL/B2CS/CDNR/HSN buckets
- `src/services/gst/gstr3b.ts` — summary aggregator
- `src/services/gst/purchaseRegister.ts` — inward supplies
- `src/services/gst/hsnSummary.ts` — HSN aggregator (shared)
- `src/services/gst/exporters/gstnJson.ts` — GSTN portal JSON schema
- `src/services/gst/exporters/gstExcel.ts` — offline utility xlsx (uses existing `xlsx` lib pattern)
- `src/services/gst/exporters/gstCsv.ts`
- `src/services/gst/exporters/gstPdf.ts` — opens-in-window pattern like existing `scheduledRegisterPdf.ts`
- `src/components/gst/GSTPeriodPicker.tsx`
- `src/components/gst/BackfillStateCodesDialog.tsx`

**Touched files**
- `src/App.tsx` — add `/gst-filing` route
- `src/components/layout/AppSidebar.tsx` — add nav item (visible only for pharmacy / pharmacy_b2b / b2b_electronics / general_trading — i.e. all GST businesses)
- `src/contexts/BusinessContext.tsx` — add `/gst-filing` to `visiblePages`
- `src/pages/Settings.tsx` — add "GST Setup" section with state code + backfill

**DB migration (single migration)**
- ALTER TABLE adds for the columns listed above
- All numeric defaults; no breaking changes
- RLS unchanged (inherits company_id scope)

**Inter-state logic**
- Compare `place_of_supply` state code with `companies.state_code`
- Same → CGST + SGST (rate split 50/50)
- Different → IGST (full rate)

**Inclusive/exclusive GST** already handled in `BusinessContext.gstInclusive` — reused for back-calculating taxable values.

**Reuses existing patterns**
- React Query for data fetching (matches `Accounts.tsx`)
- `xlsx` lib already in deps (used in data-import)
- PDF-via-window-print pattern from `scheduledRegisterPdf.ts`
- Company info pulled from `companies` table (matches invoice flow)

## Out of scope (for this round)
- E-invoice IRN generation
- E-way bill JSON
- GSTR-9 annual return
- GSTR-2B auto-reconciliation (just the register, not the matching engine)
- Direct API submission to GSTN (you'll upload the JSON manually on the portal)

These can be added later once filing flow is validated.

## Build order
1. DB migration + state-code backfill UI
2. GSTR-1 builder + CSV/PDF (smallest happy-path)
3. GSTN JSON exporter for GSTR-1
4. Excel offline utility format
5. GSTR-3B summary
6. Purchase register
7. HSN summary (shared)
8. QA with a real month of data

Ready to start with step 1 (migration) once you approve.
