/* eslint-disable @typescript-eslint/no-explicit-any */
// ERP Action Agent — Phase 1
// Tool-calling LLM with HITL approval. Mutating tools never write directly;
// they queue a row in `agent_pending_actions` for the user to approve.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "google/gemini-2.5-flash";
const MAX_STEPS = 6;

// ───────────────────────── Tool catalog ─────────────────────────
const tools = [
  {
    type: "function",
    function: {
      name: "search_customers",
      description: "Search existing customers in the current company by name or phone. Use this BEFORE proposing upsert_customer so you can update an existing match instead of creating a duplicate.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Name fragment or phone digits" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Search existing products in the current company by name. Use this BEFORE proposing create_product to avoid duplicates.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Product name fragment" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_customer",
      description: "Propose creating a new customer (or updating an existing one if `id` is provided). REQUIRES HUMAN APPROVAL — the user will be shown a preview and must click Approve.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Existing customer UUID to update. Omit to create a new customer." },
          name: { type: "string", minLength: 1, maxLength: 200 },
          phone: { type: "string", maxLength: 20 },
          email: { type: "string", maxLength: 255 },
          address: { type: "string", maxLength: 500 },
          gst_number: { type: "string", maxLength: 20 },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_product",
      description: "Propose creating a new product. REQUIRES HUMAN APPROVAL.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200 },
          manufacturer: { type: "string", minLength: 1, maxLength: 200 },
          mrp: { type: "number", minimum: 0 },
          purchase_price: { type: "number", minimum: 0 },
          gst_percentage: { type: "number", minimum: 0, maximum: 28, default: 18 },
          hsn_code: { type: "string", maxLength: 20 },
          unit: { type: "string", maxLength: 20, default: "pcs" },
          category: { type: "string", maxLength: 100 },
          strength: { type: "string", maxLength: 50 },
        },
        required: ["name", "manufacturer", "mrp", "purchase_price"],
      },
    },
  },
];

const MUTATING_TOOLS = new Set(["upsert_customer", "create_product"]);

// ───────────────────────── Zod-like guardrails (server) ─────────────────────────
function validateUpsertCustomer(input: any): { ok: true; data: any } | { ok: false; code: string; message: string } {
  if (!input || typeof input.name !== "string" || !input.name.trim()) return { ok: false, code: "INVALID_NAME", message: "Customer name is required." };
  if (input.name.length > 200) return { ok: false, code: "NAME_TOO_LONG", message: "Name must be ≤200 characters." };
  if (input.phone && !/^[+\d\s()-]{6,20}$/.test(String(input.phone))) return { ok: false, code: "BAD_PHONE", message: "Phone format invalid." };
  if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(input.email))) return { ok: false, code: "BAD_EMAIL", message: "Email format invalid." };
  if (input.gst_number && !/^[0-9A-Z]{10,20}$/i.test(String(input.gst_number))) return { ok: false, code: "BAD_GSTIN", message: "GSTIN format invalid." };
  return {
    ok: true,
    data: {
      id: input.id || null,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      gst_number: input.gst_number?.toUpperCase()?.trim() || null,
    },
  };
}

function validateCreateProduct(input: any): { ok: true; data: any } | { ok: false; code: string; message: string } {
  if (!input?.name?.trim()) return { ok: false, code: "INVALID_NAME", message: "Product name is required." };
  if (!input?.manufacturer?.trim()) return { ok: false, code: "INVALID_MANUFACTURER", message: "Manufacturer is required." };
  const mrp = Number(input.mrp);
  const pp = Number(input.purchase_price);
  if (!Number.isFinite(mrp) || mrp < 0) return { ok: false, code: "BAD_MRP", message: "MRP must be a non-negative number." };
  if (!Number.isFinite(pp) || pp < 0) return { ok: false, code: "BAD_PURCHASE_PRICE", message: "Purchase price must be ≥0." };
  if (pp > mrp * 1.5) return { ok: false, code: "PURCHASE_OVER_MRP", message: "Purchase price unusually higher than MRP — please confirm." };
  const gst = input.gst_percentage == null ? 18 : Number(input.gst_percentage);
  if (!Number.isFinite(gst) || gst < 0 || gst > 28) return { ok: false, code: "BAD_GST", message: "GST percentage must be 0–28." };
  return {
    ok: true,
    data: {
      name: input.name.trim(),
      manufacturer: input.manufacturer.trim(),
      mrp,
      purchase_price: pp,
      gst_percentage: gst,
      hsn_code: input.hsn_code?.trim() || null,
      unit: input.unit?.trim() || "pcs",
      category: input.category?.trim() || null,
      strength: input.strength?.trim() || null,
    },
  };
}

