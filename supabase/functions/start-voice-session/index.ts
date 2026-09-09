// Starts a hands-free voice agent session: kicks off the AgentCore Runtime
// container (which opens the actual Nova Sonic connection and subscribes to
// AppSync Events) and hands the browser a sessionId to connect its own
// AppSync Events subscription to for the real-time audio relay.
//
// Auth model: AgentCore Runtime's inbound authorizer is configured for JWT
// bearer tokens validated against this Supabase project's own OIDC
// discovery URL (see voice-agent-infra/lib/voice-agent-infra-stack.ts) — so
// this function simply forwards the SAME JWT the browser already sent it,
// rather than needing a separate AWS credential of its own. No IAM/SigV4
// signing needed for this call.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AGENT_RUNTIME_ARN = "arn:aws:bedrock-agentcore:us-east-1:906847091239:runtime/voice_erp_agent-AVzuqMG64G";
const REGION = "us-east-1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const { voiceId } = await req.json().catch(() => ({}));
    const sessionId = crypto.randomUUID();

    const escapedArn = encodeURIComponent(AGENT_RUNTIME_ARN);
    const invokeUrl = `https://bedrock-agentcore.${REGION}.amazonaws.com/runtimes/${escapedArn}/invocations?qualifier=DEFAULT`;

    const res = await fetch(invokeUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader, // forward the caller's own Supabase JWT
        "Content-Type": "application/json",
        "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionId,
      },
      body: JSON.stringify({ sessionId, userId: user.id, voiceId: voiceId || "matthew" }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AgentCore invoke failed (${res.status}): ${errText}`);
    }

    return new Response(
      JSON.stringify({ success: true, sessionId, userId: user.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
