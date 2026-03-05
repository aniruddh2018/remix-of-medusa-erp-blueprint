import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImportRow {
  [key: string]: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user is super_admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check super_admin role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Only super admins can import data" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, company_id, rows } = await req.json() as {
      type: "suppliers" | "products" | "inventory";
      company_id: string;
      rows: ImportRow[];
    };

    if (!type || !company_id || !rows || !Array.isArray(rows)) {
      return new Response(JSON.stringify({ error: "Missing type, company_id, or rows" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: ImportResult;

    switch (type) {
      case "suppliers":
        result = await importSuppliers(adminClient, company_id, rows);
        break;
      case "products":
        result = await importProducts(adminClient, company_id, rows);
        break;
      case "inventory":
        result = await importInventory(adminClient, company_id, rows);
        break;
      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("CSV import error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function importSuppliers(client: any, companyId: string, rows: ImportRow[]): Promise<ImportResult> {
  let success = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row.name?.trim();
    if (!name) {
      errors.push(`Row ${i + 1}: Missing supplier name`);
      continue;
    }

    const { error } = await client.from("suppliers").insert({
      company_id: companyId,
      name,
      contact_person: row.contact_person?.trim() || null,
      phone: row.phone?.trim() || null,
      email: row.email?.trim() || null,
      gst_number: row.gst_number?.trim() || null,
      drug_license_number: row.drug_license_number?.trim() || null,
      address: row.address?.trim() || null,
    });

    if (error) {
      errors.push(`Row ${i + 1} (${name}): ${error.message}`);
    } else {
      success++;
    }
  }

  return { success, failed: errors.length, errors };
}

async function importProducts(client: any, companyId: string, rows: ImportRow[]): Promise<ImportResult> {
  let success = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row.name?.trim();
    const manufacturer = row.manufacturer?.trim();

    if (!name) {
      errors.push(`Row ${i + 1}: Missing product name`);
      continue;
    }
    if (!manufacturer) {
      errors.push(`Row ${i + 1} (${name}): Missing manufacturer`);
      continue;
    }

    const mrp = parseFloat(row.mrp) || 0;
    const purchasePrice = parseFloat(row.purchase_price) || 0;

    if (mrp <= 0) {
      errors.push(`Row ${i + 1} (${name}): Invalid MRP`);
      continue;
    }
    if (purchasePrice <= 0) {
      errors.push(`Row ${i + 1} (${name}): Invalid purchase price`);
      continue;
    }

    const validSchedules = ["none", "schedule_h", "schedule_h1", "schedule_x", "narcotic"];
    const drugSchedule = validSchedules.includes(row.drug_schedule?.trim()) ? row.drug_schedule.trim() : "none";

    const { error } = await client.from("products").insert({
      company_id: companyId,
      name,
      manufacturer,
      category: row.category?.trim() || null,
      unit: row.unit?.trim() || "pcs",
      mrp,
      purchase_price: purchasePrice,
      sale_price: parseFloat(row.sale_price) || null,
      gst_percentage: parseFloat(row.gst_percentage) || 12,
      hsn_code: row.hsn_code?.trim() || null,
      generic_name: row.generic_name?.trim() || null,
      composition: row.composition?.trim() || null,
      strength: row.strength?.trim() || null,
      drug_schedule: drugSchedule,
      min_stock_level: parseInt(row.min_stock_level) || 10,
      max_stock_level: parseInt(row.max_stock_level) || 1000,
      reorder_level: parseInt(row.reorder_level) || 20,
    });

    if (error) {
      errors.push(`Row ${i + 1} (${name}): ${error.message}`);
    } else {
      success++;
    }
  }

  return { success, failed: errors.length, errors };
}

async function importInventory(client: any, companyId: string, rows: ImportRow[]): Promise<ImportResult> {
  let success = 0;
  const errors: string[] = [];

  // Pre-fetch products and suppliers for matching
  const { data: products } = await client.from("products").select("id, name").eq("company_id", companyId);
  const { data: suppliers } = await client.from("suppliers").select("id, name").eq("company_id", companyId);

  const productMap = new Map((products || []).map((p: any) => [p.name.toLowerCase(), p.id]));
  const supplierMap = new Map((suppliers || []).map((s: any) => [s.name.toLowerCase(), s.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const productName = row.product_name?.trim();
    const batchNumber = row.batch_number?.trim();

    if (!productName) {
      errors.push(`Row ${i + 1}: Missing product_name`);
      continue;
    }
    if (!batchNumber) {
      errors.push(`Row ${i + 1} (${productName}): Missing batch_number`);
      continue;
    }

    const productId = productMap.get(productName.toLowerCase());
    if (!productId) {
      errors.push(`Row ${i + 1} (${productName}): Product not found — import products first`);
      continue;
    }

    const supplierId = row.supplier_name?.trim()
      ? supplierMap.get(row.supplier_name.trim().toLowerCase()) || null
      : null;

    const expiryDate = row.expiry_date?.trim();
    if (!expiryDate) {
      errors.push(`Row ${i + 1} (${productName}, ${batchNumber}): Missing expiry_date`);
      continue;
    }

    const mrp = parseFloat(row.mrp) || 0;
    const purchasePrice = parseFloat(row.purchase_price) || 0;
    const quantity = parseInt(row.quantity) || 0;

    if (mrp <= 0 || purchasePrice <= 0) {
      errors.push(`Row ${i + 1} (${productName}, ${batchNumber}): Invalid MRP or purchase price`);
      continue;
    }

    const { error } = await client.from("inventory_batches").insert({
      company_id: companyId,
      product_id: productId,
      batch_number: batchNumber,
      quantity,
      purchase_price: purchasePrice,
      mrp,
      expiry_date: expiryDate,
      manufacturing_date: row.manufacturing_date?.trim() || null,
      supplier_id: supplierId,
    });

    if (error) {
      errors.push(`Row ${i + 1} (${productName}, ${batchNumber}): ${error.message}`);
    } else {
      success++;
    }
  }

  return { success, failed: errors.length, errors };
}
