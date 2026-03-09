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
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Only super admins can use this endpoint
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callingUser.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Only super admins can manage users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, userId, updates, companyId } = await req.json();

    // ── Delete Company ──
    if (action === "delete_company") {
      if (!companyId) {
        return new Response(
          JSON.stringify({ error: "companyId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Prevent deleting own company
      const { data: callerProfile } = await adminClient
        .from("profiles")
        .select("company_id")
        .eq("user_id", callingUser.id)
        .maybeSingle();

      if (callerProfile?.company_id === companyId) {
        return new Response(
          JSON.stringify({ error: "Cannot delete your own company" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Prevent deleting companies with super admin users
      const { data: superAdminUsers } = await adminClient
        .from("profiles")
        .select("user_id")
        .eq("company_id", companyId);

      if (superAdminUsers && superAdminUsers.length > 0) {
        const superAdminChecks = await Promise.all(
          superAdminUsers.map(async (u) => {
            const { data: saRole } = await adminClient
              .from("user_roles")
              .select("role")
              .eq("user_id", u.user_id)
              .eq("role", "super_admin")
              .maybeSingle();
            return !!saRole;
          })
        );
        if (superAdminChecks.some(Boolean)) {
          return new Response(
            JSON.stringify({ error: "Cannot delete company: it contains super admin user(s)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Check if company has users
      const { data: companyUsers } = await adminClient
        .from("profiles")
        .select("user_id")
        .eq("company_id", companyId);

      if (companyUsers && companyUsers.length > 0) {
        return new Response(
          JSON.stringify({ error: `Cannot delete company: it has ${companyUsers.length} user(s) assigned. Reassign or delete them first.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete related data first
      await adminClient.from("invoice_settings").delete().eq("company_id", companyId);
      
      const { error: deleteError } = await adminClient
        .from("companies")
        .delete()
        .eq("id", companyId);

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: "Failed to delete company: " + deleteError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Company deleted" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── User actions require userId ──
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent self-deletion
    if (action === "delete" && userId === callingUser.id) {
      return new Response(
        JSON.stringify({ error: "Cannot delete your own account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent deleting super admins
    if (action === "delete") {
      const { data: targetRoleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .maybeSingle();

      if (targetRoleData) {
        return new Response(
          JSON.stringify({ error: "Super admin accounts cannot be deleted" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "delete") {
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteError) {
        return new Response(
          JSON.stringify({ error: deleteError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "User deleted" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "update") {
      if (!updates) {
        return new Response(
          JSON.stringify({ error: "updates object is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const profileUpdates: Record<string, unknown> = {};
      if (updates.fullName !== undefined) profileUpdates.full_name = updates.fullName;
      if (updates.companyId !== undefined) profileUpdates.company_id = updates.companyId || null;
      if (updates.phone !== undefined) profileUpdates.phone = updates.phone || null;

      if (updates.companyId) {
        const { data: companyData } = await adminClient
          .from("companies")
          .select("business_type")
          .eq("id", updates.companyId)
          .maybeSingle();
        if (companyData?.business_type) {
          profileUpdates.business_module = companyData.business_type;
        }
      }

      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await adminClient
          .from("profiles")
          .update(profileUpdates)
          .eq("user_id", userId);
        if (profileError) {
          return new Response(
            JSON.stringify({ error: "Failed to update profile: " + profileError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      if (updates.role) {
        const { error: roleError } = await adminClient
          .from("user_roles")
          .update({ role: updates.role })
          .eq("user_id", userId);
        if (roleError) {
          return new Response(
            JSON.stringify({ error: "Failed to update role: " + roleError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      if (updates.email) {
        const { error: emailError } = await adminClient.auth.admin.updateUserById(userId, {
          email: updates.email,
        });
        if (emailError) {
          return new Response(
            JSON.stringify({ error: "Failed to update email: " + emailError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      if (updates.password) {
        const { error: pwError } = await adminClient.auth.admin.updateUserById(userId, {
          password: updates.password,
        });
        if (pwError) {
          return new Response(
            JSON.stringify({ error: "Failed to reset password: " + pwError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: "User updated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'update', 'delete', or 'delete_company'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error managing user:", error);
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