// ───────────────────────── LLM call ─────────────────────────
async function callGateway(apiKey: string, messages: any[]) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: "auto", temperature: 0.2 }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LLM ${res.status}: ${txt.slice(0, 300)}`);
  }
  return await res.json();
}

// ───────────────────────── Tool executors ─────────────────────────
async function execReadTool(supa: any, companyId: string, name: string, args: any): Promise<any> {
  if (name === "search_customers") {
    const q = String(args?.query || "").trim();
    if (!q) return { results: [] };
    const { data, error } = await supa
      .from("customers")
      .select("id, name, phone, email, address, gst_number")
      .eq("company_id", companyId)
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8);
    if (error) return { error: error.message };
    return { results: data ?? [] };
  }
  if (name === "search_products") {
    const q = String(args?.query || "").trim();
    if (!q) return { results: [] };
    const { data, error } = await supa
      .from("products")
      .select("id, name, manufacturer, mrp, purchase_price, gst_percentage, unit")
      .eq("company_id", companyId)
      .ilike("name", `%${q}%`)
      .eq("deleted", false)
      .limit(8);
    if (error) return { error: error.message };
    return { results: data ?? [] };
  }
  return { error: `Unknown read tool: ${name}` };
}

async function proposeAction(
  supa: any,
  ctx: { conversation_id: string; user_id: string; company_id: string },
  tool_name: string,
  validated_input: any,
  preview: any,
): Promise<any> {
  const { data, error } = await supa
    .from("agent_pending_actions")
    .insert({
      conversation_id: ctx.conversation_id,
      user_id: ctx.user_id,
      company_id: ctx.company_id,
      tool_name,
      validated_input,
      preview,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  // Audit
  await supa.from("agent_audit_log").insert({
    user_id: ctx.user_id,
    company_id: ctx.company_id,
    conversation_id: ctx.conversation_id,
    pending_action_id: data.id,
    tool_name,
    input: validated_input,
    output: preview,
    status: "proposed",
  });
  return { pending_action_id: data.id, status: "awaiting_approval", preview };
}

async function buildPreview(supa: any, companyId: string, name: string, data: any): Promise<any> {
  if (name === "upsert_customer") {
    if (data.id) {
      const { data: existing } = await supa
        .from("customers")
        .select("id, name, phone, email, address, gst_number")
        .eq("id", data.id)
        .eq("company_id", companyId)
        .maybeSingle();
      return { kind: "update_customer", before: existing, after: data };
    }
    // Pre-check phone duplicates
    if (data.phone) {
      const { data: dup } = await supa
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", companyId)
        .ilike("phone", `%${data.phone}%`)
        .limit(3);
      return { kind: "create_customer", new: data, possible_duplicates: dup ?? [] };
    }
    return { kind: "create_customer", new: data, possible_duplicates: [] };
  }
  if (name === "create_product") {
    const { data: dup } = await supa
      .from("products")
      .select("id, name, manufacturer, mrp")
      .eq("company_id", companyId)
      .ilike("name", `%${data.name}%`)
      .eq("deleted", false)
      .limit(3);
    return { kind: "create_product", new: data, possible_duplicates: dup ?? [] };
  }
  return { kind: name, data };
}

// ───────────────────────── Committers (run on approve) ─────────────────────────
async function commitAction(supa: any, companyId: string, userId: string, row: any): Promise<{ ok: boolean; output?: any; error?: string; code?: string }> {
  const t = row.tool_name as string;
  const input = row.validated_input;

  if (t === "upsert_customer") {
    if (input.id) {
      const { data, error } = await supa
        .from("customers")
        .update({
          name: input.name,
          phone: input.phone,
          email: input.email,
          address: input.address,
          gst_number: input.gst_number,
        })
        .eq("id", input.id)
        .eq("company_id", companyId)
        .select()
        .single();
      if (error) return { ok: false, error: error.message, code: "DB_UPDATE" };
      return { ok: true, output: { customer: data, action: "updated" } };
    }
    const { data, error } = await supa
      .from("customers")
      .insert({
        company_id: companyId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        address: input.address,
        gst_number: input.gst_number,
        notes: "Created via Action Agent",
      })
      .select()
      .single();
    if (error) return { ok: false, error: error.message, code: "DB_INSERT" };
    return { ok: true, output: { customer: data, action: "created" } };
  }

  if (t === "create_product") {
    const { data, error } = await supa
      .from("products")
      .insert({
        company_id: companyId,
        name: input.name,
        manufacturer: input.manufacturer,
        mrp: input.mrp,
        purchase_price: input.purchase_price,
        gst_percentage: input.gst_percentage,
        hsn_code: input.hsn_code,
        unit: input.unit,
        category: input.category,
        strength: input.strength,
      })
      .select()
      .single();
    if (error) return { ok: false, error: error.message, code: "DB_INSERT" };
    return { ok: true, output: { product: data, action: "created" } };
  }

  return { ok: false, error: `Unknown tool ${t}`, code: "UNKNOWN_TOOL" };
}

// ───────────────────────── HTTP entrypoint ─────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE = Deno.env.get("LOVABLE_API_KEY");

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;

  // Resolve company + role
  const { data: profile } = await admin
    .from("profiles").select("company_id").eq("id", user.id).maybeSingle();
  const company_id = profile?.company_id;
  if (!company_id) return json({ error: "No company on profile" }, 400);

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const roleSet = new Set((roles ?? []).map((r: any) => r.role));
  const canMutate = roleSet.has("admin") || roleSet.has("pharmacist");

  // ─────────── action: approve ───────────
  if (action === "approve") {
    if (!canMutate) return json({ error: "Forbidden: requires admin or pharmacist role" }, 403);
    const pid = body.pending_action_id as string;
    if (!pid) return json({ error: "pending_action_id required" }, 400);
    const t0 = Date.now();
    const { data: row, error: rErr } = await admin
      .from("agent_pending_actions").select("*").eq("id", pid).maybeSingle();
    if (rErr || !row) return json({ error: "Pending action not found" }, 404);
    if (row.user_id !== user.id) return json({ error: "Forbidden" }, 403);
    if (row.status !== "pending") return json({ error: `Action already ${row.status}` }, 409);
    if (new Date(row.expires_at) < new Date()) {
      await admin.from("agent_pending_actions").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", pid);
      return json({ error: "Action expired" }, 410);
    }

    const result = await commitAction(admin, company_id, user.id, row);
    const finalStatus = result.ok ? "executed" : "failed";
    await admin.from("agent_pending_actions").update({
      status: finalStatus,
      result: result.ok ? result.output : { error: result.error, code: result.code },
      resolved_at: new Date().toISOString(),
    }).eq("id", pid);
    await admin.from("agent_audit_log").insert({
      user_id: user.id,
      company_id,
      conversation_id: row.conversation_id,
      pending_action_id: pid,
      tool_name: row.tool_name,
      input: row.validated_input,
      output: result.ok ? result.output : null,
      status: finalStatus,
      error_code: result.ok ? null : (result.code || "UNKNOWN"),
      latency_ms: Date.now() - t0,
    });
    return json({ status: finalStatus, ...(result.ok ? { output: result.output } : { error: result.error }) });
  }

  // ─────────── action: reject ───────────
  if (action === "reject") {
    const pid = body.pending_action_id as string;
    if (!pid) return json({ error: "pending_action_id required" }, 400);
    const { data: row } = await admin.from("agent_pending_actions").select("*").eq("id", pid).maybeSingle();
    if (!row || row.user_id !== user.id) return json({ error: "Not found" }, 404);
    if (row.status !== "pending") return json({ error: `Action already ${row.status}` }, 409);
    await admin.from("agent_pending_actions").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", pid);
    await admin.from("agent_audit_log").insert({
      user_id: user.id, company_id, conversation_id: row.conversation_id,
      pending_action_id: pid, tool_name: row.tool_name,
      input: row.validated_input, status: "rejected",
    });
    return json({ status: "rejected" });
  }

  // ─────────── action: chat ───────────
  if (action !== "chat") return json({ error: "Unknown action" }, 400);
  if (!LOVABLE) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

  let conversation_id = body.conversation_id as string | undefined;
  const userText: string = String(body.message || "").trim();
  if (!userText) return json({ error: "message required" }, 400);

  // Create conversation if absent
  if (!conversation_id) {
    const { data: conv, error: cErr } = await admin
      .from("agent_conversations")
      .insert({
        user_id: user.id,
        company_id,
        title: userText.slice(0, 60),
      })
      .select("id").single();
    if (cErr) return json({ error: cErr.message }, 500);
    conversation_id = conv.id as string;
  }

  // Load recent history
  const { data: history } = await admin
    .from("agent_messages")
    .select("role, parts")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: true })
    .limit(40);

  const systemPrompt = `You are the ERP Action Agent for a multi-tenant ERP. The current user has roles: ${[...roleSet].join(", ") || "none"}.

