import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  NLQueryRequest,
  NLQueryResponse,
  QueryHistory,
  QueryHistoryFilters,
  QueryTemplate,
  CreateQueryTemplateInput,
  UpdateQueryTemplateInput,
  CustomCalculation,
  CreateCalculationInput,
  UpdateCalculationInput,
  DataFavorite,
  CreateFavoriteInput,
  UpdateFavoriteInput,
} from "@/types/queryEngine";

/**
 * ERP Query Engine Service
 * Provides functions to interact with the query engine edge function and database tables
 */

// ============================================================================
// Natural Language Query Functions
// ============================================================================

/**
 * Execute a natural language query via the edge function
 * @param supabase - Supabase client instance
 * @param request - Query request with natural language text
 * @returns Query response with results or error
 */
export async function executeNLQuery(
  supabase: SupabaseClient<Database>,
  request: NLQueryRequest
): Promise<NLQueryResponse> {
  try {
    const { data, error } = await supabase.functions.invoke<NLQueryResponse>("nl-query", {
      body: request,
    });

    if (error) {
      console.error("Edge function error:", error);
      return {
        success: false,
        execution_time_ms: 0,
        row_count: 0,
        error: {
          type: "INTERNAL_ERROR",
          message: error.message || "Failed to execute query",
          suggestion: "Please try again or contact support",
        },
      };
    }

    return data || {
      success: false,
      execution_time_ms: 0,
      row_count: 0,
      error: {
        type: "INTERNAL_ERROR",
        message: "No response from query engine",
      },
    };
  } catch (e) {
    console.error("executeNLQuery error:", e);
    return {
      success: false,
      execution_time_ms: 0,
      row_count: 0,
      error: {
        type: "INTERNAL_ERROR",
        message: e instanceof Error ? e.message : "Unexpected error occurred",
      },
    };
  }
}

/**
 * Execute a raw SQL query directly (bypassing LLM)
 * NOTE: This requires execute_readonly_query function to be deployed
 * @param supabase - Supabase client instance
 * @param sql - SQL query to execute
 * @param maxRows - Maximum number of rows to return
 * @returns Query results
 */
export async function executeSQLQuery(
  supabase: SupabaseClient<Database>,
  sql: string,
  maxRows: number = 1000
): Promise<{ data: any[] | null; error: any }> {
  try {
    const { data, error } = await supabase.rpc("execute_readonly_query", {
      query_sql: sql,
      max_rows: maxRows,
    });

    return { data: data as any[] | null, error };
  } catch (e) {
    console.error("executeSQLQuery error:", e);
    return {
      data: null,
      error: e instanceof Error ? e.message : "Query execution failed",
    };
  }
}

// ============================================================================
// Query History Functions
// ============================================================================

/**
 * Get query history for a user with optional filters
 * @param supabase - Supabase client instance
 * @param filters - Optional filters (user_id, company_id, date range, etc.)
 * @returns Array of query history records
 */
export async function getQueryHistory(
  supabase: SupabaseClient<Database>,
  filters: QueryHistoryFilters = {}
): Promise<{ data: QueryHistory[] | null; error: any }> {
  try {
    let query = supabase
      .from("query_history")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply filters
    if (filters.user_id) {
      query = query.eq("user_id", filters.user_id);
    }
    if (filters.company_id) {
      query = query.eq("company_id", filters.company_id);
    }
    if (filters.query_type) {
      query = query.eq("query_type", filters.query_type);
    }
    if (filters.date_from) {
      query = query.gte("created_at", filters.date_from);
    }
    if (filters.date_to) {
      query = query.lte("created_at", filters.date_to);
    }

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error } = await query;

    return { data: data as any, error };
  } catch (e) {
    console.error("getQueryHistory error:", e);
    return { data: null, error: e instanceof Error ? e.message : "Failed to fetch query history" };
  }
}

/**
 * Get query statistics for a company
 * @param supabase - Supabase client instance
 * @param companyId - Company ID
 * @param dateFrom - Start date (optional)
 * @param dateTo - End date (optional)
 * @returns Query statistics
 */
export async function getQueryStatistics(
  supabase: SupabaseClient<Database>,
  companyId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{
  totalQueries: number;
  avgExecutionTime: number;
  totalRowsReturned: number;
  error: any;
}> {
  try {
    let query = supabase
      .from("query_history")
      .select("execution_time_ms, row_count")
      .eq("company_id", companyId);

    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }
    if (dateTo) {
      query = query.lte("created_at", dateTo);
    }

    const { data, error } = await query;

    if (error) {
      return {
        totalQueries: 0,
        avgExecutionTime: 0,
        totalRowsReturned: 0,
        error,
      };
    }

    const totalQueries = data?.length || 0;
    const avgExecutionTime = data && data.length > 0
      ? data.reduce((sum, q) => sum + (q.execution_time_ms || 0), 0) / data.length
      : 0;
    const totalRowsReturned = data?.reduce((sum, q) => sum + (q.row_count || 0), 0) || 0;

    return {
      totalQueries,
      avgExecutionTime,
      totalRowsReturned,
      error: null,
    };
  } catch (e) {
    console.error("getQueryStatistics error:", e);
    return {
      totalQueries: 0,
      avgExecutionTime: 0,
      totalRowsReturned: 0,
      error: e instanceof Error ? e.message : "Failed to fetch statistics",
    };
  }
}

