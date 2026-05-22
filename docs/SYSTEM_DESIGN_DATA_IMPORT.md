# AI-Powered ERP Data Import System - System Design

## Overview
An intelligent, AI-powered data import system that enables seamless migration from any external ERP system with different schemas, formats, and data structures. The system uses AI to automatically detect, map, and transform data from source systems into the target ERP schema.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Import Wizard│  │ Schema Mapper│  │ Data Preview │  │ Import History  │ │
│  │ (Step-by-step)│  │ (AI-assisted)│  │ (Validation) │  │ (Audit Trail)   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY LAYER                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    Data Import API (/api/v1/import)                      │ │
│  │  • File Upload (CSV, Excel, JSON, SQL dump)                             │ │
│  │  • Schema Detection (AI-powered)                                        │ │
│  │  • Field Mapping (AI suggestions + manual override)                    │ │
│  │  • Data Validation & Transformation                                     │ │
│  │  • Preview & Confirm                                                    │ │
│  │  • Bulk Import with Transaction Rollback                                │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AI PROCESSING LAYER                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    SCHEMA DETECTION ENGINE                           │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Format Detect│  │ Column Detect│  │ Type Inference│               │    │
│  │  │ (CSV/JSON/SQL)│  │ (Header/Key) │  │ (AI + Heuristics)│            │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    AI FIELD MAPPING ENGINE                           │    │
│  │                                                                      │    │
│  │  Input: Source columns + Target schema                              │    │
│  │  Process:                                                            │    │
│  │    1. Semantic similarity matching (LLM embeddings)                  │    │
│  │    2. Pattern recognition (email, phone, GST, dates)                │    │
│  │    3. Context-aware mapping (business_type: pharmacy/electronics)    │    │
│  │    4. Confidence scoring (0-100%)                                    │    │
│  │                                                                      │    │
│  │  Output: Mapping rules with confidence scores                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    DATA TRANSFORMATION ENGINE                        │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Type Casting │  │ Format Norm  │  │ Value Transform│              │    │
│  │  │ (String→Num) │  │ (Date formats)│  │ (Enums/Units) │               │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Lookup Resol │  │ Derive Fields│  │ Validate     │                │    │
│  │  │ (FK matching)│  │ (Calc fields) │  │ (Constraints)│               │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VALIDATION LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    BUSINESS RULE VALIDATOR                          │    │
│  │                                                                      │    │
│  │  Validation Rules:                                                   │    │
│  │  • Required fields (name, manufacturer, etc.)                      │    │
│  │  • Data type constraints (decimal precision, integer ranges)        │    │
│  │  • Enum validation (drug_schedule, order_status)                    │    │
│  │  • Referential integrity (FKs exist)                                │    │
│  │  • Business logic (MRP > purchase_price, expiry > today)            │    │
│  │  • Duplicate detection (same product + batch)                       │    │
│  │  • GST format validation (15 digits, pattern)                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    DATA QUALITY SCORER                             │    │
│  │                                                                      │    │
│  │  Quality Metrics:                                                    │    │
│  │  • Completeness (% of required fields filled)                       │    │
│  │  • Accuracy (% of valid values)                                     │    │
│  │  • Consistency (format uniformity)                                  │    │
│  │  • Uniqueness (duplicate detection)                                  │    │
│  │                                                                      │    │
│  │  Overall Score: 0-100% with recommendations                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           IMPORT EXECUTION LAYER                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    TRANSACTION MANAGER                              │    │
│  │                                                                      │    │
│  │  Import Strategy:                                                    │    │
│  │  • Dry Run (validation only, no DB writes)                          │    │
│  │  • Preview Mode (show what will be imported)                        │    │
│  │  • Live Import (with transaction rollback on error)                 │    │
│  │  • Batch Processing (1000 records per batch)                        │    │
│  │  • Progress Tracking (real-time status)                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    DEPENDENCY RESOLVER                               │    │
│  │                                                                      │    │
│  │  Import Order (topological sort):                                   │    │
│  │  1. Companies (if multi-tenant import)                               │    │
│  │  2. Suppliers                                                       │    │
│  │  3. Products                                                        │    │
│  │  4. Customers                                                       │    │
│  │  5. Inventory Batches                                                │    │
│  │  6. Purchase Orders + Items                                         │    │
│  │  7. Sales Orders + Items                                            │    │
│  │  8. Payments                                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER (Supabase)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    TARGET SCHEMA                                     │    │
│  │                                                                      │    │
│  │  Core Tables:                                                        │    │
│  │  • companies, profiles, user_roles                                   │    │
│  │  • suppliers, customers                                             │    │
│  │  • products, inventory_batches                                      │    │
│  │  • purchase_orders, purchase_order_items                            │    │
│  │  • sales_orders, sales_order_items                                 │    │
│  │  • payments, payments_sales                                         │    │
│  │  • scheduled_drug_register                                          │    │
│  │                                                                      │    │
│  │  Import Metadata Tables:                                            │    │
│  │  • import_jobs (audit trail of each import)                         │    │
│  │  • import_mappings (saved mapping configurations)                   │    │
│  │  • import_validations (validation results per job)                  │    │
│  │  • import_templates (reusable import configs)                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Specifications

