import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface StagingProduct {
  name: string;
  generic_name?: string;
  manufacturer_name?: string;
  category?: string;
  hsn_code?: string;
  unit?: string;
  mrp?: number | string;
  purchase_price?: number | string;
  sale_price?: number | string;
  gst_percentage?: number | string;
  composition?: string;
  strength?: string;
  opening_balance?: number | string;
  opening_value?: number | string;
  source_data?: Record<string, unknown>;
}

interface StagingLedger {
  name: string;
  parent_group_name?: string;
  ledger_type: string;
  gst_number?: string;
  pan_number?: string;
  phone?: string;
  email?: string;
  address?: string;
  state?: string;
  opening_balance?: number | string;
  balance_type?: string;
  source_data?: Record<string, unknown>;
}

interface StagingBatch {
  product_name: string;
  batch_number?: string;
  quantity?: number | string;
  mrp?: number | string;
  purchase_price?: number | string;
  expiry_date?: string;
  manufacturing_date?: string;
  supplier_name?: string;
  godown_name?: string;
  source_data?: Record<string, unknown>;
}

interface StagingSupplier {
  name: string;
  gst_number?: string;
  pan_number?: string;
  phone?: string;
  email?: string;
  address?: string;
  state?: string;
  contact_person?: string;
  drug_license_number?: string;
  parent_group_name?: string;
  source_data?: Record<string, unknown>;
}

function validateProduct(p: StagingProduct): string[] {
  const errors: string[] = [];
  if (!p.name?.trim()) errors.push("name is required");
  if (p.gst_percentage !== undefined && Number(p.gst_percentage) > 40) errors.push("gst_percentage exceeds 40%");
  const mrp = Number(p.mrp || 0);
  const pp = Number(p.purchase_price || 0);
  if (mrp > 0 && pp > 0 && mrp < pp) errors.push("mrp is less than purchase_price");
  return errors;
}

function validateLedger(l: StagingLedger): string[] {
  const errors: string[] = [];
  if (!l.name?.trim()) errors.push("name is required");
  if (!l.parent_group_name?.trim()) errors.push("parent_group_name is required");
  if (l.gst_number && !/^\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d]$/.test(l.gst_number)) {
    errors.push("invalid GST number format");
  }
  return errors;
}

function validateBatch(b: StagingBatch): string[] {
  const errors: string[] = [];
  if (!b.product_name?.trim()) errors.push("product_name is required");
  if (b.expiry_date && new Date(b.expiry_date).toString() === "Invalid Date") errors.push("invalid expiry_date");
  return errors;
}

function validateSupplier(s: StagingSupplier): string[] {
  const errors: string[] = [];
  if (!s.name?.trim()) errors.push("name is required");
  return errors;
}

