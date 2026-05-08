// ERP Query Engine - TypeScript Type Definitions
// Phase 1.3 of the ERP Query Engine implementation

// ============================================================================
// Core Query Types
// ============================================================================

export interface NLQueryRequest {
  query: string;
  company_id: string;
  options?: {
    max_rows?: number;
    include_analysis?: boolean;
    format?: "json" | "table" | "chart";
  };
}

export interface NLQueryResponse {
  success: boolean;
  data?: any[];
  columns?: string[];
  sql?: string;
  execution_time_ms: number;
  row_count: number;
  analysis?: AnalysisResult;
  error?: QueryError;
}

// ============================================================================
// Error Types
// ============================================================================

export type QueryErrorType =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "PROFILE_ERROR"
  | "VALIDATION_FAILED"
  | "GENERATION_FAILED"
  | "EXECUTION_FAILED"
  | "DATABASE_ERROR"
  | "RATE_LIMITED"
  | "CREDITS_EXHAUSTED"
  | "INTERNAL_ERROR";

export interface QueryError {
  type: QueryErrorType;
  message: string;
  suggestion?: string;
}

// ============================================================================
// Analysis Types
// ============================================================================

export interface AnalysisResult {
  summary_stats?: Record<string, StatSummary>;
  row_count: number;
  column_count: number;
  execution_time_ms: number;
}

export interface StatSummary {
  min: number;
  max: number;
  avg: number;
  sum: number;
  count: number;
}

// ============================================================================
// Query Template Types
// ============================================================================

export interface QueryTemplate {
  id: string;
  name: string;
  description?: string;
  query_text: string;
  query_type: string;
  parameters: Record<string, TemplateParameter>;
  default_format: string;
  is_public: boolean;
  company_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateParameter {
  name: string;
  type: "string" | "number" | "date" | "uuid" | "boolean";
  required: boolean;
  default_value?: any;
}

export interface CreateQueryTemplateInput {
  name: string;
  description?: string;
  query_text: string;
  query_type?: string;
  parameters?: Record<string, TemplateParameter>;
  default_format?: string;
  is_public?: boolean;
}

export interface UpdateQueryTemplateInput {
  name?: string;
  description?: string;
  query_text?: string;
  parameters?: Record<string, TemplateParameter>;
  default_format?: string;
  is_public?: boolean;
}

// ============================================================================
// Custom Calculation Types
// ============================================================================

export interface CustomCalculation {
  id: string;
  name: string;
  description?: string;
  formula: string;
  variables: CalculationVariable[];
  aggregation: "sum" | "avg" | "count" | "none" | null;
  result_format: "currency" | "percent" | "number" | "decimal";
  is_public: boolean;
  company_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CalculationVariable {
  name: string;
  source: "column" | "calculation" | "parameter";
  table?: string;
  column?: string;
  type: "number" | "string" | "date" | "boolean";
}

export interface CreateCalculationInput {
  name: string;
  description?: string;
  formula: string;
  variables: CalculationVariable[];
  aggregation?: "sum" | "avg" | "count" | "none" | null;
  result_format?: "currency" | "percent" | "number" | "decimal";
  is_public?: boolean;
}

export interface UpdateCalculationInput {
  name?: string;
  description?: string;
  formula?: string;
  variables?: CalculationVariable[];
  aggregation?: "sum" | "avg" | "count" | "none" | null;
  result_format?: "currency" | "percent" | "number" | "decimal";
  is_public?: boolean;
}

// ============================================================================
// Query History Types
// ============================================================================

export interface QueryHistory {
  id: string;
  user_id: string;
  company_id: string;
  query_text: string;
  query_type: string;
  generated_sql?: string;
  execution_time_ms?: number;
  row_count: number;
  created_at: string;
  ip_address?: string;
}

export interface QueryHistoryFilters {
  user_id?: string;
  company_id?: string;
  query_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Data Favorite Types
// ============================================================================

export interface DataFavorite {
  id: string;
  user_id: string;
  name: string;
  query_template_id?: string;
  saved_query_text?: string;
  filters: Record<string, any>;
  created_at: string;
}

export interface CreateFavoriteInput {
  name: string;
  query_template_id?: string;
  saved_query_text?: string;
  filters?: Record<string, any>;
}

export interface UpdateFavoriteInput {
  name?: string;
  filters?: Record<string, any>;
}

// ============================================================================
// Query Builder Types (for Phase 2 - UI)
// ============================================================================

export interface QueryBuilderCondition {
  field: string;
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE" | "IN" | "IS NULL" | "IS NOT NULL";
  value?: any;
  values?: any[];
}

export interface QueryBuilderFilter {
  conditions: QueryBuilderCondition[];
  logicalOperator: "AND" | "OR";
}

export interface QueryBuilderRequest {
  tables: string[];
  columns: string[];
  filters?: QueryBuilderFilter;
  groupBy?: string[];
  orderBy?: { column: string; direction: "ASC" | "DESC" }[];
  limit?: number;
  offset?: number;
}

// ============================================================================
// Export Types
// ============================================================================

export type ExportFormat = "csv" | "pdf" | "json" | "excel";

export interface ExportRequest {
  data: any[];
  columns: string[];
  format: ExportFormat;
  filename?: string;
}

// ============================================================================
// Role-Based Access Control Types
// ============================================================================

export type UserRole = "super_admin" | "admin" | "manager" | "staff" | "accountant" | "default";

export interface TableAccessRule {
  tableName: string;
  canRead: boolean;
  canWrite: boolean;
  restrictedColumns?: string[];
}

export interface RolePermissions {
  role: UserRole;
  tableAccess: TableAccessRule[];
  maxRows: number;
  queryTimeout: number;
}
