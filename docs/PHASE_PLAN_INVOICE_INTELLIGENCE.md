# Invoice Intelligence System — Phase Plan & Progress Tracker

## ✅ PHASE 1 — STOP WRONG MATCHES
Status: COMPLETE

- [x] 1. Remove product DB stuffing from prompt (EXISTING PRODUCTS + prefer canonical names)
- [x] 2. Disable auto-mapping for semantic matches (only exact/alias auto-accept)
- [x] 3. Add confidence tiers (semantic≤85, fingerprint≤90, fuzzy≤85, needs_review flag)
- [x] 4. Add explainability (matching_details with method, raw_confidence, capped_confidence, auto_accepted)

Files changed:
- `supabase/functions/scan-invoice/index.ts` — prompt cleanup + tiered matching
- `src/pages/ScanInvoice.tsx` — needs_review flag + matching_details display

---

## 🔵 PHASE 2 — PROPER PRODUCT MATCHING
Status: COMPLETE

### 2.1 Build product normalization pipeline

- [x] 2.1a Create `parse_product_text(input_text TEXT)` → JSONB function
  Parses raw text like "DOLO 650 TAB" into:
  ```json
  {"brand":"dolo","strength_value":650,"strength_unit":"mg","strength_str":"650mg","form":"tablet","pack_size":null}
  ```
  Rules: brand=first word(s) before number, strength=number+unit, form=known keyword, pack_size=number+unit before form

- [x] 2.1b Create migration: `20260515000000_phase2_product_normalization.sql`
  - `parse_product_text` function ✓
  - `compute_hybrid_match_score` function (weighted scoring) ✓
  - Trigger to auto-populate fingerprint/brand/strength/form on product insert/update ✓
  - Backfill existing products: UPDATE products SET brand/strength/form/fingerprint = parse_product_text(name) ✓

### 2.2 Add deterministic filters BEFORE vector search

- [x] 2.2a Rewrite `find_best_product_match` to:
  1. Parse extracted name → structured fields ✓
  2. After alias step, filter vector search: `WHERE (strength = parsed_strength_str OR strength IS NULL) AND (form = parsed_form OR form IS NULL)` ✓
  3. Falls back to unfiltered search if no candidates match ✓

### 2.3 Build proper hybrid scoring

- [x] 2.3a Create `compute_hybrid_match_score` function with weights:
  | Feature           | Weight |
  | ----------------- | ------ |
  | Strength match    | 30     |
  | Form match        | 20     |
  | Token overlap     | 5      |
  | Vector similarity | 5      |
  Max non-alias score: 60. Alias+vector bonus: +5 more. Forceful, deterministic.

- [x] 2.3b Use hybrid score instead of raw cosine distance in semantic match step ✓

### Files created/modified:
- NEW: `supabase/migrations/20260515000000_phase2_product_normalization.sql` — parser, scorer, updated RPC, trigger, backfill
- MODIFIED: `find_best_product_match` replaced via CREATE OR REPLACE in new migration

---

## ✅ PHASE 3 — REAL RAG ARCHITECTURE
Status: COMPLETE

- [x] 8. Create `product_embeddings` table (separate from products)
- [x] 9. Build retrieval pipeline: normalize → embed → pgvector top-10 → hard filter → score → result
- [x] Remove per-scan embedding generation from edge function (move to product save trigger)

Files created/modified:
- NEW: `supabase/migrations/20260515010000_phase3_product_embeddings.sql` — table, index, data migration, trigger, RLS, updated `find_best_product_match`
- NEW: `supabase/functions/generate-product-embeddings/index.ts` — batch embedding generation edge function
- MODIFIED: `src/pages/Products.tsx` — write embeddings to `product_embeddings` table
- MODIFIED: `src/pages/ScanInvoice.tsx` — write embeddings to `product_embeddings` table

---

## ✅ PHASE 4 — EXTRACTION PIPELINE REFACTOR
Status: COMPLETE

- [x] 10. Split extraction into stages (OCR+Layout → Structured Extraction → Reconciliation)
- [x] 10a. Stage A: OCR + Layout (vision model extracts text and structure in one call)
- [x] 10b. Stage B: Structured extraction (LLM converts OCR → JSON, NO ERP logic)
- [x] 10c. Stage C: Product reconciliation (pure code: match, validate, flag)

Files modified:
- REFACTORED: `supabase/functions/scan-invoice/index.ts` — split monolithic mega-prompt into 4 stages

---

## ✅ PHASE 5 — LEARNING SYSTEM
Status: COMPLETE

- [x] 11. Expand vendor alias intelligence (frequency, approval, confidence history)
- [x] 12. Supplier-specific templates (column coordinates, invoice structure, table patterns)

Files created/modified:
- NEW: `supabase/migrations/20260515020000_phase5_learning_system.sql` — alias tracking, auto-approval, supplier template enhancement, column mapping learning
- MODIFIED: `supabase/functions/scan-invoice/index.ts` — calls `record_alias_match` for alias matches

---

## ✅ PHASE 6 — PERFORMANCE + SCALE
Status: COMPLETE

- [x] 13. Parallelize downloads (Promise.all)
- [x] 14. Batch matching (1 bulk SQL function instead of N RPC calls)
- [x] 15. Queue architecture (upload → queue → worker → extract → match → review)

Files created/modified:
- NEW: `supabase/migrations/20260515030000_phase6_performance_scale.sql` — `batch_match_products` RPC, `invoice_scan_queue` table, queue management functions
- NEW: `supabase/functions/scan-worker/index.ts` — async queue worker that claims and processes jobs
- MODIFIED: `supabase/functions/scan-invoice/index.ts` — parallel downloads, single batch RPC call replacing N individual calls

---

## ⬜ PHASE 7 — SAFETY
Status: COMPLETE

- [x] 16. Add Zod schema validation (dates, quantities, GST, totals) — ExtractedInvoiceSchema + LineItemSchema
- [x] 17. Add anomaly detection (GST > 40%, negative quantity, expiry before invoice date, MRP < purchase price)
- [x] 18. Add hallucination protection (mark low confidence if product name not visible in OCR raw_text)
- [x] Validation results returned in response as `_validation` object

---

## ⬜ PHASE 8 — FUTURE ADVANCED
Status: NOT STARTED

- [ ] 19. Fine-tuned invoice model (after enough data)
- [ ] 20. Vision-language models (Mistral AI OCR, OpenAI vision, etc.)

---

## Pending Changes Tracking

| Change | Phase | Priority | Status |
|--------|-------|----------|--------|
| Parse product text function | 2 | High | ✅ Done |
| Hybrid scoring function | 2 | High | ✅ Done |
| Deterministic filters in RPC | 2 | High | ✅ Done |
| Auto-populate fingerprint trigger | 2 | Medium | ✅ Done |
| Backfill existing products | 2 | Medium | ✅ Done |
| Zod validation in edge function | 7 | Critical | ✅ Done |
| Anomaly detection | 7 | Critical | ✅ Done |
| Hallucination protection | 7 | Critical | ✅ Done |
| Product embeddings table | 3 | High | ✅ Done |
| Separate OCR stage | 4 | High | ✅ Done |
| Parallel downloads | 6 | Medium | ✅ Done |
| Batch matching RPC | 6 | Medium | ✅ Done |
| Vendor alias intelligence | 5 | High | ✅ Done |
| Supplier-specific templates | 5 | Medium | ✅ Done |
| Queue architecture | 6 | Medium | ✅ Done |
