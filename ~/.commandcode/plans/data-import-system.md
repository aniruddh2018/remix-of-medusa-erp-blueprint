# AI-Powered ERP Data Import System — Implementation Plan

## Overview
Build a full 5-phase AI-powered data import system as an integrated ERP module, supporting all 7 core entity types. Replaces the existing `DataImport.tsx` and `csv-import` edge function.

**Reference docs:** `docs/SYSTEM_DESIGN_DATA_IMPORT.md`, `docs/IMPORT_PREVIEW_UI_DESIGN.md`, `docs/STANDALONE_API_SPECIFICATION.md`, `docs/STANDALONE_DATABASE_SCHEMA.md`

## Architecture Decision
- **Integrated module** within `src/`, not a standalone service
- Follows existing layer-based organization: pages/, components/, services/, hooks/, types/
- Single edge function `supabase/functions/data-import/` with staged sub-modules
- Reuses existing AI pipeline pattern from `scan-invoice` (multi-stage with Zod validation)
- Reuses existing keyboard nav system: `data-kb-grid`, `useEnterNavigation`, `FocusContext`

---

## Phase 1: Core Import Engine

### Step 1.1 — Database Migration

**File: `supabase/migrations/YYYYMMDDHHMMSS_add_import_tables.sql`**

Create 3 tables with RLS:

- **`import_jobs`**: Tracks each import operation (company_id, entity_type, file_name, status, total/success/failed rows, mapping_config JSONB, validation_results JSONB, error_log JSONB)
- **`import_mappings`**: Per-field mapping with confidence scoring (job_id, entity_type, source_field, target_field, transformation, confidence, is_ai_generated)
- **`import_templates`**: Reusable mapping templates (company_id nullable=system, name, entity_type, source_system, field_mappings JSONB, transformations JSONB, is_system)

RLS: `company_id = get_user_company_id() OR is_super_admin()` on all tables.

### Step 1.2 — Types Definition

**File: `src/types/dataImport.ts`** (NEW)

Key interfaces:
- `ImportEntityType = 'product' | 'supplier' | 'customer' | 'inventory_batch' | 'purchase_order' | 'sales_order' | 'payment'`
- `DetectedColumn { name, normalizedName, sampleValues, detectedType, nullCount, uniqueCount }`
- `FieldMapping { sourceField, targetField, transformation?, confidence?, isAiGenerated }`
- `ImportJob { id, companyId, entityType, fileName, status, totalRows, successRows, failedRows, mappingConfig, validationResults }`
- `ValidationResult { rowIndex, errors: { field, message, severity }[] }`
- `WizardStep = 'upload' | 'schema' | 'mapping' | 'preview' | 'execute'`
- `ParsedData { headers: string[], rows: Record<string,any>[] }`
- `ENTITY_FIELDS` — target field definitions per entity type (name, type, required)

### Step 1.3 — File Parsers

**File: `src/services/fileParsers.ts`** (NEW)

- `parseCSV(file: File): Promise<ParsedData>` — Split-based parser (upgrade from existing DataImport.tsx). Add PapaParse for quoted-field edge cases.
- `parseExcel(file: File): Promise<ParsedData>` — SheetJS (`xlsx` library, add to deps). `readAsArrayBuffer` → `XLSX.read` → `sheet_to_json`.
- `parseJSON(file: File): Promise<ParsedData>` — `JSON.parse`, normalize to array-of-objects.

All return unified `ParsedData`.

### Step 1.4 — Client-Side Schema Detection

**File: `src/services/dataImport.ts`** (NEW) — function `detectSchemaClient()`

Pure client-side column inference:
- Type detection via regex: email, phone (Indian), GST format, date formats, numeric
- Unique ratio: >90% → likely ID field
- Null ratio: >50% → optional field
- Returns `DetectedColumn[]`

### Step 1.5 — Import Wizard Hook

**File: `src/hooks/useImportWizard.ts`** (NEW)