You can perform business actions through tools. There are two kinds of tools:
1. READ tools (search_customers, search_products) — execute immediately and return results.
2. MUTATING tools (upsert_customer, create_product) — DO NOT write to the database directly. They queue a proposed change that the user must Approve in the UI.

Rules:
- ALWAYS call a search tool first before proposing to create something. If a likely duplicate exists, ask the user which to update instead of creating a new record.
- Be concise. After a mutating tool returns "awaiting_approval", reply with one short line telling the user to review the approval card.
- ${canMutate ? "" : "User CANNOT approve mutations (lacks admin/pharmacist role). Do not call mutating tools; tell them what they'd need to do manually instead."}
- Currency is INR. All prices are in rupees.
- Never invent IDs. Only use IDs returned by search tools.
- If the user request is unclear or missing required fields, ask one clarifying question.`;

  const llmMessages: any[] = [{ role: "system", content: systemPrompt }];
  for (const m of history ?? []) {
    const parts = (m as any).parts || [];
    if (m.role === "user") {
      llmMessages.push({ role: "user", content: parts.map((p: any) => p.text).join("\n") });
    } else if (m.role === "assistant") {
      const last = parts[parts.length - 1];
      if (last?.text) llmMessages.push({ role: "assistant", content: last.text });
    }
  }
  llmMessages.push({ role: "user", content: userText });

  await admin.from("agent_messages").insert({
    conversation_id, role: "user", parts: [{ type: "text", text: userText }],
  });

  // Tool loop
  const ctx = { conversation_id: conversation_id!, user_id: user.id, company_id };
  let assistantText = "";
  let pending_action_id: string | null = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    let resp: any;
    try {
      resp = await callGateway(LOVABLE, llmMessages);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes(" 429")) return json({ error: "Rate limited. Try again shortly." }, 429);
      if (msg.includes(" 402")) return json({ error: "AI credits exhausted." }, 402);
      return json({ error: `LLM error: ${msg}` }, 500);
    }
    const choice = resp.choices?.[0];
    const msg = choice?.message;
    if (!msg) break;

    const toolCalls = msg.tool_calls as any[] | undefined;
    if (!toolCalls || toolCalls.length === 0) {
      assistantText = msg.content || "";
      break;
    }

    // Append assistant tool-call message
    llmMessages.push({ role: "assistant", content: msg.content || "", tool_calls: toolCalls });

    for (const call of toolCalls) {
      const name = call.function?.name;
      let args: any = {};
      try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }

      let toolResult: any;
      if (MUTATING_TOOLS.has(name)) {
        if (!canMutate) {
          toolResult = { error: "User lacks permission to mutate data (needs admin or pharmacist role)." };
        } else {
          const validation = name === "upsert_customer" ? validateUpsertCustomer(args)
                          : name === "create_product"  ? validateCreateProduct(args)
                          : { ok: false as const, code: "UNKNOWN", message: "Unknown tool" };
          if (!validation.ok) {
            toolResult = { error: validation.message, code: validation.code };
          } else {
            const preview = await buildPreview(admin, company_id, name, validation.data);
            const r = await proposeAction(admin, ctx, name, validation.data, preview);
            if (r.pending_action_id) pending_action_id = r.pending_action_id;
            toolResult = r;
          }
        }
      } else {
        toolResult = await execReadTool(admin, company_id, name, args);
      }

      llmMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }

    // If we just queued an approval, stop the loop and let the user act.
    if (pending_action_id) {
      // Get the model's natural-language summary for the user
      try {
        const final = await callGateway(LOVABLE, [
          ...llmMessages,
          { role: "system", content: "Respond with ONE short sentence telling the user to review the approval card above." },
        ]);
        assistantText = final.choices?.[0]?.message?.content || "Please review the approval card to confirm.";
      } catch {
        assistantText = "Please review the approval card to confirm.";
      }
      break;
    }
  }

  if (!assistantText) assistantText = "I couldn't produce a response. Try rephrasing.";

  await admin.from("agent_messages").insert({
    conversation_id, role: "assistant",
    parts: [{ type: "text", text: assistantText }, ...(pending_action_id ? [{ type: "pending_action", id: pending_action_id }] : [])],
  });

  return json({ conversation_id, reply: assistantText, pending_action_id });
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
