## Marg "List of Items" XLS → Product Auto-Import

Your sample is a Marg `LIST OF ITEMS` report (BIFF .xls, ~47k rows). It uses a non-tabular layout:

```
AKANSHA PHARMACY               <- header (skip)
LIST OF ITEMS                  <- title (skip)
SNo. | ITEM | DESCRIPTION | RATE | M.R.P. | TAX%   <- column header
(NRX)ALPRAZOLAM                <- salt/group header (col 0 only)
1 | ALARK   | 0.25MG  20       | 0 | 13.13 | 5
2 | ALEEZ   | 0.5MG   1*10     | 0 | 18.75 | 5
...
(NRX)DIAZEPAM                  <- next group
```

The DESCRIPTION cell mixes **strength + pack** (`0.25MG 1*10`, `60 ML`, `1*500GM`, `5ML`, `0.3MG/ML 2ML`). We need to split that and derive the conversion (e.g. `1*10` ⇒ 1 strip = 10 tablets).

### Goal
A new "Marg List-of-Items" importer step inside the existing Data Import wizard (`src/components/data-import/*`) that:
1. Accepts `.xls`/`.xlsx`
2. Parses the Marg layout (salt groups + items)
3. Extracts strength, pack, form, conversion, generic name automatically
4. Shows a reviewable preview grid
5. On confirm, upserts into `products` + `product_conversions` scoped to current `company_id`

### Parsing rules

**Row classifier** (run top-to-bottom, keep "current salt"):
- Skip rows where all 6 cols are NaN
- Skip first ~8 rows + any row matching `LIST OF ITEMS`, phone/TIN/address regex, or the column header row (`SNo.` in col 0)
- Salt-group row: col 0 is text, cols 1-5 NaN ⇒ `currentSalt = stripPrefix(text)` (strip leading `(NRX)`, `(H)`, `(SCH-H)`, `(GEN)`, etc., capture them as `schedule`)
- Item row: col 0 numeric ⇒ parse

**Description parser** (regex pipeline on `ITEM + " " + DESCRIPTION` collapsed whitespace):
- `strength`: `/(\d+(?:\.\d+)?)\s*(MG|MCG|GM|G|ML|IU|%|U)(?:\s*\/\s*(\d+(?:\.\d+)?)\s*(MG|ML|G))?/i`
- `pack`: last token, one of
  - `N*M` → `outer=N, inner=M, conversion=M`
  - `\d+ML` / `\d+\s*ML` → liquid, `volume_ml=N`, single unit `Bottle`
  - `\d+GM` / `\d+G` → solid mass, `Tube`/`Pack`
  - bare integer `10`/`20`/`30` → tablets/caps strip count, `conversion=N`
- `form` inference:
  - `ML` + (`DROP|SYRUP|SUSP|SOL`) → drops/syrup
  - `ML` + strength like `MG/ML` → injection if `INJ` else syrup
  - `GM/G` + (`CREAM|OINT|GEL|LOTION`) → cream/oint
  - integer pack + `MG/MCG` strength → tablet (default) or capsule if name contains `CAP`
- `brand` = `ITEM` cell (trim)
- `generic` = `currentSalt`
- `schedule` = captured prefix
- `mrp` = col 4, `purchase_rate` = col 3, `gst` = col 5

**Conversion table** (`product_conversions`):
- `1*10` tablets ⇒ base unit `Tablet`, parent `Strip` (=10 Tablet), grandparent `Box` (=1 Strip) — store factor 10
- `1*500GM` ⇒ base `Gram`, parent `Pack` (=500 Gram)
- `5ML` syrup ⇒ base `ML`, parent `Bottle` (=5 ML)

### UI / Flow

```text
DataImportWizard
 ├─ Step 1: Source select  → add "Marg List-of-Items (.xls)" card
 ├─ Step 2: Parse & Preview
 │    table cols: Salt | Brand | Strength | Form | Pack | Conv | MRP | Rate | GST | ✓
 │    user can edit any cell inline; rows with low-confidence parse flagged amber
 ├─ Step 3: Dedup check (existing products by brand+strength+pack within company)
 └─ Step 4: Confirm → batch upsert products + conversions
```

### Files to add/edit

- `src/lib/import/margListParser.ts` — pure TS parser (input: 2D array, output: `ParsedMargItem[]`)
- `src/lib/import/descriptionExtractor.ts` — regex extractor with unit tests
- `src/components/data-import/MargListPreview.tsx` — editable preview grid
- Extend `src/services/dataImport.ts` with `importMargItems(items, companyId)`
- Extend `src/components/data-import/ImportSourceSelect.tsx` (or current source step) with the new source card
- Reuse existing `xlrd`/`xlsx` reader already used in CSV import (need to confirm — may add `xlsx` npm dep if `.xls` not yet supported; SheetJS `xlsx` handles both BIFF8 .xls and .xlsx)

### Out of scope (per your message)
- No actual data insertion of the sample file — importer only ships the pipeline; you'll upload the real file later.
- No inventory/batch creation (this report has no batch/expiry/stock).
- No supplier mapping.

### Open questions
1. Should the importer create a `drug_generics` master record for each new salt (e.g. `ALPRAZOLAM`) and link products via `generic_id`, matching your existing brand→generic mapping memory? Default: **yes**.
2. Schedule prefixes (`NRX`, `H`, `H1`, `SCH-H`) — store on `products.schedule` column? Confirm column exists or add it.
3. Default form when ambiguous (just a bare integer pack with no MG/ML) — default to **Tablet**, flag amber for review. OK?
