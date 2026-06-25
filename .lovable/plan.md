# MARG Transaction History Importer

Extend Data Import with two new importers that bring legacy MARG history into MedikaRP so users see real customers, invoices and stock flow from day one.

## Scope

1. **Sales History Import** (build now) — from MARG `REPORT_7.XLS` (Bill Wise Sales Statement).
2. **Purchase History Import** (placeholder, build later) — same wizard skeleton, parser stubbed until a sample file is shared.

Both share the same UX: upload → parse → preview with stats → choose target company → confirm → batch insert → result summary with error list.

## Sales file structure (verified against REPORT_7-2.XLS)

```text
Row type            | Col 0           | Col 1                                       | Col 2
--------------------+-----------------+---------------------------------------------+-----------
Shop header (×4)    | shop / address  | -                                           | -
Column header       | BILL NO.        | DESCRIPTION                                 | BILL VALUE
Date marker         | 01-04-2026      | -                                           | -
Bill header         | A000001         | "<phone> <customer name>" + " CASH/CREDIT"  | 1150
Item line (×N)      | -               | "sn  drugcode  NAME  pack  qty  rate"       | "exp batch"
Blank separator     | -               | -                                           | -
... next bill ...
```

- **Bill no.** `A000001` — sequential per FY.
- **Date** rows act as section breaks (`DD-MM-YYYY`).
- **Customer field** holds `phone + name` (or `CASH`, `ONL <amt>`); payment mode is the trailing `CASH/CREDIT` token; bill value is the grand total.
- **Item line** description is whitespace-padded fixed columns: `serial | drug_code | name | pack(1*10 / 10'S / 200ML) | qty(strip:loose like 1:4) | rate`. Column 2 holds `MM/YY` expiry and an optional batch number.

## Mapping to MedikaRP tables

| Source                | Target table          | Notes                                                                       |
|-----------------------|-----------------------|-----------------------------------------------------------------------------|
| Bill header           | `sales_orders`        | invoice_number, sale_date (current date marker), customer_id, total_amount, payment_mode, payment_status (paid if CASH else pending) |
| Customer phone+name   | `customers`           | Auto-create when phone is present; reuse if matched on phone within company |
| Item lines            | `sales_order_items`   | Resolve `product_id` by name (fall back to fuzzy match on `brand`)          |
|                       |                       | quantity = strips * conversion + loose units (use `product_conversions`)    |
|                       |                       | rate = parsed rate; line_total computed                                     |
| Expiry / batch        | `inventory_batches` *(optional toggle)* | Only created if user opts "also create batches", marked as `legacy_import` |

Stock movement: historical sales **do not** decrement live inventory by default. Toggle `affect_inventory` (default OFF) — when ON, the importer writes matching `inventory_transactions` of type `legacy_sale` so reports balance.

## File / code layout

```text
src/services/margSalesParse.ts     # pure parser: File -> ParsedBill[]
src/services/margSalesImport.ts    # ParsedBill[] + companyId -> InsertResult
                                   #   - resolves products (cached by name)
                                   #   - resolves/creates customers (cached by phone)
                                   #   - batches sales_orders + items inserts
src/components/data-import/
   MargSalesImport.tsx             # 5-step UI (upload → preview → options → run → done)
   MargPurchaseImport.tsx          # stub: "Coming soon — drop a sample file"
src/pages/DataImport.tsx           # add two tabs: "MARG Sales", "MARG Purchases"
```

## UI flow (Sales)

1. **Upload** `.xls/.xlsx` (REPORT_7).
2. **Parse in browser** with `xlsx` (already installed). Show stats: total bills, total items, date range, distinct customers, unmatched product count.
3. **Preview table**: first 50 bills, expandable to show items, with a red badge on items whose product couldn't be auto-resolved.
4. **Options**:
   - Target company (super admin dropdown / active company).
   - Default customer when phone is missing (default = "Walk-in").
   - Skip duplicate invoice numbers (default ON — checks `sales_orders.invoice_number` + company).
   - Create missing products? (default OFF — skip line; show count).
   - Affect live inventory? (default OFF).
5. **Run**: batched insert (200 bills/batch) with progress bar, per-row fallback on failure, same defensive pattern as `margMasterImport.ts`.
6. **Done**: counts (bills inserted / skipped duplicates / failed, items inserted, customers created, products unmatched). Downloadable CSV of unmatched lines so the user can fix and re-run.

## Parser rules

- Walk rows top-down keeping `activeDate` (last `DD-MM-YYYY` cell) and `currentBill`.
- New bill when col 0 matches `/^[A-Z]\d{5,}$/`.
- Item line when col 0 is blank, col 1 non-blank, and starts with `\d+\s+\d+\s+`.
- Pack parser: `1*10` → strip×count; `10'S` → loose units; `200ML` → liquid volume — used purely to compute qty from `strip:loose`.
- Qty parser: `"1:4"` → strips=1, loose=4 → total = strips × conversion + loose (conversion looked up from product; fallback 10 for TAB/CAP, 1 otherwise).
- Batch col: split `"10/26 TC24-169"` → expiry `10/2026`, batch `TC24-169`.
- Blank row ends the bill.

## Product resolution

In-memory `Map<UPPER(name), product_id>` pre-loaded per company. On miss, try `ilike` on `name` and `brand`. Cache results to avoid repeat queries. Unresolved → either skip the line (default) or stash in a downloadable `unmatched.csv`.

## Purchase History (later)

Same wizard skeleton already present in `MargPurchaseImport.tsx`. When the user shares a sample MARG purchase report we'll fill in:

- Parser → `ParsedPurchase[]` with supplier, invoice no., date, items, batches, expiry, rates.
- Importer → `purchase_orders` + `purchase_order_items` + `inventory_batches` (purchase **does** create batches; option to also create `inventory_transactions` of type `legacy_purchase`).
- Supplier resolution by GSTIN/phone/name with auto-create.

## Out of scope

- Editing imported invoices (use existing sales edit flow).
- GST recomputation for legacy bills — store rates as-is; bills marked `is_legacy_import = true` so reports can exclude them when needed.
- No new schema: reuses existing `sales_orders`, `sales_order_items`, `customers`, `inventory_batches`, `inventory_transactions`. Only adds a boolean column `is_legacy_import` to `sales_orders` and `purchase_orders` (single migration).