// ============================================================================
// Query Template Functions
// ============================================================================

/**
 * Get all query templates for a company
 * @param supabase - Supabase client instance
 * @param companyId - Company ID
 * @param includePublic - Whether to include public templates from other companies
 * @returns Array of query templates
 */
export async function getQueryTemplates(
  supabase: SupabaseClient<Database>,
  companyId: string,
  includePublic: boolean = false
): Promise<{ data: QueryTemplate[] | null; error: any }> {
  try {
    let query = supabase.from("query_templates").select("*");

    if (includePublic) {
      query = query.or(`company_id.eq.${companyId},is_public.eq.true`);
    } else {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    return { data: data as any, error };
  } catch (e) {
    console.error("getQueryTemplates error:", e);
    return { data: null, error: e instanceof Error ? e.message : "Failed to fetch query templates" };
  }
}

/**
 * Get a specific query template by ID
 * @param supabase - Supabase client instance
 * @param templateId - Template ID
 * @returns Query template or null
 */
export async function getQueryTemplate(
  supabase: SupabaseClient<Database>,
  templateId: string
): Promise<{ data: QueryTemplate | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from("query_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    return { data: data as any, error };
  } catch (e) {
    console.error("getQueryTemplate error:", e);
    return { data: null, error: e instanceof Error ? e.message : "Failed to fetch query template" };
  }
}

/**
 * Create a new query template
 * @param supabase - Supabase client instance
 * @param input - Template creation input
 * @param userId - User ID creating the template
 * @param companyId - Company ID
 * @returns Created template or error
 */
export async function saveQueryTemplate(
  supabase: SupabaseClient<Database>,
  input: CreateQueryTemplateInput,
  userId: string,
  companyId: string
): Promise<{ data: QueryTemplate | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from("query_templates")
      .insert({
        ...input,
        company_id: companyId,
        created_by: userId,
        query_type: input.query_type || "natural_language",
        default_format: input.default_format || "table",
        is_public: input.is_public || false,
      } as any)
      .select()
      .single();

    return { data: data as any, error };
  } catch (e) {
    console.error("saveQueryTemplate error:", e);
    return { data: null, error: e instanceof Error ? e.message : "Failed to save query template" };
  }
}

/**
 * Update an existing query template
 * @param supabase - Supabase client instance
 * @param templateId - Template ID
 * @param input - Template update input
 * @returns Updated template or error
 */
export async function updateQueryTemplate(
  supabase: SupabaseClient<Database>,
  templateId: string,
  input: UpdateQueryTemplateInput
): Promise<{ data: QueryTemplate | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from("query_templates")
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", templateId)
      .select()
      .single();

    return { data: data as any, error };
  } catch (e) {
    console.error("updateQueryTemplate error:", e);
    return { data: null, error: e instanceof Error ? e.message : "Failed to update query template" };
  }
}

/**
 * Delete a query template
 * @param supabase - Supabase client instance
 * @param templateId - Template ID
 * @returns Success or error
 */
export async function deleteQueryTemplate(
  supabase: SupabaseClient<Database>,
  templateId: string
): Promise<{ error: any }> {
  try {
    const { error } = await supabase.from("query_templates").delete().eq("id", templateId);

    return { error };
  } catch (e) {
    console.error("deleteQueryTemplate error:", e);
    return { error: e instanceof Error ? e.message : "Failed to delete query template" };
  }
}

// ============================================================================
// Custom Calculation Functions
// ============================================================================

/**
 * Get all custom calculations for a company
 * @param supabase - Supabase client instance
 * @param companyId - Company ID
 * @param includePublic - Whether to include public calculations from other companies
 * @returns Array of custom calculations
 */
export async function getCustomCalculations(
  supabase: SupabaseClient<Database>,
  companyId: string,
  includePublic: boolean = false
): Promise<{ data: CustomCalculation[] | null; error: any }> {
  try {
    let query = supabase.from("custom_calculations").select("*");

    if (includePublic) {
      query = query.or(`company_id.eq.${companyId},is_public.eq.true`);
    } else {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    return { data: data as any, error };
  } catch (e) {
    console.error("getCustomCalculations error:", e);
    return { data: null, error: e instanceof Error ? e.message : "Failed to fetch custom calculations" };
  }
}

/**
 * Get a specific custom calculation by ID
 * @param supabase - Supabase client instance
 * @param calculationId - Calculation ID
 * @returns Custom calculation or null
 */
export async function getCustomCalculation(
  supabase: SupabaseClient<Database>,
  calculationId: string
): Promise<{ data: CustomCalculation | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from("custom_calculations")
      .select("*")
      .eq("id", calculationId)
      .single();

    return { data: data as any, error };
  } catch (e) {
    console.error("getCustomCalculation error:", e);
    return { data: null, error: e instanceof Error ? e.message : "Failed to fetch custom calculation" };
  }
}

