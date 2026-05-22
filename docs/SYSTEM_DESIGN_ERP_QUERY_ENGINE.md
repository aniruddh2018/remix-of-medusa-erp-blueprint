# ERP Query Engine - System Design

## Overview
A secure, AI-powered natural language query system that allows authorized users to query the entire ERP database, receive formatted/analyzed data, and perform custom calculations.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Chat UI      │  │ Query Builder│  │ Report Viewer│  │ Export Options  │ │
│  │ (Natural Lang)│  │ (Advanced)   │  │ (Charts/Tables)│ (CSV/PDF/API)  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY LAYER                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    Query Engine API (/api/v1/query)                    │ │
│  │  • Rate Limiting (100 req/min per user)                                │ │
│  │  • Authentication (JWT + API Keys)                                    │ │
│  │  • Request Validation (Zod schemas)                                    │ │
│  │  • Query Audit Logging (who, what, when)                               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTHORIZATION LAYER                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐ │
│  │ RBAC Middleware  │  │ Field-Level ACL  │  │ Query Scope Validator      │ │
│  │ (Role-based)     │  │ (Column access)  │  │ (Company/branch isolation) │ │
│  └──────────────────┘  └──────────────────┘  └────────────────────────────┘ │
│                                                                              │
│  Roles: super_admin → All companies, all tables, all fields                  │
│         admin       → Own company, all tables, sensitive fields masked       │
│         manager     → Own company, non-sensitive tables, aggregated only   │
│         staff       → Own company, limited tables, row-level filters         │
│         accountant  → Financial tables only, no customer PII                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            QUERY PROCESSING LAYER                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    NATURAL LANGUAGE PROCESSOR                         │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Intent Parser│  │ Entity Extract│  │ SQL Generator│                │    │
│  │  │ (Llama/LLM)  │  │ (Regex + NLP) │  │ (Safe Builder)│               │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    ADVANCED QUERY BUILDER                           │    │
│  │  • Visual drag-and-drop interface                                   │    │
│  │  • Join suggestions (foreign key detection)                       │    │
│  │  • Filter builder (conditions, ranges, null checks)                 │    │
│  │  • Aggregation builder (group by, having, window functions)       │    │
│  │  • Formula editor (custom calculations)                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    QUERY SECURITY SANITIZER                         │    │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │    │
│  │  │ SQL Injection    │  │ Resource Limits  │  │ Schema Validator │    │    │
│  │  │ Protection       │  │ (Timeout/Memory) │  │ (Allowed tables) │    │    │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘    │    │
│  │                                                                    │    │
│  │  RULES:                                                            │    │
│  │  • No DDL operations (DROP, ALTER, CREATE)                        │    │
│  │  • No system tables (pg_*, information_schema)                     │    │
│  │  • Max 10,000 rows per query (configurable per role)               │    │
│  │  • Query timeout: 30 seconds                                       │    │
│  │  • Read-only operations only                                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA ANALYSIS & FORMATTING LAYER                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    SMART ANALYSIS ENGINE                            │    │
│  │                                                                      │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │    │
│  │  │ Trend        │  │ Anomaly      │  │ Forecast     │  │ Comparison │ │    │
│  │  │ Detection    │  │ Detection    │  │ (Simple)     │  │ Engine     │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘ │    │
│  │                                                                      │    │
│  │  Capabilities:                                                       │    │
│  │  • Auto-detect trends (YoY, MoM, WoW)                               │    │
│  │  • Highlight outliers (>2 std dev)                                  │    │
│  │  • Simple moving average forecasts                                   │    │
│  │  • Compare periods (this month vs last month)                         │    │
│  │  • Calculate growth rates, margins, ratios                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    FORMATTING ENGINE                                │    │
│  │                                                                      │    │
│  │  Output Formats:                                                     │    │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐          │    │
│  │  │ JSON       │ │ Table      │ │ Chart      │ │ Narrative  │          │    │
│  │  │ (API)      │ │ (Markdown) │ │ (Config)   │ │ (AI Summary│          │    │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘          │    │
│  │                                                                      │    │
│  │  Chart Types: bar, line, pie, donut, area, scatter, table            │    │
│  │  AI Narrative: "Sales increased 23% vs last month driven by..."    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    CUSTOM CALCULATION ENGINE                        │    │
│  │                                                                      │    │
│  │  Formula Builder:                                                    │    │
│  │  • Arithmetic: +, -, *, /, %, ^                                      │    │
│  │  • Aggregates: SUM, AVG, COUNT, MIN, MAX, MEDIAN                   │    │
│  │  • Date math: DATEDIFF, DATEADD, EOMONTH                            │    │
│  │  • Financial: MARGIN, MARKUP, ROI, IRR (simplified)                 │    │
│  │  • Conditional: IF, CASE, COALESCE                                  │    │
│  │                                                                      │    │
│  │  Saved Calculations:                                                 │    │
│  │  Users can save custom formulas:                                     │    │
│  │  "Gross Margin % = (revenue - cogs) / revenue * 100"               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER (Supabase)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    DATABASE SCHEMA                                  │    │
│  │                                                                      │    │
│  │  Queryable Tables (with row-level security):                        │    │
│  │  • sales_orders, sales_order_items                                  │    │
│  │  • customers, suppliers                                             │    │
│  │  • products, inventory_batches                                      │    │
│  │  • payments, purchase_orders                                        │    │
│  │  • payments_sales (payment allocations)                             │    │
│  │  • companies (own record only)                                       │    │
│  │  • audit_logs (own company only)                                   │    │
│  │                                                                      │    │
│  │  Query Metadata Tables:                                             │    │
│  │  • query_templates (saved queries per user)                         │    │
│  │  • query_history (audit trail)                                      │    │
│  │  • custom_calculations (user-defined formulas)                      │    │
│  │  • data_favorites (bookmarked queries)                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    MATERIALIZED VIEWS (Performance)                   │    │
│  │                                                                      │    │
│  │  • mv_daily_sales_summary (refreshed hourly)                         │    │
│  │  • mv_monthly_customer_aggregates (refreshed daily)                │    │
│  │  • mv_inventory_status (real-time via triggers)                    │    │
│  │  • mv_outstanding_balances (refreshed every 15 min)                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    ROW LEVEL SECURITY (RLS) POLICIES                │    │
│  │                                                                      │    │
│  │  All queries filtered by:                                           │    │
│  │  • company_id = current_user_company_id()                            │    │
│  │  • is_active = true (soft deletes hidden)                          │    │
│  │  • Additional filters based on user role                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Specifications

### 1. Natural Language Query Flow

```typescript
// User input: "Show me top 5 customers by sales this quarter"

interface NLQueryRequest {
  query: string;           // Raw user input
  context?: {              // Optional context
    previousQueries?: string[];
    preferredFormat?: 'table' | 'chart' | 'summary';
  };
  options?: {
    includeAnalysis?: boolean;  // Add AI insights
    includeForecast?: boolean;  // Add predictions
    format?: OutputFormat;
  };
}

interface NLQueryResponse {
  success: boolean;
  data?: QueryResult;
  sql?: string;            // Generated SQL (for transparency)
  executionTime: number;   // ms
  rowCount: number;
  analysis?: AnalysisResult;
  suggestions?: string[]; // Related queries
}

// Processing Pipeline:
// 1. Intent Classification (Llama/LLM)
//    → "sales_summary" | "customer_ranking" | "inventory_report" | ...
// 
// 2. Entity Extraction
//    → { metric: "sales", dimension: "customer", 
//        aggregation: "sum", limit: 5, 
//        period: "this_quarter" }
//
// 3. SQL Generation (with schema validation)
//    → SELECT customer_id, SUM(total_amount) 
//      FROM sales_orders 
//      WHERE company_id = 'xxx' 
//        AND created_at >= '2026-01-01'
//      GROUP BY customer_id
//      ORDER BY 2 DESC
//      LIMIT 5
//
// 4. Authorization Check
//    → Does user have access to sales_orders table?
//    → Are they restricted to their company?
//    → Can they see customer names or just IDs?
//
// 5. Execution (with timeouts)
//
// 6. Analysis Layer (optional)
//    → Calculate growth rates
//    → Compare to previous period
//    → Detect anomalies
//
// 7. Format Response
```

### 2. Role-Based Data Access Matrix

| Role | Tables | Fields | Row Filters | Aggregation |
|------|--------|--------|-------------|-------------|
| super_admin | All | All | None | Raw + Aggregated |
| admin | All (own company) | All (PII masked for export) | company_id | Raw + Aggregated |
| manager | sales, customers, products, inventory | All except: cost_price (margin only) | company_id, branch_id if assigned | Aggregated preferred |
| staff | sales (own only), customers (limited), products | customer: name, phone masked | created_by = user_id or assigned | Raw limited |
| accountant | payments, sales_orders, purchase_orders | financial only, no customer PII | company_id | Aggregated |
| readonly | All (own company) | All (PII masked) | company_id | Aggregated only |

### 3. Query Security Rules

```typescript
// Query Sanitization Rules
const SECURITY_RULES = {
  // Block dangerous operations
  forbiddenKeywords: [
    'DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE',
    'TRUNCATE', 'GRANT', 'REVOKE', 'EXECUTE', 'CALL'
  ],
  
  // Limit resource consumption
  maxRows: {
    super_admin: 100000,
    admin: 50000,
    manager: 10000,
    staff: 1000,
    default: 5000
  },
  
  timeoutSeconds: {
    default: 30,
    complex: 60
  },
  
  // Allowed tables (whitelist approach)
  allowedTables: [
    'sales_orders', 'sales_order_items', 'customers', 
    'suppliers', 'products', 'inventory_batches',
    'payments', 'purchase_orders', 'payments_sales',
    'companies', 'audit_logs'
  ],
  
  // Required filters (enforced)
  mandatoryFilters: ['company_id']
};
```

### 4. Analysis Engine Capabilities

```typescript
interface AnalysisResult {
  // Trend Analysis
  trends?: {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
    periodComparison: string; // "vs last month"
  };
  
  // Anomaly Detection
  anomalies?: {
    type: 'spike' | 'drop' | 'outlier';
    description: string;
    severity: 'low' | 'medium' | 'high';
  }[];
  
  // Statistical Summary
  statistics?: {
    total: number;
    average: number;
    median: number;
    min: number;
    max: number;
    stdDev: number;
  };
  
  // AI Narrative (LLM-generated)
  narrative?: string; // "Sales increased 23% this month..."
  
  // Suggested Actions
  recommendations?: string[];
}
```

### 5. Custom Calculation Engine

```typescript
interface CustomCalculation {
  id: string;
  name: string;           // "Gross Margin %"
  formula: string;        // "(revenue - cogs) / revenue * 100"
  variables: {
    name: string;
    source: 'column' | 'calculated' | 'parameter';
    dataType: 'number' | 'currency' | 'percent' | 'date';
  }[];
  aggregation?: 'sum' | 'avg' | 'count' | 'none';
  format?: 'currency' | 'percent' | 'number' | 'decimal';
  ownerId: string;
  isPublic: boolean;      // Share with team?
}

// Example Calculations:
// 1. Inventory Turnover = COGS / Average Inventory
// 2. Days Sales Outstanding = (Accounts Receivable / Total Credit Sales) * Days
// 3. Gross Profit Margin = (Revenue - COGS) / Revenue * 100
// 4. Customer Lifetime Value = Average Order Value * Purchase Frequency * Lifespan
```

### 6. API Endpoints

```typescript
// Core Endpoints

POST /api/v1/query/natural-language
→ Accept natural language, return formatted results

POST /api/v1/query/sql
→ Accept validated SQL, return raw results

POST /api/v1/query/builder
→ Visual query builder save/execute

GET  /api/v1/query/templates
→ List saved query templates

POST /api/v1/query/templates
→ Save new query template

GET  /api/v1/query/history
→ User's query history

POST /api/v1/query/export
→ Export results (CSV, PDF, JSON)

GET  /api/v1/schema
→ Get queryable schema (respects RBAC)

GET  /api/v1/metrics
→ Predefined metrics (KPIs)

POST /api/v1/calculations
→ Create custom calculation

GET  /api/v1/calculations
→ List custom calculations
```

### 7. Database Schema Extensions

```sql
-- Query History (Audit Trail)
CREATE TABLE query_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  company_id UUID REFERENCES companies(id),
  query_text TEXT NOT NULL,
  query_type VARCHAR(50) NOT NULL, -- 'natural_language' | 'sql' | 'builder'
  generated_sql TEXT,
  execution_time_ms INTEGER,
  row_count INTEGER,
  results_hash TEXT, -- Hash of results for caching
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Saved Query Templates
CREATE TABLE query_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  query_text TEXT NOT NULL,
  query_type VARCHAR(50) NOT NULL,
  parameters JSONB, -- Template parameters { "start_date": "date", "customer_id": "uuid" }
  default_format VARCHAR(50) DEFAULT 'table',
  is_public BOOLEAN DEFAULT false,
  company_id UUID REFERENCES companies(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Custom Calculations
CREATE TABLE custom_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  formula TEXT NOT NULL,
  variables JSONB NOT NULL,
  aggregation VARCHAR(50),
  format VARCHAR(50),
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  company_id UUID REFERENCES companies(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Data Favorites (Bookmarked queries/results)
CREATE TABLE data_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name VARCHAR(255) NOT NULL,
  query_reference UUID REFERENCES query_templates(id),
  filters JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE query_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY query_history_user_isolation ON query_history
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE query_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY query_templates_company_isolation ON query_templates
  FOR ALL USING (company_id = get_user_company_id());

ALTER TABLE custom_calculations ENABLE ROW LEVEL SECURITY;
CREATE POLICY custom_calculations_company_isolation ON custom_calculations
  FOR ALL USING (company_id = get_user_company_id());
```

### 8. UI Components

```typescript
// Main Components:

// 1. QueryInterface
// - Tabs: Natural Language | Query Builder | Saved Queries
// - Input: Search bar with suggestions
// - History: Recent queries dropdown

// 2. ResultsViewer
// - Mode switcher: Table | Chart | Summary
// - Table: Sortable, filterable, paginated
// - Chart: Bar, Line, Pie, Area (Recharts)
// - Summary: Cards with KPIs + AI narrative

// 3. AnalysisPanel
// - Auto-generated insights
// - Trend indicators
// - Export buttons

// 4. QueryBuilder (Advanced)
// - Table selector (with search)
// - Field selector (drag & drop)
// - Filter builder (visual conditions)
// - Join suggestions (auto-detect FKs)
// - Aggregation builder
// - Formula editor for calculations

// 5. CalculationEditor
// - Formula input with validation
// - Variable picker (from schema)
// - Live preview
// - Save/Share options
```

### 9. Performance Optimizations

```typescript
// Caching Strategy
const CACHE_CONFIG = {
  // Query results cache (Redis/Memcached)
  resultCache: {
    ttl: 300, // 5 minutes for raw data
    key: (sql: string, params: any) => hash(sql + JSON.stringify(params))
  },
  
  // Materialized view refresh schedule
  materializedViews: {
    'mv_daily_sales_summary': '0 * * * *',      // Every hour
    'mv_monthly_aggregates': '0 2 * * *',         // Daily at 2 AM
    'mv_inventory_status': 'realtime',            // Via triggers
    'mv_outstanding_balances': '*/15 * * * *'    // Every 15 min
  },
  
  // Connection pooling
  database: {
    maxConnections: 20,
    queryTimeout: 30000
  },
  
  // Rate limiting
  rateLimiter: {
    windowMs: 60000,    // 1 minute
    maxRequests: {
      super_admin: 200,
      admin: 100,
      manager: 50,
      staff: 20
    }
  }
};
```

### 10. Error Handling & User Feedback

```typescript
interface QueryError {
  type: 
    | 'UNAUTHORIZED_TABLE'      // User can't access table
    | 'UNAUTHORIZED_FIELD'      // PII field restricted
    | 'QUERY_TOO_COMPLEX'       // Timeout or memory exceeded
    | 'INVALID_SYNTAX'          // SQL or formula error
    | 'NO_DATA_FOUND'           // Empty result
    | 'RATE_LIMITED'            // Too many requests
    | 'INVALID_DATE_RANGE';     // Date filter issues
  
  message: string;
  suggestion?: string;          // "Try filtering by date range"
  documentationLink?: string;
}
```

## Implementation Phases

### Phase 1: Core Query (Week 1-2)
- Natural language parser integration
- Basic SQL generation
- RBAC middleware
- Simple table/chart output

### Phase 2: Advanced Features (Week 3-4)
- Query builder UI
- Custom calculations
- Saved templates
- Export functionality

### Phase 3: Intelligence (Week 5-6)
- AI analysis layer
- Auto-insights
- Anomaly detection
- Narrative generation

### Phase 4: Performance (Week 7-8)
- Materialized views
- Caching layer
- Query optimization
- Monitoring dashboard

## Security Checklist

- [ ] All queries filtered by company_id (RLS)
- [ ] Role-based table access enforced
- [ ] PII fields masked for non-admin roles
- [ ] SQL injection protection (parameterized only)
- [ ] Query audit logging enabled
- [ ] Rate limiting per user/role
- [ ] No DDL operations allowed
- [ ] Max row limits enforced
- [ ] Query timeouts configured
- [ ] IP-based access logging

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React + TypeScript + Tailwind |
| Charts | Recharts |
| Query Builder | react-querybuilder |
| NLP/AI | Fireworks AI API |
| Backend | Supabase Edge Functions |
| Cache | Redis (Upstash) |
| Export | PapaParse (CSV) + jsPDF (PDF) |

---

# IMPLEMENTATION PROGRESS TRACKER

> **AGENT HANDOFF RULE**: When continuing this work, READ this doc first and check off completed items. Update status at the bottom.

## Phase 1: Core Query Engine

### 1.1 Database Schema ✅ COMPLETE
- [x] Create `query_history` table with RLS
- [x] Create `query_templates` table with RLS
- [x] Create `custom_calculations` table with RLS
- [x] Create `data_favorites` table with RLS
- [x] Add helper functions: `get_user_company_id()`, `is_super_admin()`
- [x] Add `execute_readonly_query()` function for safe query execution

### 1.2 Supabase Edge Function - Natural Language Query � BACKLOG
- [x] Create `supabase/functions/nl-query/index.ts`
    - [x] Reuse Fireworks AI Gateway pattern (see `parse-order-text/index.ts`)
- [x] System prompt: ERP schema + SQL generation rules
- [x] Function calling: structured SQL output
- [x] Rate limiting + error handling (429, 402)
- [x] RLS enforcement: inject `company_id` filter
- [x] SQL validation (SELECT-only, forbidden keywords)
- [x] Role-based row limits
- [x] Query execution with timeout
- [x] Statistical analysis generation
- [x] Audit logging to query_history
- [ ] Deploy to Supabase (BACKLOG - on hold)

### 1.3 Type Definitions ✅ COMPLETE
- [x] Add to `src/types/queryEngine.ts`:
  - `NLQueryRequest`, `NLQueryResponse`
  - `QueryResult`, `AnalysisResult`
  - `CustomCalculation`, `QueryTemplate`
  - Plus: QueryError, QueryHistory, DataFavorite, QueryBuilder types

### 1.4 Service Layer ✅ COMPLETE
- [x] Create `src/services/queryEngine.ts`:
  - `executeNLQuery()` - calls edge function
  - `executeSQLQuery()` - direct supabase query
  - `getQueryHistory()`
  - `getQueryStatistics()`
  - `saveQueryTemplate()`, `updateQueryTemplate()`, `deleteQueryTemplate()`
  - `saveCustomCalculation()`, `updateCustomCalculation()`, `deleteCustomCalculation()`
  - `executeCustomCalculation()` - placeholder (needs formula parser)
  - `saveDataFavorite()`, `updateDataFavorite()`, `deleteDataFavorite()`

## Phase 2: UI Components

### 2.1 Main Page ✅ COMPLETE
- [x] Create `src/pages/QueryEngine.tsx` (or extend Chat.tsx)
- [x] Tab interface: Natural Language | Query Builder | Saved Queries
- [x] Route: `/query` (add to App.tsx and AppSidebar)

### 2.2 Natural Language Input ✅/⬜
- [ ] Component: `src/components/query/NLQueryInput.tsx`
- [ ] Text area with placeholder examples
- [ ] Submit button with loading state
- [ ] Recent queries dropdown

### 2.3 Results Viewer ✅/⬜
- [ ] Component: `src/components/query/ResultsViewer.tsx`
- [ ] Tabs: Table | Chart | Summary
- [ ] Table view: sortable, filterable, paginated
- [ ] Chart view: bar, line, pie (use Recharts)
- [ ] Summary view: KPI cards + AI narrative

### 2.4 Query Builder (Advanced) ✅/⬜
- [ ] Component: `src/components/query/QueryBuilder.tsx`
- [ ] Table selector (respects RBAC)
- [ ] Field selector with drag-drop
- [ ] Filter builder (conditions)
- [ ] Aggregation builder

## Phase 3: Authorization & Security

### 3.1 RBAC Middleware ✅/⬜
- [ ] Create `src/lib/query/rbac.ts`:
  - `canAccessTable(userRole, tableName)`
  - `canAccessField(userRole, tableName, fieldName)`
  - `getMaxRows(userRole)`
  - `getQueryTimeout(userRole)`

### 3.2 Query Sanitizer ✅/⬜
- [ ] Create `src/lib/query/sanitizer.ts`:
  - `sanitizeSQL(query)` - block forbidden keywords
  - `validateTables(sql, allowedTables)`
  - `enforceCompanyFilter(sql, companyId)`

### 3.3 Audit Logging ✅/⬜
- [ ] Hook into query execution
- [ ] Log to `query_history` table

## Phase 4: Analysis Layer

### 4.1 Smart Analysis ✅ COMPLETE
- [x] Create `src/lib/query/analysis.ts`:
  - `detectTrends(data, timeField, valueField)` - Linear regression + correlation
  - `detectAnomalies(data, threshold = 2)` - Z-score method with severity levels
  - `generateNarrative(query, results, analysis)` - Basic + LLM-enhanced (placeholder)
  - Plus: `calculateMovingAverage()`, `calculateCAGR()`, `calculateSeasonality()`

### 4.2 Custom Calculations ✅ COMPLETE
- [x] Create `src/components/query/CalculationEditor.tsx`
- [x] Formula parser (safe eval using Function constructor)
- [x] Save/load custom formulas
- Features: Variable management, formula testing, aggregation options, result formatting

## Phase 5: Integration

### 5.1 Chat Integration ✅ COMPLETE
- [x] Extend Chat.tsx with query intent detection
- [x] New intent: `query_data` in `chatAutomation.ts`
- [x] Route query requests to Query Engine
- Features: Query results preview in chat, error handling, execution stats

### 5.2 Export Features ✅ COMPLETE
- [x] CSV export (built-in implementation)
- [x] PDF export (HTML to PDF conversion)
- [x] Shareable link generation
- Features: Advanced formatting, column filtering, number/date formatting

---

## CURRENT STATUS

| Item | Status | Notes |
|------|--------|-------|
| System Design | ✅ Complete | This document |
| Memory Created | ✅ Complete | ID: 8d3c53f2-4817-412b-9128-44b5f903b9a6 |
| Phase 1.1 - Schema | ✅ Complete | Migration created: `20260508100000_add_query_history.sql` |
| Phase 1.2 - Edge Function | 📋 BACKLOG | `nl-query/index.ts` created, deployment on hold |
| Phase 1.3 - Type Definitions | ✅ Complete | `src/types/queryEngine.ts` with 7 interface groups |
| Phase 1.4 - Service Layer | ✅ Complete | `src/services/queryEngine.ts` with 15+ functions |
| Phase 2.1 - Main Page | ✅ Complete | `src/pages/QueryEngine.tsx` + route + sidebar |
| Phase 4.1 - Analysis Library | ✅ Complete | `src/lib/query/analysis.ts` with trend/anomaly detection |
| Phase 4.2 - Custom Calculations | ✅ Complete | `src/components/query/CalculationEditor.tsx` with formula parser |
| Phase 5.1 - Chat Integration | ✅ Complete | Added `query_data` intent to `chatAutomation.ts` |
| Phase 5.2 - Export Features | ✅ Complete | `src/lib/query/export.ts` with CSV/PDF/JSON export |
| Next Action | ⏳ Deploy | Run `supabase db push` + `supabase functions deploy nl-query` |

## AGENT RESTART CHECKLIST

When another agent continues this work:

1. **Read this file** completely
2. **Check memory** with ID `8d3c53f2-4817-412b-9128-44b5f903b9a6`
3. **Update progress** above as you complete items
4. **Follow order**: Phase 1.1 → 1.2 → 1.3 → 1.4 → Phase 2...
5. **Reference patterns** from:
   - `supabase/functions/parse-order-text/index.ts` (LLM calling)
   - `supabase/functions/scan-invoice/index.ts` (image + LLM)
   - `src/services/chatAutomation.ts` (intent parsing pattern)

---

**Last Updated**: 2026-05-09 16:58 UTC by Kilo
**Status**: AI Gateway migration complete. All 4 edge functions now use Fireworks AI Gateway (`api.fireworks.ai`) with `accounts/fireworks/models/llama-v3p1-70b-instruct`.
**Next Agent**: Set `FIREWORKS_API_KEY` secret, deploy all edge functions (`supabase functions deploy`), then test QueryEngine page

## IMPLEMENTATION NOTES

### Files Created Today:

1. `supabase/functions/nl-query/index.ts` (183 lines) - Complete edge function:
    - Natural language → SQL generation via Fireworks AI Gateway (Llama 3.1 70B Instruct)
   - Comprehensive security: SELECT-only, forbidden keywords, company_id enforcement
   - Role-based row limits (super_admin: 100k, admin: 50k, manager: 10k, staff: 1k)
   - Query execution with 30s timeout
   - Statistical analysis for numeric columns
   - Audit logging to query_history table
   - Error handling for all edge cases (429, 402, validation, execution errors)

2. `supabase/migrations/20260508100000_add_query_history.sql` - Database schema:
   - query_history (audit trail)
   - query_templates (saved queries)
   - custom_calculations (user formulas)
   - data_favorites (bookmarks)
   - Helper functions: get_user_company_id(), is_super_admin(), execute_readonly_query()
   - All tables have RLS policies

3. `src/types/queryEngine.ts` (200+ lines) - TypeScript type definitions:
   - Core query types: NLQueryRequest, NLQueryResponse
   - Error types: QueryError with 11 error types
   - Analysis types: AnalysisResult, StatSummary
   - Template types: QueryTemplate, TemplateParameter
   - Calculation types: CustomCalculation, CalculationVariable
   - History types: QueryHistory, QueryHistoryFilters
   - Favorite types: DataFavorite
   - Builder types: QueryBuilderCondition, QueryBuilderRequest
   - Export types: ExportFormat, ExportRequest
   - RBAC types: UserRole, TableAccessRule, RolePermissions

4. `src/services/queryEngine.ts` (350+ lines) - Service layer:
   - executeNLQuery() - calls edge function
   - executeSQLQuery() - direct Supabase query
   - getQueryHistory() - fetch query history with filters
   - getQueryStatistics() - query analytics
   - Query templates: get, create, update, delete
   - Custom calculations: get, create, update, delete, execute (placeholder)
   - Data favorites: get, create, update, delete

5. `src/pages/QueryEngine.tsx` (280 lines) - Main UI page:
   - Natural language query input with example queries
   - Query execution with loading state
   - Results display with table view
   - Analysis statistics display
   - SQL view toggle
   - Query history tab
   - Saved queries tab (placeholder)
   - Error handling with suggestions

6. Updated `src/App.tsx` - Added /query route
7. Updated `src/components/layout/AppSidebar.tsx` - Added Query Engine menu item

### To Complete Deployment:
```bash
# 1. Run the database migration
supabase db push

# 2. Deploy the edge function
supabase functions deploy nl-query

# 3. Test the Query Engine page
# Navigate to /query in the app
# Try queries like: "Show me total sales this month"
```

---

## CODE REVIEW FIXES (2026-05-08)

Comprehensive security and quality review completed. All critical issues resolved.

### Critical Fixes

| Issue | Location | Fix |
|-------|----------|-----|
| **SQL Injection: Missing company_id enforcement** | `nl-query/index.ts:111` | Added programmatic validation that SQL contains `company_id` and matches user's company |
| **RLS Bypass: Service role for execution** | `nl-query/index.ts:477-479` | Changed to use anon-key client with user's JWT for query execution so RLS policies apply |
| **Eval XSS: new Function() in formula parser** | `CalculationEditor.tsx:110-199` | Replaced with recursive-descent parser (no code execution possible) |
| **Dead RPC: execute_query doesn't exist** | `nl-query/index.ts:480-506` | Removed dead code, uses `execute_readonly_query` directly |

### High Priority Fixes

| Issue | Location | Fix |
|-------|----------|-----|
| Data leak in stats | `queryEngine.ts:186` | Added `.eq("company_id", companyId)` to `getQueryStatistics` |
| Division by zero | `analysis.ts:69-77, 112-117, 190-196` | Added guards for slope, percent change, z-score calculations |
| Bug: `row[row]` in PDF export | `export.ts:138` | Fixed to `row[col]` (was using array index as key) |
| Navigate during render | `QueryEngine.tsx:27-34` | Moved to `useEffect`, added loading guard |

### Medium/Low Fixes

- Stack overflow protection: Replaced `Math.min/max(...values)` with reduce pattern
- Added UTF-8 BOM to CSV for Excel compatibility
- Removed dead code: `generateEnhancedNarrative`, stub `executeCustomCalculation`
- Removed unused imports: `Database` from lucide, `Tabs` from CalculationEditor
- Fixed `formatDate` token replacement order (mm/MM collision)
- Changed `CalculationVariable.type` from `string` to union type
- Added duplicate variable name validation in CalculationEditor
- Added stable `_id` keys for variable list items
- Removed unused `llmStartTime` variable

### Security Posture

| Layer | Status |
|-------|--------|
| SQL Injection Prevention | SELECT-only, forbidden keywords, company_id enforcement |
| RLS Enforcement | Anon-key client with user JWT for query execution |
| Code Execution Prevention | Recursive-descent parser replaces eval/Function |
| Cross-Company Data Leak | company_id validated in SQL + RLS policies |