### 1. Schema Detection Engine

```typescript
interface SourceSchema {
  format: 'csv' | 'excel' | 'json' | 'sql' | 'api';
  encoding?: string;
  delimiter?: string; // for CSV
  sheets?: string[];  // for Excel
  
  columns: ColumnInfo[];
  sampleRows: Record<string, any>[];
  rowCount: number;
  
  detectedEntityType?: 'products' | 'suppliers' | 'customers' | 'orders' | 'inventory';
  confidence: number; // 0-100
}

interface ColumnInfo {
  name: string;
  index: number;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'enum';
  nullable: boolean;
  unique: boolean;
  sampleValues: any[];
  pattern?: string; // regex pattern detected
  semanticType?: 'email' | 'phone' | 'gst' | 'url' | 'currency' | 'percentage';
}

// Detection Process:
// 1. Parse file (CSV parser, Excel parser, JSON parser)
// 2. Extract headers/columns
// 3. Analyze sample data (first 100 rows)
// 4. Infer data types (heuristics + AI)
// 5. Detect patterns (regex for email, phone, GST)
// 6. Classify entity type (LLM: "This looks like product data because...")
// 7. Return schema with confidence score
```

### 2. AI Field Mapping Engine

```typescript
interface MappingRule {
  sourceColumn: string;
  targetField: string;
  confidence: number; // 0-100
  transformation?: TransformationRule;
  requiresLookup?: boolean; // needs FK resolution
  notes?: string; // AI explanation
}

interface MappingConfiguration {
  entityType: 'products' | 'suppliers' | 'customers' | 'orders' | 'inventory';
  sourceSchema: SourceSchema;
  targetSchema: TargetSchema;
  mappings: MappingRule[];
  unmappedSource: string[];
  unmappedTarget: string[];
  overallConfidence: number;
  
  // AI suggestions
  aiSuggestions?: {
    detectedERP?: string; // "SAP", "Oracle", "Tally", "QuickBooks"
    recommendedActions?: string[];
    potentialIssues?: string[];
  };
}

interface TransformationRule {
  type: 'cast' | 'format' | 'lookup' | 'derive' | 'enum_map' | 'concat' | 'split';
  params: Record<string, any>;
}

// Mapping Process:
// 1. Get target schema for entity type
// 2. Use LLM to generate initial mappings:
//    - Compare column names (semantic similarity)
//    - Compare sample values (pattern matching)
//    - Consider business context (pharmacy vs electronics)
// 3. Apply confidence scoring:
//    - Exact name match: 95%
//    - Semantic match (product_name → name): 80%
//    - Pattern match (email detected → email field): 70%
//    - Fuzzy match: 50%
// 4. Identify unmapped columns (both sides)
// 5. Generate transformation suggestions
// 6. Allow manual override by user
```

### 3. Data Transformation Engine