State machine via `useReducer`:
- State: currentStep, parsedData, detectedColumns, selectedEntity, fieldMappings, validationResults, importJob
- Actions: goToStep, setParsedData, setDetectedColumns, setEntity, setMappings, reset
- Handles wizard step transitions with validation guards

### Step 1.6 — Import Wizard UI Components

**Component directory: `src/components/data-import/`** (NEW)

1. **`ImportWizard.tsx`** — Wizard container with step indicators, keyboard nav wrapper (`data-enter-nav`)
2. **`FileUploadStep.tsx`** — Drag-and-drop file zone, format auto-detection, initial parse preview
3. **`SchemaDetectionStep.tsx`** — Column type display, entity type selector, header row config
4. **`FieldMappingStep.tsx`** — Source→target mapping grid, uses `FieldMapper` per source column
5. **`FieldMapper.tsx`** — Single field row: source column label → target dropdown (filtered by entity) → transform selector → confidence badge (placeholder for Phase 2)
6. **`PreviewTable.tsx`** — Data grid with `data-kb-grid`/`data-kb-row`/`data-kb-cell`. Inline editing, error highlighting per cell, status badges.
7. **`ValidationPreviewStep.tsx`** — Wraps PreviewTable with filter controls (all/valid/errors/warnings), summary header
8. **`ImportExecutionStep.tsx`** — Progress bar, batch status "Processing batch 3/15...", success/fail counts, final result summary

### Step 1.7 — Validation Service

**File: `src/services/importValidators.ts`** (NEW)

Per-entity validation rules (client-side pre-check before sending to edge function):
- Required field check
- Type format check (regex for GST, phone, email, dates)
- Range checks (MRP >= 0, GST 0-100%)
- Returns `ValidationResult[]`

### Step 1.8 — Edge Function (Execute Stage)

**File: `supabase/functions/data-import/index.ts`** (NEW)

Main orchestrator. Accepts `{ stage, company_id, ... }` via JSON body. Routes to stage sub-modules.

**File: `supabase/functions/data-import/stages/execution.ts`** (NEW)

Execution stage:
- Apply field mappings to transform source rows into target fields
- Batch rows into chunks of 100
- For each batch: `SAVEPOINT` → insert → handle errors → `RELEASE` or `ROLLBACK`
- Uses service_role key to bypass RLS
- Returns `{ success_rows, failed_rows, errors: { row, message }[] }`

### Step 1.9 — Rewrite DataImport Page

**File: `src/pages/DataImport.tsx`** — COMPLETE REWRITE

Structure:
```
DataImport (page)
├── PageHeader "Data Import"
├── ImportWizard (from useImportWizard hook)
│   ├── FileUploadStep
│   ├── SchemaDetectionStep
│   ├── FieldMappingStep
│   ├── ValidationPreviewStep
│   └── ImportExecutionStep
└── ImportHistory placeholder card (filled in Phase 3)
```

Keyboard shortcuts via `usePlatformShortcut`: `Alt+N` (next step), `Alt+B` (back), `Alt+R` (reset).

### Step 1.10 — Deprecate Old Code

**File: `supabase/functions/csv-import/index.ts`** — Keep but mark as deprecated via comment at top. New functionality absorbed by `data-import` edge function.

### Phase 1 Verification
1. Upload CSV of products → column detection → manually map fields → preview → execute → verify products in DB
2. Upload Excel with suppliers → same flow → verify
3. Upload JSON with customers → same flow → verify
4. Upload CSV with intentional errors → validation catches them → errors displayed in preview grid
5. Keyboard-only test: Tab through wizard, Enter to advance, Shift+Enter back, Alt+N/B

---

## Phase 2: AI-Powered Mapping

### Step 2.1 — AI Schema Detection (Edge Function)

**File: `supabase/functions/data-import/stages/schemaDetection.ts`** (NEW)

Follows `scan-invoice` Stage B pattern:
- Input: sample of first 20 rows, column headers
- Model: `accounts/fireworks/models/qwen3p6-plus`
- Uses `tools`/`tool_choice` API for structured output
- Zod validation on LLM response
- Returns `{ columns: DetectedColumn[], suggestedEntity, confidence }`

