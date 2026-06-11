
# ERP Action Agent — Implementation Plan

We already have the "advisor" pieces (`ai-assistant` intent classifier, `parse-order-text`, product embeddings, `nl-query`). What's missing is the **mutation agent** with tools + guardrails + HITL approval. This plan builds it in 4 phases, reusing the current stack instead of dragging in LangGraph (overkill inside a Deno edge function — the AI SDK's `tools` + `stopWhen` + `needsApproval` give us the same state machine with less code and zero new infra).

---

## What we're building (in one picture)

```text
 User chat ──► /functions/action-agent (Edge)
                ├─ RAG context     (company_id, role, recent entities, pgvector search)
                ├─ AI SDK streamText + tools (Lovable AI: gemini-3-flash-preview)
                │     tools = [search_products, search_customers, create_product,
                │              upsert_customer, update_stock, create_sales_invoice,
                │              record_payment, process_refund]
                ├─ Guardrails  (Zod input schema + RBAC + business rules)
                ├─ Mutating tools → needsApproval = true  ──► HITL "pending_action"
                └─ Commit → DB RPC (transactional) → audit_log row
```

The agent is **stateless on the server**; conversation thread + approval state live in DB so reload/relogin resumes cleanly.

---

## Phase 1 — Foundation: tool-calling agent (replaces regex/intent classifier for mutations)

**Deliverables**
- New edge function `supabase/functions/action-agent/index.ts` using `npm:ai` + Lovable AI Gateway (`google/gemini-3-flash-preview`, `stopWhen: stepCountIs(50)`).
- Tools registered with Zod `inputSchema` and `execute`:
  - read-only: `search_products`, `search_customers`, `get_product_stock`
  - mutating: `upsert_customer`, `create_product`, `update_stock`, `create_sales_invoice`, `record_payment`, `process_refund` — all marked `needsApproval: true`.
- Each mutating `execute` calls a **single Postgres RPC** (`agent_create_sales_invoice`, etc.) wrapped in a transaction so multi-step writes (invoice + stock decrement + ledger) succeed or fail together. Reuses existing FIFO logic in `src/utils/fifoAllocation.ts` ported into the RPC.
- New tables (migration):
  - `agent_conversations` (id, user_id, company_id, title, created_at)
  - `agent_messages` (conversation_id, role, parts jsonb, tool_calls jsonb)
  - `agent_pending_actions` (id, conversation_id, tool_name, validated_input jsonb, preview jsonb, status: 'pending'|'approved'|'rejected'|'executed'|'failed', expires_at)
  - `agent_audit_log` (id, user_id, company_id, conversation_id, tool_name, raw_prompt, input jsonb, output jsonb, status, latency_ms)
  - RLS scoped to `company_id` + `is_super_admin(auth.uid())`; GRANT to authenticated/service_role per the project's multi-tenancy rule.

**Client**
- Replace `src/pages/Chat.tsx`'s `confirmDraft` single-shot flow with a generic "pending action card" that renders any tool's `preview` payload and posts Approve/Reject to `/action-agent/approve`.
- Keep current draft UX as a fallback for legacy `create_sale_draft` until phase 2.

## Phase 2 — RAG context injection

- Add `query_database_for_context` tool that does **hybrid search**: pgvector similarity on `product_embeddings` (already in place) + ILIKE fallback, filtered by RLS.
- Before the LLM turn, prepend a compact system message with: user role, business_module, last 5 customers/products touched, current financial year. This is what stops "Add John" from creating a duplicate when John already exists.
- Build a `resolveEntity(name, kind)` helper the agent calls before any mutate tool — returns either `{id, confidence}` or a disambiguation list the model shows the user.

## Phase 3 — Guardrails engine

- **Zod layer** — every tool input validated server-side; reject with structured error the model can re-plan from (e.g. `{code:"NEGATIVE_STOCK", suggestion:"..."}`).
- **RBAC layer** — wrap each tool's `execute` in `requireRole(['admin','pharmacist'])`; mutating tools blocked for `staff`. Server-enforced even if the LLM hallucinates.
- **Business rules** — central `business_rules` table already exists; add rows for: no negative stock, can't delete product with sales history, refund only within FY, price change > 20% requires Admin.
- **HITL** — for any tool with `needsApproval: true`, the `execute` runs in **dry-run mode**: builds the change preview (delta diff, affected row count, totals) and inserts an `agent_pending_actions` row instead of committing. The chat UI renders the preview; on Approve, `/action-agent/approve` re-validates and calls the same RPC with `commit=true`.
- **Audit** — every approve/reject/execute writes to `agent_audit_log` with prompt + tool + input + output + latency.

## Phase 4 — Expansion + safety net

- Add `reorder_low_stock`, `update_customer_status`, `bulk_update_prices` (always HITL with row-count preview).
- Rate limit: 30 mutating calls / user / hour via existing pattern in `ai-assistant`.
- Add `/agent-history` page so users (and admins) can see what the agent did. Drives trust.
- Wire dashboard widget showing pending approvals count.

---

## Technical details (engineering reference)

**Stack choice** — AI SDK (`npm:ai` + `@ai-sdk/openai-compatible`) over LangGraph because (a) it natively gives us interrupt-on-approval through `needsApproval`, (b) it runs cleanly in Deno without the LangGraph state-store glue, (c) consistent with `parse-order-text` already on Lovable AI Gateway. `LOVABLE_API_KEY` is the only secret needed and is auto-provisioned.

**Why RPCs not table writes in tools** — Multi-table mutations (invoice → items → batch FIFO decrement → ledger entry) must be atomic. Each mutating tool calls one SECURITY DEFINER RPC that wraps the transaction; the tool layer just orchestrates and audits. Mirrors the pattern already used by `agent_create_sales_invoice`-style logic in current code.

**HITL state machine** — `agent_pending_actions.status` transitions: `pending → approved → executed | failed` or `pending → rejected | expired (>15min)`. The chat UI subscribes via realtime to update card status if approved from another device.

**Tool catalog growth** — Capped at ~15 tools per request. If we exceed that, follow the `ai-sdk-tool-deferral` pattern (meta `search_tools` / `invoke_tool`). Not needed in Phase 1.

**Idempotency** — every mutating RPC takes a `client_action_id` (UUID generated client-side per approval click) and rejects duplicates within 24h. Stops double-commits if approval is double-clicked.

**Testing** — Deno tests under `supabase/functions/action-agent/*_test.ts` covering: Zod rejection, RBAC denial for staff, dry-run preview shape, idempotency, FY guardrail. Use `supabase--test_edge_functions`.

---

## Out of scope (deliberately)

- LangGraph dependency — covered by AI SDK primitives.
- External vector DB — staying on `pgvector` (already used by `product_embeddings`).
- Voice input, scheduled actions, multi-step "workflows you save and replay" — future phase.

## Suggested first-cut deliverable

Phase 1 + the HITL piece of Phase 3 in one PR, with just three mutating tools wired (`upsert_customer`, `create_product`, `create_sales_invoice`). That gives a working, auditable, approval-gated agent end-to-end. Phases 2 and 4 then iterate without schema churn.

Ready to switch to build mode and start with Phase 1 (edge function scaffold + tables + the three tools + HITL approval card) — confirm and I'll proceed.