```typescript
interface TransformResult {
  success: boolean;
  transformedValue: any;
  error?: string;
  warning?: string;
}

// Transformation Types:

// 1. Type Casting
// "123.45" → 123.45 (decimal)
// "2024-01-15" → Date object

// 2. Format Normalization
// "01/15/2024" → "2024-01-15"
// "+91 98765 43210" → "919876543210"
// "GSTIN27ABCDE1234F1Z5" → "27ABCDE1234F1Z5"

// 3. Enum Mapping
// "H" → "schedule_h"
// "Pending" → "pending"
// "1" → true

// 4. Lookup Resolution
// "Acme Corp" → supplier_id (UUID)
// "Paracetamol 500mg" → product_id (UUID)

// 5. Derived Fields
// sale_price = mrp * (1 - discount_percentage)
// total_price = quantity * unit_price

// 6. Concatenation/Splitting
// full_name = first_name + " " + last_name
// [street, city, state] → address

interface TransformationPipeline {
  steps: TransformationStep[];
}

interface TransformationStep {
  field: string;
  rule: TransformationRule;
  onError: 'skip' | 'default' | 'fail';
  defaultValue?: any;
}
```

### 4. Validation Engine

```typescript
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  qualityScore: number;
  summary: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    warningRows: number;
  };
}

interface ValidationError {
  row: number;
  field: string;
  value: any;
  message: string;
  severity: 'critical' | 'error';
  code: string;
}

interface ValidationWarning {
  row: number;
  field: string;
  value: any;
  message: string;
  suggestion?: string;
}

// Validation Rules:

interface ValidationRule {
  field: string;
  type: 'required' | 'type' | 'range' | 'pattern' | 'enum' | 'unique' | 'fk' | 'custom';
  params?: Record<string, any>;
  errorMessage: string;
}

// Example Rules:
const PRODUCT_VALIDATION_RULES = [
  {
    field: 'name',
    type: 'required',
    errorMessage: 'Product name is required'
  },
  {
    field: 'manufacturer',
    type: 'required',
    errorMessage: 'Manufacturer is required'
  },
  {
    field: 'mrp',
    type: 'range',
    params: { min: 0, max: 1000000 },
    errorMessage: 'MRP must be between 0 and 1,000,000'
  },
  {
    field: 'gst_number',
    type: 'pattern',
    params: { pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/ },
    errorMessage: 'Invalid GST format'
  },
  {
    field: 'drug_schedule',
    type: 'enum',
    params: { values: ['none', 'schedule_h', 'schedule_h1', 'schedule_x', 'narcotic'] },
    errorMessage: 'Invalid drug schedule'
  },
  {
    field: 'name',
    type: 'unique',
    params: { scope: ['company_id', 'manufacturer'] },
    errorMessage: 'Product with same name and manufacturer already exists'
  }
];
```

### 5. Import Execution Engine

```typescript
interface ImportJob {
  id: string;
  companyId: string;
  userId: string;
  status: 'pending' | 'analyzing' | 'mapping' | 'validating' | 'previewing' | 'importing' | 'completed' | 'failed' | 'rolled_back';
  
  sourceFile: {
    name: string;
    size: number;
    format: string;
    url: string;
  };
  
  entityType: string;
  mappingConfig: MappingConfiguration;
  
  stats: {
    totalRows: number;
    processedRows: number;
    successRows: number;
    failedRows: number;
    skippedRows: number;
  };
  
  validationResult?: ValidationResult;
  previewData?: any[];
  
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

interface ImportOptions {
  mode: 'dry_run' | 'preview' | 'live';
  batchSize: number;
  stopOnError: boolean;
  skipDuplicates: boolean;
  updateExisting: boolean;
  createMissingLookups: boolean; // auto-create suppliers/customers if not found
}

// Import Process:
// 1. Upload file → storage
// 2. Detect schema → AI analysis
// 3. Generate mappings → AI suggestions
// 4. User reviews/adjusts mappings
// 5. Validate data → run all rules
// 6. Preview results → show sample
// 7. Execute import → batch processing
// 8. Commit/Rollback → transaction management
// 9. Generate report → summary + errors
```

