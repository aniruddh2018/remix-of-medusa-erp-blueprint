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

    const { action, userId, updates } = await req.json();

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

    if (action === "delete") {
      // Delete user from auth (cascades to profiles and roles via FK)
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

      // Update profile fields (full_name, company_id, phone)
      const profileUpdates: Record<string, unknown> = {};
      if (updates.fullName !== undefined) profileUpdates.full_name = updates.fullName;
      if (updates.companyId !== undefined) profileUpdates.company_id = updates.companyId || null;
      if (updates.phone !== undefined) profileUpdates.phone = updates.phone || null;

      // If company changes, also update business_module
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

      // Update role if provided
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

      // Update auth email if provided
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

      // Reset password if provided
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
      JSON.stringify({ error: "Invalid action. Use 'update' or 'delete'" }),
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
