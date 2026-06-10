Here is the rewritten architecture with the **Python OCR service as an add-on layer** instead of direct Vision OCR inside Stage A.

# Invoice Scanner Architecture (OCR Service Enhanced)

## Pipeline

```text
UPLOAD
 → QUEUE
 → WORKER
 → [A: DOCUMENT INTELLIGENCE SERVICE]
        → PREPROCESS
        → OCR
        → LAYOUT RECONSTRUCTION
        → OCR NORMALIZATION
 → [B: EXTRACT]
 → [C: RECONCILE]
 → REVIEW
```

---

# 1. Ingress — Upload & Queue

| Component               | File                               | Role                                                     |
| ----------------------- | ---------------------------------- | -------------------------------------------------------- |
| `invoice_scan_queue`    | migration `phase6`                 | Durable queue with retry, priority and progress tracking |
| `claim_next_scan_job()` | migration `phase6`                 | Atomic job claiming via SKIP LOCKED                      |
| `scan-worker`           | `supabase/functions/scan-worker/`  | Queue consumer processing invoice jobs                   |
| `scan-invoice`          | `supabase/functions/scan-invoice/` | Main orchestration function                              |

---

# 2. Document Intelligence Add-on Layer (Python OCR Service)

Dedicated Python microservice:

```text
FastAPI
 + PaddleOCR
 + OpenCV
 + Layout Engine
```

Purpose:

Separate document understanding from ERP logic.

No supplier DB.

No product matching.

No ERP context.

Pure document intelligence.

---

## Stage A — Document Intelligence Pipeline

### A1. Preprocessing

Function:

```python
preprocess_document()
```

Role:

Normalize incoming images before OCR.

Operations:

```text
grayscale
denoise
adaptive threshold
deskew
perspective correction
contrast enhancement
rotation correction
```

Input:

```text
invoice image
```

Output:

```text
normalized image
```

Example:

Before:

```text
//// DOLO650 TAB ////
```

After:

```text
DOLO 650 TAB
```

Model:

Pure OpenCV.

No LLM.

---

### A2. OCR Engine

Function:

```python
ocr_provider.process()
```

Provider:

```text
PaddleOCR
```

Input:

```text
normalized image
```

Output:

```json
{
  "words":[
    {
      "text":"DOLO",
      "bbox":[10,20,40,40],
      "confidence":0.98
    }
  ]
}
```

Purpose:

Extract visibility only.

No invoice understanding.

No ERP logic.

---

### A3. Layout Reconstruction

Function:

```python
layout_reconstructor.build()
```

Role:

Restore structure from OCR geometry.

Input:

```json
[
 "DOLO",
 "650",
 "10",
 "25"
]
```

Output:

```json
{
 "table":[
   {
      "product":"DOLO 650",
      "qty":10,
      "price":25
   }
 ]
}
```

Capabilities:

* row grouping
* column grouping
* table reconstruction
* reading order recovery
* paragraph reconstruction

No LLM.

Pure spatial logic.

---

### A4. OCR Normalization Layer

Function:

```python
normalize_document()
```

Optional LLM enhancement.

Purpose:

Repair OCR defects.

Example:

OCR:

```text
D0L0 65O TAB
```

Normalized:

```text
DOLO 650 TAB
```

Input:

```json
{
 "ocr":...,
 "layout":...
}
```

Output:

```json
{
 "clean_text":...
}
```

LLM allowed here.

ERP still isolated.

---

# Stage B — Structured Extraction

Function:

```ts
stageB_extractStructured()
```

Model:

Text LLM.

Input:

```json
{
 OCR,
 layout,
 normalized_text
}
```

Output:

```json
{
 supplier:"ABC Pharma",
 invoice_number:"INV123",
 line_items:[],
 totals:{}
}
```

Responsibilities:

* supplier extraction
* invoice metadata
* tax extraction
* line item interpretation
* GST parsing
* semantic normalization

ERP data still blocked.

Principle:

LLM extracts invoice reality.

Not ERP guesses.

---

# Stage C — Product Reconciliation

Function:

```ts
stageC_reconcileProducts()
```

Pure deterministic code.

Input:

```json
{
 extracted_invoice,
 ERP_context
}
```

Output:

```json
{
 matched_products,
 confidence,
 flags
}
```

Flow:

```text
Line Item
 → exact
 → alias
 → embedding search
 → fingerprint
 → fuzzy
```

Existing system retained unchanged.

---

# Product Matching Engine

```text
Line Item
 → exact?
 → alias?
 → embed?
 → pgvector top10
 → strength/form filters
 → fingerprint
 → fuzzy
 → result
```

Components remain unchanged:

| Component                      | Role                  |
| ------------------------------ | --------------------- |
| `find_best_product_match()`    | Matching pipeline     |
| `batch_match_products()`       | Bulk matching         |
| `product_embeddings`           | HNSW vector storage   |
| `generate-product-embeddings`  | Embedding updates     |
| `parse_product_text()`         | Product normalization |
| `compute_hybrid_match_score()` | Hybrid ranking        |

---

# Safety & Validation

Validation remains ERP-side.

Functions:

```text
detectAnomalies()
checkHallucination()
Zod validation
```

Checks:

```text
GST > 40%
negative qty
expiry mismatch
MRP anomalies
hallucinated products
```

---

# Edge Function Map

```text
scan-invoice/
    Orchestrator

scan-worker/
    Queue consumer

document-intelligence-service/
    Python OCR microservice:
        preprocessing
        OCR
        layout reconstruction
        normalization

generate-product-embeddings/
    Embedding backfill

embed-text/
    Vector utility
```

---

# Final Architecture Flow

```text
UPLOAD
 → QUEUE
 → WORKER
 → DOCUMENT INTELLIGENCE SERVICE
        → PREPROCESS
        → OCR
        → LAYOUT
        → NORMALIZATION
 → STRUCTURED EXTRACTION
 → PRODUCT RECONCILIATION
 → VALIDATION
 → REVIEW
```

# Key Principles

1. OCR service is infrastructure, not ERP logic
2. Geometry preserved before semantics
3. Layout reconstructed before extraction
4. LLM assists interpretation, not visibility
5. ERP matching remains deterministic
6. Existing reconciliation engine preserved
7. OCR service reusable for invoices, prescriptions and receipts
8. Document intelligence separated from business workflows