### 6. Database Schema Extensions

```sql
-- Import Jobs (Audit Trail)
CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES auth.users(id),
  
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  entity_type VARCHAR(100) NOT NULL,
  
  source_file_name TEXT NOT NULL,
  source_file_format VARCHAR(20) NOT NULL,
  source_file_size BIGINT NOT NULL,
  source_file_url TEXT,
  
  mapping_config JSONB,
  validation_result JSONB,
  
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  success_rows INTEGER DEFAULT 0,
  failed_rows INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import Mappings (Saved Configurations)
CREATE TABLE import_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  entity_type VARCHAR(100) NOT NULL,
  source_erp_system VARCHAR(100), -- "SAP", "Oracle", "Tally", etc.
  
  mapping_config JSONB NOT NULL,
  transformation_rules JSONB,
  
  is_public BOOLEAN DEFAULT false,
  company_id UUID REFERENCES companies(id),
  created_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import Templates (Reusable Import Configs)
CREATE TABLE import_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  entity_type VARCHAR(100) NOT NULL,
  expected_columns JSONB NOT NULL, -- expected source columns
  mapping_config JSONB NOT NULL,
  validation_rules JSONB,
  
  is_public BOOLEAN DEFAULT false,
  company_id UUID REFERENCES companies(id),
  created_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_jobs_company_isolation ON import_jobs
  FOR ALL USING (company_id = get_user_company_id()) OR is_super_admin();

ALTER TABLE import_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_mappings_company_isolation ON import_mappings
  FOR ALL USING (company_id = get_user_company_id()) OR is_super_admin();

ALTER TABLE import_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_templates_company_isolation ON import_templates
  FOR ALL USING (company_id = get_user_company_id()) OR is_super_admin();
```

### 7. API Endpoints

```typescript
// Core Endpoints

POST /api/v1/import/upload
→ Upload file (CSV, Excel, JSON, SQL dump)
→ Returns: file_id, initial schema detection

POST /api/v1/import/analyze
→ Analyze uploaded file
→ Returns: SourceSchema, detected entity type, confidence

POST /api/v1/import/generate-mappings
→ Generate AI-powered field mappings
→ Returns: MappingConfiguration with confidence scores

POST /api/v1/import/validate
→ Validate data with current mappings
→ Returns: ValidationResult, quality score, error/warning details

POST /api/v1/import/preview
→ Preview transformed data (first 100 rows)
→ Returns: preview data, transformation results

POST /api/v1/import/execute
→ Execute import (dry_run, preview, or live mode)
→ Returns: ImportJob with real-time progress

GET  /api/v1/import/jobs/:id
→ Get import job status and details

GET  /api/v1/import/jobs
→ List import jobs for company (with filters)

POST /api/v1/import/mappings
→ Save mapping configuration as template

GET  /api/v1/import/mappings
→ List saved mapping templates

POST /api/v1/import/rollback/:id
→ Rollback a failed import (if within time window)

GET  /api/v1/import/schema/:entity
→ Get target schema for entity type (for mapping UI)
```

### 8. UI Components

```typescript
// Main Components:

// 1. ImportWizard
// - Step-by-step guided import process
// - Steps: Upload → Analyze → Map → Validate → Preview → Import
// - Progress indicator
// - Back/Next navigation

// 2. FileUploader
// - Drag & drop file upload
// - Format support: CSV, Excel (.xlsx, .xls), JSON, SQL dump
// - File size validation
// - Upload progress

// 3. SchemaAnalyzer
// - Display detected schema
// - Show sample data
// - Entity type detection with confidence
// - Column statistics

// 4. MappingEditor
// - Source columns (left) → Target fields (right)
// - Drag & drop mapping
// - AI suggestions with confidence scores
// - Transformation rule builder
// - Manual override
// - Unmapped column warnings

// 5. TransformationBuilder
// - Visual transformation builder
// - Type: Cast, Format, Lookup, Derive, Enum Map
// - Preview transformation results
// - Error handling options

// 6. ValidationPanel
// - Validation results summary
// - Error/warning list with row numbers
// - Quality score visualization
// - Fix suggestions
// - Export error report

// 7. DataPreview
// - Table view of transformed data
// - Side-by-side: original vs transformed
// - Highlight errors/warnings
// - Pagination
// - Filter by validation status

// 8. ImportProgress
// - Real-time progress bar
// - Batch status
// - Success/failure counts
// - Current row being processed
// - Estimated time remaining

// 9. ImportHistory
// - List of past imports
// - Status, date, row counts
// - View details/download report
// - Re-run import option
// - Rollback option (if available)

// 10. MappingTemplateManager
// - List saved templates
// - Create/edit/delete templates
// - Share templates (public/private)
// - Apply template to new import
```