Prompt: "Analyze this data and detect column types, patterns, and the likely ERP entity."

### Step 2.2 — AI Field Mapping (Edge Function)

**File: `supabase/functions/data-import/stages/fieldMapping.ts`** (NEW)

- Input: detected columns + target entity schema
- LLM maps source→target with confidence per mapping
- Returns `FieldMapping[]` with confidence scores

### Step 2.3 — AI Service Integration

**File: `src/services/dataImport.ts`** — ADD functions:
- `detectSchemaAI(rows, companyId)` → calls edge function `{ stage: 'schema_detect' }`
- `suggestMappings(columns, entityType, companyId)` → calls edge function `{ stage: 'field_mapping' }`

### Step 2.4 — Confidence-Based Auto-Accept

**File: `src/components/data-import/ConfidenceBadge.tsx`** (NEW)

Taste-compliant thresholds:
- **99-100**: Green "Auto-matched" — auto-accepted, field locked ✅
- **90-98**: Yellow "Suggested" — pre-selected, user can override ⚠️
- **<90**: Red "Review needed" — highlighted, user must confirm 🔴

### Step 2.5 — Transformation Engine

**File: `supabase/functions/data-import/stages/transformation.ts`** (NEW)

Transform types:
- `type_cast`: string→number, string→date, string→boolean
- `format`: date normalization (DD/MM/YYYY→YYYY-MM-DD), phone standardization
- `enum`: value mapping (e.g., "H"→"schedule_h")
- `lookup`: resolve name→ID via DB (e.g., supplier name→supplier_id)
- `derive`: computed fields (e.g., total=qty*rate)
- `default`: fill missing with default value

### Step 2.6 — Mapping Templates (DB-Backed)

**File: `src/services/importTemplates.ts`** (NEW)

CRUD on `import_templates` table:
- `saveTemplate()` → saves current mappings as named template
- `loadTemplate(id)` → returns field_mappings + transformations
- `listTemplates(entityType?)` → filtered list
- `deleteTemplate(id)`

**File: `src/components/data-import/TemplateSelector.tsx`** (NEW)

Dropdown at top of wizard grouped by: System Templates (read-only) / My Templates.

### Phase 2 Verification
1. Upload CSV with non-standard headers → AI detects schema → confidence badges appear → auto-accept for exact matches → manual override for low-confidence
2. Upload Excel with DD/MM/YYYY dates → AI maps to date field → transformation normalizes to YYYY-MM-DD → preview confirms
3. Upload with lookup field (supplier name) → transformation resolves to supplier ID → verify in preview
4. Save mapping as template → new import → select template → mappings pre-filled

---

## Phase 3: Advanced Features

### Step 3.1 — Multi-Entity Import

**File: `src/components/data-import/EntitySelector.tsx`** (NEW)

- Multi-select entity types
- Dependency graph: `{ inventory_batch: ['product','supplier'], purchase_order: ['supplier'], sales_order: ['customer'] }`
- Wizard loops through entities in dependency order (topological sort)
- Each entity gets its own mapping step

### Step 3.2 — Transaction Rollback

Modify `supabase/functions/data-import/stages/execution.ts`:
- `SAVEPOINT` before each batch
- `ROLLBACK TO SAVEPOINT` on batch error
- `RELEASE SAVEPOINT` on batch success
- Threshold: if >20% rows fail → offer full rollback via new `stage: 'rollback'`
- Job status updated to `rolled_back`

### Step 3.3 — Preview Mode Enhancements

Modify `ValidationPreviewStep.tsx`:
- Side-by-side view: original value vs transformed value
- Changed fields highlighted in yellow
- Toggle "Show only changed rows"

### Step 3.4 — Import History

**File: `src/hooks/useImportHistory.ts`** (NEW)
- Query `import_jobs` table with filters (entity, date range, status)
- Uses `@tanstack/react-query`