function toNum(v: unknown): number | null {
  const n = Number(v);
  return isNaN(n) ? null : n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json() as Record<string, unknown>;
    const stage = body.stage as string;

    switch (stage) {
      case "create_session": {
        const { company_id, name, source_system, file_name, file_size } = body as {
          company_id: string; name?: string; source_system?: string; file_name?: string; file_size?: number;
        };
        if (!company_id) {
          return new Response(JSON.stringify({ error: "Missing company_id" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data, error } = await serviceClient.from("import_sessions").insert({
          company_id,
          user_id: user.id,
          name: name || "Untitled Migration",
          source_system: source_system || "tally",
          file_name,
          file_size,
          status: "uploaded",
        }).select("id").single();
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ session_id: data.id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "write_staging": {
        const { session_id, company_id, entity_type, rows } = body as {
          session_id: string; company_id: string; entity_type: string; rows: Record<string, unknown>[];
        };
        if (!session_id || !company_id || !entity_type || !rows) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const tableMap: Record<string, string> = {
          product: "staging_products",
          ledger: "staging_ledgers",
          batch: "staging_batches",
          supplier: "staging_suppliers",
        };
        const table = tableMap[entity_type];
        if (!table) {
          return new Response(JSON.stringify({ error: `Unknown entity_type: ${entity_type}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const stagingRows: Record<string, unknown>[] = [];
        const validationSummary = { total: rows.length, valid: 0, invalid: 0, warnings: 0 };

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          let errors: string[] = [];

          if (entity_type === "product") errors = validateProduct(row as unknown as StagingProduct);
          else if (entity_type === "ledger") errors = validateLedger(row as unknown as StagingLedger);
          else if (entity_type === "batch") errors = validateBatch(row as unknown as StagingBatch);
          else if (entity_type === "supplier") errors = validateSupplier(row as unknown as StagingSupplier);

          const status = errors.length > 0 ? "invalid" : "valid";
          if (status === "valid") validationSummary.valid++;
          else validationSummary.invalid++;

          const base: Record<string, unknown> = {
            session_id,
            company_id,
            row_index: i,
            validation_status: status,
            validation_errors: errors,
          };

          if (entity_type === "product") {
            const p = row as unknown as StagingProduct;
            Object.assign(base, {
              name: p.name,
              generic_name: p.generic_name || null,
              manufacturer_name: p.category || null,
              category: p.category || null,
              hsn_code: p.hsn_code || null,
              unit: p.unit || "PCS",
              mrp: toNum(p.mrp),
              purchase_price: toNum(p.purchase_price),
              sale_price: toNum(p.sale_price),
              gst_percentage: toNum(p.gst_percentage),
              composition: p.composition || null,
              strength: p.strength || null,
              opening_balance: toNum(p.opening_balance),
              opening_value: toNum(p.opening_value),
              source_data: p.source_data || {},
            });
          } else if (entity_type === "ledger") {
            const l = row as unknown as StagingLedger;
            Object.assign(base, {
              name: l.name,
              parent_group_name: l.parent_group_name || null,
              ledger_type: l.ledger_type || "general",
              gst_number: l.gst_number || null,
              pan_number: l.pan_number || null,
              phone: l.phone || null,
              email: l.email || null,
              address: l.address || null,
              state: l.state || null,
              opening_balance: toNum(l.opening_balance),
              balance_type: l.balance_type || "debit",
              source_data: l.source_data || {},
            });
          } else if (entity_type === "batch") {
            const b = row as unknown as StagingBatch;
            Object.assign(base, {
              product_name: b.product_name,
              batch_number: b.batch_number || null,
              quantity: toNum(b.quantity),
              mrp: toNum(b.mrp),
              purchase_price: toNum(b.purchase_price),
              expiry_date: b.expiry_date || null,
              manufacturing_date: b.manufacturing_date || null,
              supplier_name: b.supplier_name || null,
              godown_name: b.godown_name || null,
              source_data: b.source_data || {},
            });
          } else if (entity_type === "supplier") {
            const s = row as unknown as StagingSupplier;
            Object.assign(base, {
              name: s.name,
              gst_number: s.gst_number || null,
              pan_number: s.pan_number || null,
              phone: s.phone || null,
              email: s.email || null,
              address: s.address || null,
              state: s.state || null,
              contact_person: s.contact_person || null,
              drug_license_number: s.drug_license_number || null,
              parent_group_name: s.parent_group_name || null,
              source_data: s.source_data || {},
            });
          }

          stagingRows.push(base);
        }

        const BATCH_SIZE = 200;
        let inserted = 0;
        for (let i = 0; i < stagingRows.length; i += BATCH_SIZE) {
          const batch = stagingRows.slice(i, i + BATCH_SIZE);
          const { error: insertError } = await serviceClient.from(table).insert(batch);
          if (insertError) {
            return new Response(JSON.stringify({ error: `Insert failed at batch ${i}: ${insertError.message}` }), {
              status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          inserted += batch.length;
        }

        await serviceClient.from("import_sessions").update({
          staging_summary: { [entity_type]: validationSummary },
          status: "staging",
        }).eq("id", session_id);

        return new Response(JSON.stringify({
          entity_type,
          inserted,
          validation: validationSummary,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "preview_staging": {
        const { session_id, company_id, entity_type, limit, offset } = body as {
          session_id: string; company_id: string; entity_type: string; limit?: number; offset?: number;
        };
        const tableMap: Record<string, string> = {
          product: "staging_products",
          ledger: "staging_ledgers",
          batch: "staging_batches",
          supplier: "staging_suppliers",
        };
        const table = tableMap[entity_type];
        if (!table) {
          return new Response(JSON.stringify({ error: `Unknown entity_type: ${entity_type}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let query = serviceClient.from(table)
          .select("*", { count: "exact" })
          .eq("session_id", session_id)
          .eq("company_id", company_id)
          .order("row_index");
        if (offset) query = query.range(offset, (offset + (limit || 50)) - 1);
        else query = query.limit(limit || 50);

        const { data, count, error } = await query;
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const validCount = (data as Record<string, unknown>[]).filter(r => r.validation_status === "valid").length;
        const invalidCount = (data as Record<string, unknown>[]).filter(r => r.validation_status === "invalid").length;

        return new Response(JSON.stringify({
          rows: data,
          total: count,
          valid: validCount,
          invalid: invalidCount,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "confirm_staging": {
        const { session_id, company_id } = body as { session_id: string; company_id: string };
        if (!session_id || !company_id) {
          return new Response(JSON.stringify({ error: "Missing session_id or company_id" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await serviceClient.from("import_sessions").update({ status: "importing" }).eq("id", session_id);

        const importOrder = ["ledger_group", "manufacturer", "supplier", "customer", "product", "batch"];
        const importResults: Record<string, { success: number; failed: number; errors: string[] }> = {};
        let totalSuccess = 0;
        let totalFailed = 0;

        for (const entityType of importOrder) {
          const result = await confirmEntity(serviceClient, session_id, company_id, entityType);
          importResults[entityType] = result;
          totalSuccess += result.success;
          totalFailed += result.failed;
        }

        const failureRate = (totalSuccess + totalFailed) > 0 ? totalFailed / (totalSuccess + totalFailed) : 0;
        const finalStatus = failureRate > 0.3 ? "rolled_back" : "completed";

        if (finalStatus === "rolled_back") {
          await rollbackSession(serviceClient, session_id, company_id);
        }

        await serviceClient.from("import_sessions").update({
          status: finalStatus,
          import_summary: { totalSuccess, totalFailed, failureRate: Math.round(failureRate * 100), details: importResults },
        }).eq("id", session_id);

        return new Response(JSON.stringify({
          status: finalStatus,
          totalSuccess: finalStatus === "rolled_back" ? 0 : totalSuccess,
          totalFailed,
          details: importResults,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "resolve_staging": {
        const { staging_id, entity_type, updates } = body as {
          staging_id: string; entity_type: string; updates: Record<string, unknown>;
        };
        const tableMap: Record<string, string> = {
          product: "staging_products",
          ledger: "staging_ledgers",
          batch: "staging_batches",
          supplier: "staging_suppliers",
        };
        const table = tableMap[entity_type];
        if (!table) {
          return new Response(JSON.stringify({ error: `Unknown entity_type: ${entity_type}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error } = await serviceClient.from(table).update({
          ...updates,
          resolved: true,
          validation_status: "valid",
          validation_errors: [],
        }).eq("id", staging_id);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "rollback_session": {
        const { session_id, company_id } = body as { session_id: string; company_id: string };
        const result = await rollbackSession(serviceClient, session_id, company_id);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "export_errors": {
        const { session_id, company_id, entity_type } = body as {
          session_id: string; company_id: string; entity_type: string;
        };
        const tableMap: Record<string, string> = {
          product: "staging_products",
          ledger: "staging_ledgers",
          batch: "staging_batches",
          supplier: "staging_suppliers",
        };
        const table = tableMap[entity_type];
        if (!table) {
          return new Response(JSON.stringify({ error: `Unknown entity_type: ${entity_type}` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data, error } = await serviceClient.from(table)
          .select("row_index, name, validation_errors, validation_status")
          .eq("session_id", session_id)
          .eq("company_id", company_id)
          .eq("validation_status", "invalid");

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ errors: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown stage: ${stage}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    console.error("Migration staging error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function confirmEntity(
  client: any,
  sessionId: string,
  companyId: string,
  entityType: string
): Promise<{ success: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let success = 0;
  let failed = 0;

  if (entityType === "ledger_group") {
    const { data: ledgers } = await client.from("staging_ledgers")
      .select("parent_group_name")
      .eq("session_id", sessionId)
      .eq("company_id", companyId);

    const groupNames = new Set<string>();
    for (const l of (ledgers || [])) {
      if (l.parent_group_name) groupNames.add(l.parent_group_name);
    }

    for (const gName of groupNames) {
      const { error } = await client.from("ledger_groups").upsert({
        company_id: companyId,
        name: gName,
        source_system: "imported",
      }, { onConflict: "company_id,name" });
      if (error) errors.push(`Group "${gName}": ${error.message}`);
      else success++;
    }
    return { success, failed: errors.length, errors };
  }

  if (entityType === "manufacturer") {
    const { data: products } = await client.from("staging_products")
      .select("category")
      .eq("session_id", sessionId)
      .eq("company_id", companyId);

    const mfrNames = new Set<string>();
    for (const p of (products || [])) {
      if (p.category) mfrNames.add(p.category);
    }

    for (const mfrName of mfrNames) {
      const { error } = await client.from("manufacturers").upsert({
        company_id: companyId,
        name: mfrName,
        source_system: "imported",
      }, { onConflict: "company_id,name" });
      if (error) errors.push(`Manufacturer "${mfrName}": ${error.message}`);
      else success++;
    }
    return { success, failed: errors.length, errors };
  }

  if (entityType === "supplier") {
    const { data: rows } = await client.from("staging_suppliers")
      .select("*")
      .eq("session_id", sessionId)
      .eq("company_id", companyId)
      .eq("validation_status", "valid");

    for (const row of (rows || [])) {
      const { error } = await client.from("suppliers").upsert({
        company_id: companyId,
        name: row.name,
        gst_number: row.gst_number || null,
        phone: row.phone || null,
        email: row.email || null,
        address: row.address || null,
        drug_license_number: row.drug_license_number || null,
        contact_person: row.contact_person || null,
      }, { onConflict: "company_id,name" });
      if (error) { errors.push(`Supplier "${row.name}": ${error.message}`); failed++; }
      else { success++; await client.from("staging_suppliers").update({ validation_status: "imported" }).eq("id", row.id); }
    }
    return { success, failed, errors };
  }

  if (entityType === "customer") {
    const { data: ledgers } = await client.from("staging_ledgers")
      .select("*")
      .eq("session_id", sessionId)
      .eq("company_id", companyId)
      .eq("ledger_type", "customer")
      .eq("validation_status", "valid");

    for (const row of (ledgers || [])) {
      const { error } = await client.from("customers").upsert({
        company_id: companyId,
        name: row.name,
        phone: row.phone || null,
        email: row.email || null,
        address: row.address || null,
        gst_number: row.gst_number || null,
      }, { onConflict: "company_id,name" });
      if (error) { errors.push(`Customer "${row.name}": ${error.message}`); failed++; }
      else { success++; await client.from("staging_ledgers").update({ validation_status: "imported" }).eq("id", row.id); }
    }
    return { success, failed, errors };
  }

  if (entityType === "product") {
    const { data: mfrs } = await client.from("manufacturers").select("id, name").eq("company_id", companyId);
    const mfrMap = new Map((mfrs || []).map((m: any) => [m.name, m.id]));

    const { data: rows } = await client.from("staging_products")
      .select("*")
      .eq("session_id", sessionId)
      .eq("company_id", companyId)
      .in("validation_status", ["valid", "warning"]);

    for (const row of (rows || [])) {
      const manufacturerId = mfrMap.get(row.category) || null;
      const { error } = await client.from("products").upsert({
        company_id: companyId,
        name: row.name,
        manufacturer: row.category || "Unknown",
        manufacturer_id: manufacturerId,
        generic_name: row.generic_name || null,
        category: row.category || null,
        hsn_code: row.hsn_code || null,
        unit: row.unit || "PCS",
        mrp: Number(row.mrp) || 0,
        purchase_price: Number(row.purchase_price) || 0,
        sale_price: Number(row.sale_price) || 0,
        gst_percentage: Number(row.gst_percentage) || 0,
        composition: row.composition || null,
        strength: row.strength || null,
      }, { onConflict: "company_id,name" });
      if (error) { errors.push(`Product "${row.name}": ${error.message}`); failed++; }
      else { success++; await client.from("staging_products").update({ validation_status: "imported", mapped_manufacturer_id: manufacturerId }).eq("id", row.id); }
    }
    return { success, failed, errors };
  }

  if (entityType === "batch") {
    const { data: prods } = await client.from("products").select("id, name").eq("company_id", companyId);
    const prodMap = new Map((prods || []).map((p: any) => [p.name.toLowerCase(), p.id]));
    const { data: sups } = await client.from("suppliers").select("id, name").eq("company_id", companyId);
    const supMap = new Map((sups || []).map((s: any) => [s.name.toLowerCase(), s.id]));

    const { data: rows } = await client.from("staging_batches")
      .select("*")
      .eq("session_id", sessionId)
      .eq("company_id", companyId)
      .in("validation_status", ["valid", "warning"]);

    for (const row of (rows || [])) {
      const productId = prodMap.get(String(row.product_name).toLowerCase());
      if (!productId) { errors.push(`Batch "${row.batch_number}": product "${row.product_name}" not found`); failed++; continue; }
      const supplierId = row.supplier_name ? supMap.get(String(row.supplier_name).toLowerCase()) : null;

      const { error } = await client.from("inventory_batches").upsert({
        company_id: companyId,
        product_id: productId,
        batch_number: row.batch_number || "NO-BATCH",
        quantity: Number(row.quantity) || 0,
        mrp: Number(row.mrp) || 0,
        purchase_price: Number(row.purchase_price) || 0,
        expiry_date: row.expiry_date || null,
        manufacturing_date: row.manufacturing_date || null,
        supplier_id: supplierId || null,
      }, { onConflict: "company_id,product_id,batch_number" });
      if (error) { errors.push(`Batch "${row.batch_number}": ${error.message}`); failed++; }
      else { success++; await client.from("staging_batches").update({ validation_status: "imported", mapped_product_id: productId, mapped_supplier_id: supplierId }).eq("id", row.id); }
    }
    return { success, failed, errors };
  }

  return { success: 0, failed: 0, errors: [`Unknown entity type: ${entityType}`] };
}

async function rollbackSession(
  client: any,
  sessionId: string,
  companyId: string
): Promise<{ success: boolean; message: string; deleted: number }> {
  const { data: session } = await client.from("import_sessions").select("created_at").eq("id", sessionId).single();
  if (!session?.created_at) return { success: false, message: "Session not found", deleted: 0 };

  let totalDeleted = 0;
  const tables = ["suppliers", "customers", "products", "inventory_batches", "ledger_groups", "manufacturers"];
  for (const table of tables) {
    const { count } = await client.from(table)
      .delete({ count: "exact" })
      .eq("company_id", companyId)
      .gte("created_at", session.created_at);
    totalDeleted += count || 0;
  }

  const stagingTables = ["staging_products", "staging_ledgers", "staging_batches", "staging_suppliers"];
  for (const table of stagingTables) {
    await client.from(table).delete().eq("session_id", sessionId);
  }

  await client.from("import_sessions").update({
    status: "rolled_back",
    error_log: [`Rolled back. Deleted ${totalDeleted} production rows.`],
  }).eq("id", sessionId);

  return { success: true, message: `Rolled back. Deleted ${totalDeleted} rows.`, deleted: totalDeleted };
}