## Supported Source ERP Systems

### Common ERPs with Pre-built Templates

| ERP System | Format | Complexity | Template Available |
|------------|--------|------------|-------------------|
| **Tally** | CSV/Excel | Medium | ✅ Planned |
| **SAP Business One** | CSV/Excel | High | ✅ Planned |
| **Oracle NetSuite** | CSV/JSON | High | ✅ Planned |
| **Zoho Books** | CSV/Excel | Medium | ✅ Planned |
| **QuickBooks** | CSV/Excel | Medium | ✅ Planned |
| **Odoo** | CSV/SQL | Medium | ✅ Planned |
| **ERPNext** | CSV/JSON | Medium | ✅ Planned |
| **Custom SQL Database** | SQL dump | High | ✅ Planned |
| **Generic CSV** | CSV | Variable | ✅ Available |

### Format Support Matrix

| Format | Upload | Schema Detection | Mapping | Validation | Import |
|--------|--------|------------------|---------|------------|--------|
| CSV | ✅ | ✅ | ✅ | ✅ | ✅ |
| Excel (.xlsx, .xls) | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON | ✅ | ✅ | ✅ | ✅ | ✅ |
| SQL Dump | ✅ | ✅ | ✅ | ✅ | ✅ |
| XML | 🔄 | 🔄 | 🔄 | 🔄 | 🔄 |

## Implementation Phases

### Phase 1: Core Import Engine (Week 1-2)
- File upload and parsing (CSV, Excel, JSON)
- Schema detection engine (heuristic-based)
- Basic field mapping (manual)
- Data validation framework
- Simple import execution (single entity type)

### Phase 2: AI-Powered Mapping (Week 3-4)
- LLM integration for schema detection
- AI field mapping with confidence scores
- Transformation engine
- Lookup resolution (FK matching)
- Mapping template system

### Phase 3: Advanced Features (Week 5-6)
- Multi-entity import (dependencies)
- Transaction rollback
- Import history and audit
- Preview mode
- Progress tracking
- Error reporting

### Phase 4: ERP Templates (Week 7-8)
- Pre-built templates for common ERPs
- Template sharing marketplace
- Template versioning
- Community templates
- Template testing

### Phase 5: Advanced AI (Week 9-10)
- Data quality scoring
- AI-powered error fixing suggestions
- Anomaly detection
- Data enrichment (external APIs)
- Intelligent duplicate resolution

## Security Checklist

- [ ] File upload validation (type, size, content)
- [ ] Malware scanning for uploaded files
- [ ] RLS on all import metadata tables
- [ ] Company isolation for all imports
- [ ] Audit logging for all import operations
- [ ] Transaction rollback on errors
- [ ] Rate limiting on import API
- [ ] Super admin only for cross-company imports
- [ ] Data sanitization (SQL injection prevention)
- [ ] PII detection and masking

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React + TypeScript + Tailwind |
| File Parsing | PapaParse (CSV), SheetJS (Excel) |
| AI/LLM | Fireworks AI API (Llama 3.1) |
| Backend | Supabase Edge Functions |
| Database | Supabase (PostgreSQL) |
| Storage | Supabase Storage |
| Validation | Zod schemas |
| Transformation | Lodash + custom transformers |

## Cost Considerations

- **LLM API Costs**: ~$0.001 per mapping generation (small)
- **Storage**: Supabase Storage ($0.021/GB/month)
- **Edge Functions**: Included in Supabase tier
- **Estimated Cost per 1000 imports**: <$5 (mostly LLM + storage)