**File: `src/components/data-import/ImportHistory.tsx`** (NEW)
- Table: Date, Entity, File, Rows (success/failed), Status badge
- Actions: View details (mappings, errors), Re-import (pre-fills wizard), Download error CSV

### Step 3.5 — Progress Tracking

Modify `ImportExecutionStep.tsx`:
- Poll job status every 500ms via edge function
- Live counters: "Processing batch 3/15... 240/1250 rows"
- Animated progress bar

### Phase 3 Verification
1. Multi-entity: upload suppliers+products → suppliers import first → products reference new supplier IDs
2. 30% error threshold → rollback triggers → DB unchanged → job shows `rolled_back`
3. Import history → past jobs visible → re-import pre-fills wizard
4. Side-by-side preview → changed fields highlighted

---

## Phase 4: ERP Templates

### Step 4.1 — Seed System Templates

**Migration file** to insert system templates into `import_templates` (is_system=true, company_id=NULL):

- `tally_products`: Stock Item Name→name, HSN→hsn_code, Rate→purchase_price, GST%→gst_percentage
- `sap_products`: Material→name, Material Group→category, Gross Price→mrp
- `zoho_customers`: Customer Name→name, Customer Phone→phone, GST Treatment→gst_number
- `quickbooks_customers`: Customer→name, Phone→phone, GST Number→gst_number
- ~12 total templates covering major source systems × common entities

### Step 4.2 — Template Management UI

Modify `TemplateSelector.tsx`:
- Save current mappings as template (name + description dialog)
- Delete own templates
- System templates shown as read-only with lock icon

### Phase 4 Verification
1. Select "Tally Products" template → all mappings pre-filled → review → import
2. Save custom mapping → new import → select it → mappings restore
3. Delete template → verified removed from selector

---

## Phase 5: Advanced AI

### Step 5.1 — Data Quality Scoring

Modify `supabase/functions/data-import/stages/validation.ts`:

Quality score per row (0-100):
- Completeness: % of required fields filled
- Accuracy: values within expected ranges (GST 0-40%, MRP>0)
- Consistency: values match expected patterns
- Uniqueness: duplicate detection within batch
- Overall score displayed as badge per row in PreviewTable

### Step 5.2 — AI Error Fixing Suggestions

**Edge function addition:** For rows with validation errors, call LLM to suggest fixes:
- Format issues (date "15/06/2024"→"2024-06-15") → suggest transformation
- Missing derivable values (total=qty*rate) → suggest computed value
- Out-of-range values (GST 150%) → flag as anomaly, suggest review
- Returns `fix_suggestions` array per row

**File: `src/components/data-import/AiFixSuggestion.tsx`** (NEW)
- Inline popover per error cell
- "Apply Fix" button with keyboard shortcut `Alt+Enter`
- Preview of fix before applying

### Step 5.3 — Anomaly Detection

**File: `src/components/data-import/AnomalyBadge.tsx`** (NEW)
- Warning badge per row for: GST > 40%, negative quantity, expiry before invoice date, MRP < purchase price
- Keyboard-navigable: `data-kb-cell` for grid participation, `tabIndex={0}`

### Phase 5 Verification
1. Quality score visible per row → low-quality rows highlighted → filter by quality
2. AI suggests fix for date format → apply fix → field updates
3. Anomaly badge appears for GST > 40% → click to view details

---

## File Manifest

### NEW Files (28 total)

