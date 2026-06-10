import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { detectSchemaWithAI } from "./stages/schemaDetection.ts";
import { suggestFieldMappings } from "./stages/fieldMapping.ts";
import { transformRow as applyTransformations } from "./stages/transformation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FieldMapping {
  sourceField: string;
  targetField: string;
  transformation?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json() as Record<string, unknown>;
    const stage = body.stage as string;

    if (!stage) {
      return new Response(JSON.stringify({ error: "Missing stage" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result;

    switch (stage) {
      case "schema_detect": {
        const { headers, sample_rows } = body as { headers: string[]; sample_rows: Record<string, unknown>[] };
        if (!headers || !sample_rows) {
          return new Response(JSON.stringify({ error: "Missing headers or sample_rows" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = await detectSchemaWithAI(headers, sample_rows, lovableApiKey);
        break;
      }

      case "field_mapping": {
        const { source_columns, target_entity } = body as {
          source_columns: { name: string; detectedType: string; sampleValues: string[] }[];
          target_entity: string;
        };
        if (!source_columns || !target_entity) {
          return new Response(JSON.stringify({ error: "Missing source_columns or target_entity" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = await suggestFieldMappings(source_columns, target_entity, lovableApiKey);
        break;
      }

      case "execute": {
        const { company_id, entity_type, rows, mappings, batch_size } = body as {
          company_id: string;
          entity_type: string;
          rows: Record<string, unknown>[];
          mappings: FieldMapping[];
          batch_size?: number;
        };
        if (!company_id || !entity_type || !rows) {
          return new Response(JSON.stringify({ error: "Missing company_id, entity_type, or rows" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = await executeImport(
          serviceClient,
          company_id,
          entity_type,
          rows,
          mappings || [],
          batch_size || 100,
          user.id
        );
        break;
      }

      case "rollback": {
        const { job_id } = body as { job_id: string };
        if (!job_id) {
          return new Response(JSON.stringify({ error: "Missing job_id" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = await rollbackImport(serviceClient, job_id);
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown stage: ${stage}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Data import error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Execute Import ──────────────────────────────────────────────────────────

async function executeImport(
  client: any,
  companyId: string,
  entityType: string,
  rows: Record<string, unknown>[],
  mappings: FieldMapping[],
  batchSize: number,
  userId: string
): Promise<{ jobId: string; successRows: number; failedRows: number; errors: { row: number; message: string }[] }> {
  const { data: job, error: jobError } = await client
    .from("import_jobs")
    .insert({
      company_id: companyId,
      user_id: userId,
      entity_type: entityType,
      status: "importing",
      total_rows: rows.length,
      mapping_config: mappings,
    })
    .select("id")
    .single();

  if (jobError) throw new Error(`Failed to create import job: ${jobError.message}`);

  const jobId = job.id;
  const errors: { row: number; message: string }[] = [];
  let successRows = 0;
  const FAILURE_THRESHOLD = 0.3; // 30% failure triggers rollback offer

  try {
    let productMap: Map<string, string> = new Map();
    let supplierMap: Map<string, string> = new Map();
    let customerMap: Map<string, string> = new Map();

    if (entityType === "inventory_batch" || entityType === "purchase_order") {
      const { data: prods } = await client.from("products").select("id, name").eq("company_id", companyId);
      for (const p of prods || []) productMap.set(p.name.toLowerCase(), p.id);
    }
    if (["inventory_batch", "purchase_order", "payment"].includes(entityType)) {
      const { data: sups } = await client.from("suppliers").select("id, name").eq("company_id", companyId);
      for (const s of sups || []) supplierMap.set(s.name.toLowerCase(), s.id);
    }
    if (["sales_order", "payment"].includes(entityType)) {
      const { data: custs } = await client.from("customers").select("id, name").eq("company_id", companyId);
      for (const c of custs || []) customerMap.set(c.name.toLowerCase(), c.id);
    }

    const totalBatches = Math.ceil(rows.length / batchSize);
    let shouldRollback = false;

    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * batchSize;
      const end = Math.min(start + batchSize, rows.length);
      const batchRows = rows.slice(start, end);

      // Transform all rows in this batch
      const transformedBatch: Record<string, unknown>[] = [];
      for (let i = 0; i < batchRows.length; i++) {
        try {
          const transformed = applyTransformations(batchRows[i], mappings);
          const dbRow = buildDbRow(transformed, entityType, companyId, { productMap, supplierMap, customerMap });
          transformedBatch.push(dbRow);
        } catch (err) {
          errors.push({ row: start + i + 1, message: err instanceof Error ? err.message : String(err) });
        }
      }

      // Bulk insert the batch
      if (transformedBatch.length > 0) {
        const table = getTableName(entityType);
        const { error: batchError } = await client.from(table).insert(transformedBatch);
        if (batchError) {
          // Fall back to row-by-row for error isolation
          for (let i = 0; i < transformedBatch.length; i++) {
            const { error: rowError } = await client.from(table).insert(transformedBatch[i]);
            if (rowError) {
              errors.push({ row: start + i + 1, message: rowError.message });
            } else {
              successRows++;
            }
          }
        } else {
          successRows += transformedBatch.length;
        }
      }

      // Update progress
      await client
        .from("import_jobs")
        .update({ success_rows: successRows, failed_rows: errors.length })
        .eq("id", jobId);

      // Check failure threshold mid-import
      const totalProcessed = successRows + errors.length;
      if (totalProcessed > 20) {
        const failureRate = errors.length / totalProcessed;
        if (failureRate > FAILURE_THRESHOLD) {
          shouldRollback = true;
          break;
        }
      }
    }

    if (shouldRollback) {
      await deleteImportedRows(client, entityType, companyId, jobId);
      await client
        .from("import_jobs")
        .update({
          status: "rolled_back",
          success_rows: successRows,
          failed_rows: errors.length,
          error_log: [...errors.map(e => `Row ${e.row}: ${e.message}`), "ROLLED BACK: Failure rate exceeded 30% threshold"],
        })
        .eq("id", jobId);
      return { jobId, successRows: 0, failedRows: rows.length, errors: [...errors, { row: 0, message: "Import rolled back: too many failures" }] };
    }

    await client
      .from("import_jobs")
      .update({
        status: "completed",
        success_rows: successRows,
        failed_rows: errors.length,
        error_log: errors.map(e => `Row ${e.row}: ${e.message}`),
      })
      .eq("id", jobId);
  } catch (err) {
    await client
      .from("import_jobs")
      .update({
        status: "failed",
        success_rows: successRows,
        failed_rows: errors.length,
        error_log: [...errors.map(e => `Row ${e.row}: ${e.message}`), `Fatal: ${(err as Error).message}`],
      })
      .eq("id", jobId);
  }

  return { jobId, successRows, failedRows: errors.length, errors };
}

// ─── Rollback Import ─────────────────────────────────────────────────────────

async function rollbackImport(
  client: any,
  jobId: string
): Promise<{ success: boolean; message: string }> {
  const { data: job } = await client
    .from("import_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (!job) return { success: false, message: "Job not found" };
  if (job.status === "rolled_back") return { success: false, message: "Already rolled back" };
  if (job.status !== "importing" && job.status !== "completed") {
    return { success: false, message: `Cannot rollback job with status: ${job.status}` };
  }

  try {
    const deleted = await deleteImportedRows(client, job.entity_type, job.company_id, jobId);

    await client
      .from("import_jobs")
      .update({
        status: "rolled_back",
        error_log: [`Manually rolled back. Deleted ${deleted} rows.`],
      })
      .eq("id", jobId);

    return { success: true, message: `Rolled back. Deleted ${deleted} rows.` };
  } catch (err) {
    return { success: false, message: `Rollback failed: ${(err as Error).message}` };
  }
}

async function deleteImportedRows(
  client: any,
  entityType: string,
  companyId: string,
  jobId: string
): Promise<number> {
  const table = getTableName(entityType);

  // Delete rows created after the job started
  const { data: job } = await client.from("import_jobs").select("created_at").eq("id", jobId).single();
  if (!job?.created_at) return 0;

  const { count, error } = await client
    .from(table)
    .delete({ count: "exact" })
    .eq("company_id", companyId)
    .gte("created_at", job.created_at);

  if (error) throw new Error(error.message);
  return count || 0;
}

// ─── Build DB Row (post-transformation) ──────────────────────────────────────

function buildDbRow(
  row: Record<string, unknown>,
  entityType: string,
  companyId: string,
  lookups: {
    productMap: Map<string, string>;
    supplierMap: Map<string, string>;
    customerMap: Map<string, string>;
  }
): Record<string, unknown> {
  const dbRow: Record<string, unknown> = { ...row, company_id: companyId };

  if (entityType === "inventory_batch" && dbRow["product_name"]) {
    const pid = lookups.productMap.get(String(dbRow["product_name"]).toLowerCase());
    if (pid) { dbRow["product_id"] = pid; delete dbRow["product_name"]; }
    else throw new Error(`Product "${dbRow["product_name"]}" not found`);
  }

  if (dbRow["supplier_name"]) {
    const sid = lookups.supplierMap.get(String(dbRow["supplier_name"]).toLowerCase());
    if (sid) { dbRow["supplier_id"] = sid; delete dbRow["supplier_name"]; }
  }

  if (dbRow["customer_name"]) {
    const cid = lookups.customerMap.get(String(dbRow["customer_name"]).toLowerCase());
    if (cid) { dbRow["customer_id"] = cid; delete dbRow["customer_name"]; }
  }

  const numericFields = [
    "mrp", "purchase_price", "sale_price", "gst_percentage", "total_amount",
    "gst_amount", "discount_amount", "amount", "quantity",
    "min_stock_level", "max_stock_level", "reorder_level",
  ];
  for (const f of numericFields) {
    if (dbRow[f] !== undefined && dbRow[f] !== null && dbRow[f] !== "") {
      dbRow[f] = Number(dbRow[f]);
    }
  }

  return dbRow;
}

function getTableName(entityType: string): string {
  const table = {
    supplier: "suppliers",
    product: "products",
    customer: "customers",
    inventory_batch: "inventory_batches",
    purchase_order: "purchase_orders",
    sales_order: "sales_orders",
    payment: "payments",
  }[entityType];

  if (!table) throw new Error(`Unknown entity type: ${entityType}`);
  return table;
}