## Performance Targets

- **Schema Detection**: < 5 seconds for 10K rows
- **Mapping Generation**: < 10 seconds (AI call)
- **Validation**: < 30 seconds for 10K rows
- **Import Speed**: 1000 rows/second
- **Preview Generation**: < 5 seconds

---

# IMPLEMENTATION PROGRESS TRACKER

> **AGENT HANDOFF RULE**: When continuing this work, READ this doc first and check off completed items. Update status at the bottom.

## Phase 1: Core Import Engine

### 1.1 Database Schema
- [ ] Create `import_jobs` table with RLS
- [ ] Create `import_mappings` table with RLS
- [ ] Create `import_templates` table with RLS
- [ ] Add helper functions for import operations

### 1.2 File Upload & Parsing
- [ ] Create file upload endpoint
- [ ] Implement CSV parser (PapaParse)
- [ ] Implement Excel parser (SheetJS)
- [ ] Implement JSON parser
- [ ] Add file validation (type, size, content)

### 1.3 Schema Detection
- [ ] Create schema detection engine
- [ ] Implement column type inference
- [ ] Add pattern detection (email, phone, GST)
- [ ] Add entity type classification (heuristic)

### 1.4 Basic Mapping
- [ ] Create mapping UI component
- [ ] Implement manual field mapping
- [ ] Add transformation rule builder
- [ ] Implement lookup resolution

### 1.5 Validation Framework
- [ ] Create validation rule engine
- [ ] Implement validation rules for each entity
- [ ] Add validation UI component
- [ ] Implement error reporting

### 1.6 Import Execution
- [ ] Create import execution engine
- [ ] Implement batch processing
- [ ] Add transaction management
- [ ] Implement progress tracking

## Phase 2: AI-Powered Mapping

### 2.1 LLM Integration
- [ ] Integrate Fireworks AI API
- [ ] Create AI schema detection
- [ ] Implement AI field mapping
- [ ] Add confidence scoring

### 2.2 Advanced Transformations
- [ ] Implement type casting transformations
- [ ] Add format normalization
- [ ] Implement enum mapping
- [ ] Add derived field calculations

### 2.3 Mapping Templates
- [ ] Create template system
- [ ] Implement template save/load
- [ ] Add template sharing
- [ ] Create template manager UI

## Phase 3: Advanced Features

### 3.1 Multi-Entity Import
- [ ] Implement dependency resolution
- [ ] Add topological sort for import order
- [ ] Implement multi-entity transaction
- [ ] Add cross-entity validation

### 3.2 Import History
- [ ] Create import history UI
- [ ] Implement job status tracking
- [ ] Add import reports
- [ ] Implement rollback functionality

### 3.3 Preview Mode
- [ ] Implement preview generation
- [ ] Add preview UI
- [ ] Implement side-by-side view
- [ ] Add preview filtering

## Phase 4: ERP Templates

### 4.1 Template Engine
- [ ] Create template format specification
- [ ] Implement template parser
- [ ] Add template validator
- [ ] Create template builder UI

### 4.2 Pre-built Templates
- [ ] Create Tally template
- [ ] Create SAP template
- [ ] Create Zoho template
- [ ] Create QuickBooks template

### 4.3 Template Marketplace
- [ ] Implement template sharing
- [ ] Add template rating system
- [ ] Create template search
- [ ] Add community templates

## Phase 5: Advanced AI

### 5.1 Data Quality
- [ ] Implement quality scoring algorithm
- [ ] Add quality metrics dashboard
- [ ] Implement improvement suggestions
- [ ] Add quality trend tracking

### 5.2 Error Resolution
- [ ] Implement AI error fixing suggestions
- [ ] Add auto-fix for common errors
- [ ] Implement smart duplicate resolution
- [ ] Add data enrichment suggestions

---

**Last Updated**: 2026-05-13
**Status**: Planning Phase - Ready for Implementation
**Next Milestone**: Phase 1.1 - Database Schema