| # | File | Phase |
|---|------|-------|
| 1 | `supabase/migrations/YYYYMMDDHHMMSS_add_import_tables.sql` | P1 |
| 2 | `src/types/dataImport.ts` | P1 |
| 3 | `src/services/fileParsers.ts` | P1 |
| 4 | `src/services/dataImport.ts` | P1 |
| 5 | `src/services/importValidators.ts` | P1 |
| 6 | `src/services/importTemplates.ts` | P2 |
| 7 | `src/hooks/useImportWizard.ts` | P1 |
| 8 | `src/hooks/useImportHistory.ts` | P3 |
| 9 | `src/hooks/useFieldMapping.ts` | P1 |
| 10 | `src/components/data-import/ImportWizard.tsx` | P1 |
| 11 | `src/components/data-import/FileUploadStep.tsx` | P1 |
| 12 | `src/components/data-import/SchemaDetectionStep.tsx` | P1 |
| 13 | `src/components/data-import/FieldMappingStep.tsx` | P1 |
| 14 | `src/components/data-import/FieldMapper.tsx` | P1 |
| 15 | `src/components/data-import/ValidationPreviewStep.tsx` | P1 |
| 16 | `src/components/data-import/PreviewTable.tsx` | P1 |
| 17 | `src/components/data-import/ImportExecutionStep.tsx` | P1 |
| 18 | `src/components/data-import/ImportHistory.tsx` | P3 |
| 19 | `src/components/data-import/TemplateSelector.tsx` | P2 |
| 20 | `src/components/data-import/EntitySelector.tsx` | P3 |
| 21 | `src/components/data-import/ConfidenceBadge.tsx` | P2 |
| 22 | `src/components/data-import/AnomalyBadge.tsx` | P5 |
| 23 | `src/components/data-import/AiFixSuggestion.tsx` | P5 |
| 24 | `supabase/functions/data-import/index.ts` | P1 |
| 25 | `supabase/functions/data-import/stages/schemaDetection.ts` | P2 |
| 26 | `supabase/functions/data-import/stages/fieldMapping.ts` | P2 |
| 27 | `supabase/functions/data-import/stages/transformation.ts` | P2 |
| 28 | `supabase/functions/data-import/stages/validation.ts` | P1 |
| 29 | `supabase/functions/data-import/stages/execution.ts` | P1 |

### MODIFIED Files (3 total)

| # | File | Change | Phase |
|---|------|--------|-------|
| 30 | `src/pages/DataImport.tsx` | COMPLETE REWRITE — wizard-based page | P1 |
| 31 | `supabase/functions/csv-import/index.ts` | Add deprecation comment | P1 |
| 32 | `src/lib/keyboard/shortcuts-registry.ts` | Add import wizard shortcuts | P1 |

### DEPENDENCIES to ADD
- `xlsx` (SheetJS) — for Excel parsing

---

## Implementation Order

**Do NOT skip phases.** Each phase builds on the previous. Implement in order:

1. **Phase 1** (Core Import Engine) — Foundation. Everything depends on this.
2. **Phase 2** (AI-Powered Mapping) — Adds intelligence on top of Phase 1.
3. **Phase 3** (Advanced Features) — Multi-entity, rollback, history, preview.
4. **Phase 4** (ERP Templates) — Pre-built content, depends on Phase 1-2 mapping system.
5. **Phase 5** (Advanced AI) — Quality scoring, AI fixes, anomaly detection.

### Phase 1 Implementation Order
1. Migration (tables + RLS)
2. Types (`dataImport.ts`)
3. File parsers (`fileParsers.ts`)
4. Client schema detection (`dataImport.ts`)
5. Wizard hook (`useImportWizard.ts`)
6. UI components (ImportWizard → FileUploadStep → SchemaDetectionStep → FieldMappingStep/FieldMapper → PreviewTable → ValidationPreviewStep → ImportExecutionStep)
7. Edge function execution stage (`stages/execution.ts` + `index.ts` orchestrator)
8. Rewrite `DataImport.tsx` page
9. Add dependency: `xlsx`

---

## Taste Rules Applied
- Keyboard-first: all wizard steps, mapping grid, and preview table support keyboard-only navigation
- `data-kb-grid`/`data-kb-row`/`data-kb-cell` on preview table for Excel-like navigation
- `data-enter-nav` on wizard containers, `useEnterNavigation` for form fields
- Confidence tiers: 99-100 auto-accept, 90-98 suggested, <90 manual review
- Zod validation on all LLM-extracted data (never trust raw LLM JSON)
- Split AI extraction into stages (schema detection → field mapping → transformation → validation)
- No LangChain/LangGraph — direct Fireworks API calls
- Follow plan file exactly; mark todos as in_progress
