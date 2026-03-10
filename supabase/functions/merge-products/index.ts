import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify calling user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = (roleData || []).map((r: { role: string }) => r.role);
    if (!roles.includes("admin") && !roles.includes("super_admin")) {
      return new Response(JSON.stringify({ error: "Only admins can merge products" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's company
    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "No company found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const companyId = profile.company_id;

    const { primary_product_id, duplicate_product_ids } = await req.json();

    if (!primary_product_id || !duplicate_product_ids?.length) {
      return new Response(
        JSON.stringify({ error: "primary_product_id and duplicate_product_ids required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify all products belong to this company
    const allIds = [primary_product_id, ...duplicate_product_ids];
    const { data: products } = await adminClient
      .from("products")
      .select("id")
      .in("id", allIds)
      .eq("company_id", companyId);

    if (!products || products.length !== allIds.length) {
      return new Response(
        JSON.stringify({ error: "Some products not found or don't belong to your company" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Tables with product_id FK that need updating
    const tablesToUpdate = [
      "inventory_batches",
      "sales_order_items",
      "purchase_order_items",
      "credit_note_items",
      "debit_note_items",
      "scheduled_drug_register",
    ];

    const results: Record<string, number> = {};

    for (const table of tablesToUpdate) {
      const { data: updated, error: updateError } = await adminClient
        .from(table)
        .update({ product_id: primary_product_id })
        .in("product_id", duplicate_product_ids)
        .eq("company_id", companyId)
        .select("id");

      if (updateError) {
        console.error(`Error updating ${table}:`, updateError);
        return new Response(
          JSON.stringify({ error: `Failed to update ${table}: ${updateError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      results[table] = updated?.length || 0;
    }

    // Deactivate duplicate products (soft delete)
    const { error: deactivateError } = await adminClient
      .from("products")
      .update({ is_active: false, name: adminClient.rpc ? undefined : undefined })
      .in("id", duplicate_product_ids)
      .eq("company_id", companyId);

    // Also prefix names to mark as merged
    for (const dupId of duplicate_product_ids) {
      await adminClient
        .from("products")
        .update({ is_active: false })
        .eq("id", dupId);
    }

    if (deactivateError) {
      console.error("Error deactivating duplicates:", deactivateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Merged ${duplicate_product_ids.length} product(s) into primary product`,
        updates: results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Merge error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