/**
 * Create a new custom calculation
 * @param supabase - Supabase client instance
 * @param input - Calculation creation input
 * @param userId - User ID creating the calculation
 * @param companyId - Company ID
 * @returns Created calculation or error
 */
export async function saveCustomCalculation(
  supabase: SupabaseClient<Database>,
  input: CreateCalculationInput,
  userId: string,
  companyId: string
): Promise<{ data: CustomCalculation | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from("custom_calculations")
      .insert({
        ...input,
        company_id: companyId,
        created_by: userId,
        aggregation: input.aggregation || null,
        result_format: input.result_format || "number",
        is_public: input.is_public || false,
      } as any)
      .select()
      .single();

    return { data: data as any, error };
  } catch (e) {
    console.error("saveCustomCalculation error:", e);
    return { data: null, error: e instanceof Error ? e.message : "Failed to save custom calculation" };
  }
}

/**
 * Update an existing custom calculation
 * @param supabase - Supabase client instance
 * @param calculationId - Calculation ID
 * @param input - Calculation update input
 * @returns Updated calculation or error
 */
export async function updateCustomCalculation(
  supabase: SupabaseClient<Database>,
  calculationId: string,
  input: UpdateCalculationInput
): Promise<{ data: CustomCalculation | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from("custom_calculations")
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", calculationId)
      .select()
      .single();

    return { data: data as any, error };
  } catch (e) {
    console.error("updateCustomCalculation error:", e);
    return { data: null, error: e instanceof Error ? e.message : "Failed to update custom calculation" };
  }
}

/**
 * Delete a custom calculation
 * @param supabase - Supabase client instance
 * @param calculationId - Calculation ID
 * @returns Success or error
 */
export async function deleteCustomCalculation(
  supabase: SupabaseClient<Database>,
  calculationId: string
): Promise<{ error: any }> {
  try {
    const { error } = await supabase.from("custom_calculations").delete().eq("id", calculationId);

    return { error };
  } catch (e) {
    console.error("deleteCustomCalculation error:", e);
    return { error: e instanceof Error ? e.message : "Failed to delete custom calculation" };
  }
}

// ============================================================================
// Data Favorite Functions
// ============================================================================

/**
 * Get all data favorites for a user
 * @param supabase - Supabase client instance
 * @param userId - User ID
 * @returns Array of data favorites
 */
export async function getDataFavorites(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ data: DataFavorite[] | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from("data_favorites")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    return { data: data as any, error };
  } catch (e) {
    console.error("getDataFavorites error:", e);
    return { data: null, error: e instanceof Error ? e.message : "Failed to fetch data favorites" };
  }
}

/**
 * Create a new data favorite
 * @param supabase - Supabase client instance
 * @param input - Favorite creation input
 * @param userId - User ID creating the favorite
 * @returns Created favorite or error
 */
export async function saveDataFavorite(
  supabase: SupabaseClient<Database>,
  input: CreateFavoriteInput,
  userId: string
): Promise<{ data: DataFavorite | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from("data_favorites")
      .insert({
        ...input,
        user_id: userId,
        filters: input.filters || {},
      })
      .select()
      .single();

    return { data: data as any, error };
  } catch (e) {
    console.error("saveDataFavorite error:", e);
    return { data: null, error: e instanceof Error ? e.message : "Failed to save data favorite" };
  }
}

/**
 * Update an existing data favorite
 * @param supabase - Supabase client instance
 * @param favoriteId - Favorite ID
 * @param input - Favorite update input
 * @returns Updated favorite or error
 */
export async function updateDataFavorite(
  supabase: SupabaseClient<Database>,
  favoriteId: string,
  input: UpdateFavoriteInput
): Promise<{ data: DataFavorite | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from("data_favorites")
      .update(input)
      .eq("id", favoriteId)
      .select()
      .single();

    return { data: data as any, error };
  } catch (e) {
    console.error("updateDataFavorite error:", e);
    return { data: null, error: e instanceof Error ? e.message : "Failed to update data favorite" };
  }
}

/**
 * Delete a data favorite
 * @param supabase - Supabase client instance
 * @param favoriteId - Favorite ID
 * @returns Success or error
 */
export async function deleteDataFavorite(
  supabase: SupabaseClient<Database>,
  favoriteId: string
): Promise<{ error: any }> {
  try {
    const { error } = await supabase.from("data_favorites").delete().eq("id", favoriteId);

    return { error };
  } catch (e) {
    console.error("deleteDataFavorite error:", e);
    return { error: e instanceof Error ? e.message : "Failed to delete data favorite" };
  }
}
