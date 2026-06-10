# Document Intelligence Service — Architecture Execution Plan

## Phase 0 — Foundation & Architecture Contracts

Goal:
Establish stable system boundaries before implementation begins.

### Tasks

☐ Create repository structure

☐ Create Python virtual environment setup

☐ Create requirements.txt

☐ Create environment/config system

☐ Define core architecture principles:

* OCR layer is generic
* document parsers are isolated
* no ERP/business logic in OCR service
* preserve spatial structure at all stages

☐ Define core domain contracts/models:

* BoundingBox
* OCRWord
* OCRLine
* OCRParagraph
* OCRTable
* DocumentPage
* ProcessedDocument
* PipelineContext
* DocumentType
* ProcessingMetadata

☐ Define provider interfaces:

* OCRProvider
* LayoutReconstructionProvider
* DocumentClassifier

☐ Define standardized response schemas

☐ Add structured logging foundation

☐ Add centralized error handling foundation

Deliverable:
Stable architecture contracts and reusable system skeleton.

---

## Phase 1 — Image Processing Foundation

Goal:
Build reusable low-level document preprocessing pipeline.

### Tasks

☐ Implement grayscale conversion

☐ Implement denoise pipeline

☐ Implement adaptive thresholding

☐ Implement sharpening filters

☐ Implement contrast enhancement

☐ Implement skew detection

☐ Implement deskew correction

☐ Implement perspective correction

☐ Implement image normalization utilities

☐ Add preprocessing pipeline abstraction

☐ Add preprocessing debug output support

Deliverable:
Reusable image preprocessing module.

---

## Phase 2 — Orientation & Document Classification

Goal:
Normalize incoming documents before OCR.

### Tasks

☐ Build orientation detection module

☐ Implement automatic rotation correction

☐ Add orientation confidence scoring

☐ Build lightweight document classifier:

* invoice
* prescription
* receipt
* generic

☐ Add document classification metadata

☐ Add fallback classification behavior

Deliverable:
Normalized and classified document input pipeline.

---

## Phase 3 — OCR Engine Abstraction

Goal:
Create reusable OCR infrastructure independent of document type.

### Tasks

☐ Implement OCRProvider interface

☐ Implement PaddleOCRProvider

☐ Add OCR confidence extraction

☐ Preserve bounding boxes

☐ Preserve reading order

☐ Preserve line grouping

☐ Normalize OCR output into internal schemas

☐ Add OCR provider configuration layer

☐ Add placeholder HandwritingOCRProvider interface

☐ Add OCR performance timing hooks

☐ Add OCR failure handling

Deliverable:
Reusable OCR engine layer.

---

## Phase 4 — Layout Reconstruction Engine

Goal:
Transform OCR tokens into structured spatial understanding.

### Tasks

☐ Implement line reconstruction using coordinate clustering

☐ Implement paragraph reconstruction

☐ Implement reading-order reconstruction

☐ Implement table region detection

☐ Implement row grouping

☐ Implement column grouping

☐ Implement table reconstruction heuristics

☐ Add layout confidence scoring

☐ Add visual debugging utilities

☐ Add layout reconstruction metrics

Deliverable:
Structured document geometry reconstruction engine.

---

## Phase 5 — Document Parsing Layer

Goal:
Convert reconstructed layouts into domain-specific structured data.

### Tasks

### Invoice Parser

☐ Extract supplier fields

☐ Extract invoice metadata

☐ Extract totals/taxes

☐ Extract line-item tables

☐ Extract GST/tax structures

☐ Add invoice parsing confidence scoring

### Prescription Parser (Placeholder Architecture)

☐ Create prescription parser structure

☐ Define medicine block extraction interfaces

☐ Define dosage extraction interfaces

☐ Define doctor/patient section interfaces

☐ Add future handwriting pipeline integration points

### Generic Parser

☐ Add fallback generic document parser

Deliverable:
Document-specific parsing layer isolated from OCR engine.

---

## Phase 6 — Pipeline Orchestration Layer

Goal:
Create deterministic document-processing orchestration.

### Tasks

☐ Build PipelineContext state object

☐ Build processing stage abstraction

☐ Connect preprocessing → OCR → layout → parsing pipeline

☐ Add stage-level timing

☐ Add retry-safe execution flow

☐ Add pipeline observability hooks

☐ Add failure-state tracking

☐ Add partial-processing support

☐ Add complexity scoring system:

* blur
* rotation
* OCR confidence
* dense tables
* low readability

☐ Add hybrid routing preparation:

* simple docs → direct extraction
* complex docs → full OCR/layout pipeline

Deliverable:
Reusable orchestration engine.

---

## Phase 7 — API Layer

Goal:
Expose stable processing interfaces.

### Tasks

☐ Build FastAPI app structure

☐ Implement:
POST /documents/process

☐ Implement:
GET /health

☐ Add request validation

☐ Add response schemas

☐ Add async processing support

☐ Add upload handling

☐ Add image URL ingestion

☐ Add API error handling

☐ Add structured API logging

☐ Add OpenAPI documentation

Deliverable:
Stable document-processing API.

---

## Phase 8 — Local Development & Integration

Goal:
Enable reliable local execution and Supabase integration.

### Tasks

☐ Create local development setup guide

☐ Add uvicorn startup scripts

☐ Add environment variable documentation

☐ Create Supabase Edge Function integration example

☐ Create TypeScript fetch integration example

☐ Add local testing workflow

☐ Add sample invoice test set

☐ Add rotated-image test set

☐ Add dense-table test set

Deliverable:
Working local development and integration environment.

---

## Phase 9 — Testing & Validation

Goal:
Stabilize system behavior before production deployment.

### Tasks

☐ Add preprocessing tests

☐ Add OCR normalization tests

☐ Add layout reconstruction tests

☐ Add table extraction tests

☐ Add parser tests

☐ Add end-to-end pipeline tests

☐ Add malformed-image tests

☐ Add low-quality-image tests

☐ Add performance benchmarks

☐ Add regression test dataset

Deliverable:
Validated and testable document intelligence system.

---

## Phase 10 — Future Expansion Preparation

Goal:
Prepare architecture for future scaling without premature complexity.

### Tasks

☐ Prepare handwriting OCR integration points

☐ Prepare alternate OCR provider support

☐ Prepare containerization compatibility

☐ Prepare cloud deployment compatibility

☐ Prepare asynchronous worker compatibility

☐ Add observability expansion points

☐ Add future model-management hooks

Deliverable:
Extensible architecture ready for future growth.

---

# Key Engineering Principles

1. OCR is infrastructure, not business logic

2. Preserve geometry before semantics

3. Layout reconstruction before interpretation

4. Explicit contracts over implicit structures

5. Deterministic processing before AI inference

6. Reusable primitives before document-specific logic

7. Local-first development before deployment optimization

8. Build for extensibility without premature overengineering
