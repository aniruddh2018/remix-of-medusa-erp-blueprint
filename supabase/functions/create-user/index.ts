import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callingUser }, error: userError } = await userClient.auth.getUser();
    if (userError || !callingUser) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - please sign in again" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check caller roles (user may have multiple roles)
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callingUser.id);

    const callerRoles = (roleData || []).map((r: { role: string }) => r.role);
    const isSuperAdmin = callerRoles.includes("super_admin");
    const isAdmin = callerRoles.includes("admin") || isSuperAdmin;

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Only admins can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, fullName, role, companyId } = await req.json();

    if (!email || !password || !fullName) {
      return new Response(
        JSON.stringify({ error: "Email, password, and full name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine target company_id
    let targetCompanyId = companyId;
    if (!isSuperAdmin) {
      // Regular admin can only create users in their own company
      const { data: callerProfile } = await adminClient
        .from("profiles")
        .select("company_id")
        .eq("user_id", callingUser.id)
        .maybeSingle();
      targetCompanyId = callerProfile?.company_id;
    }

    // Super admins can assign any company_id, and can set role to "admin"
    // Regular admins cannot create admins or super_admins
    if (!isSuperAdmin && (role === "admin" || role === "super_admin")) {
      return new Response(
        JSON.stringify({ error: "Only super admins can assign admin or super_admin roles" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the new user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (newUser.user) {
      // Fetch company business_type to set on profile
      let businessModule = "pharmacy";
      if (targetCompanyId) {
        const { data: companyData } = await adminClient
          .from("companies")
          .select("business_type")
          .eq("id", targetCompanyId)
          .maybeSingle();
        if (companyData?.business_type) {
          businessModule = companyData.business_type;
        }
      }

      // The handle_new_user trigger already created a profile, so update it
      const { error: profileError } = await adminClient
        .from("profiles")
        .update({
          full_name: fullName,
          company_id: targetCompanyId || null,
          business_module: businessModule,
        })
        .eq("user_id", newUser.user.id);

      if (profileError) {
        console.log("Profile update error:", profileError.message);
      }

      // Update role if not default staff
      if (role && role !== "staff") {
        const { error: updateRoleError } = await adminClient
          .from("user_roles")
          .update({ role })
          .eq("user_id", newUser.user.id);

        if (updateRoleError) {
          console.log("Failed to update role:", updateRoleError.message);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, user: { id: newUser.user?.id, email: newUser.user?.email } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error creating user:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
