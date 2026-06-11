## Goal

Turn **Automation Chat** into a real AI assistant that:
- Asks follow-up questions when info is missing.
- Always shows an **inline Confirm / Edit / Cancel card** before mutating data.
- Executes Sales/Invoices, Purchases/Returns, Payments/Ledgers, and Masters end-to-end — scoped to what the logged-in user is authorized for.
- Streams responses so it feels real-time.

## Current state (audited)

- `src/pages/Chat.tsx` (633 lines) calls `src/services/chatAutomation.ts` — a **regex/rule-based** intent parser, no real LLM tool calling. This is why follow-ups don't happen.
- `supabase/functions/action-agent/` already has the right HITL skeleton (tool calling, `agent_pending_actions`, approve/reject, `agent_audit_log`, RBAC via `user_roles`) but only implements **2 tools**: `upsert_customer`, `create_product`.
- `agent_conversations` / `agent_messages` / `agent_pending_actions` tables already exist.

So this is **expand + rewire**, not rebuild from zero.

## Architecture (target)

```text
Chat.tsx ──stream──> /functions/v1/action-agent (action=chat, stream=true)
                       │
                       ├─ read tools  ── execute directly, return JSON
                       ├─ mutating tools ── validate → buildPreview → insert
                       │                    agent_pending_actions (status=pending)
                       │                    → returns pending_action_id
                       └─ LLM asks 1 follow-up if required field missing
                         (system prompt enforces this)

Chat UI renders message.parts:
  • text  → markdown bubble
  • pending_action → PendingActionCard [Confirm] [Edit] [Cancel]
       Confirm → POST action-agent {action:"approve", pending_action_id}
       Edit    → opens inline form prefilled with validated_input
       Cancel  → POST action-agent {action:"reject", ...}
```

RBAC: agent re-checks `user_roles` for the caller; staff = read-only, pharmacist/admin = mutations. No client-trusted role.

## Tool catalog (final)

### Read (auto-exec)
- `search_customers`, `search_products`, `search_suppliers`, `search_doctors`
- `get_outstanding` (customer/supplier balance)
- `list_recent_sales`, `list_recent_purchases`, `list_pending_payments`
- `query_ledger` (date range + party)

### Mutating (HITL via `agent_pending_actions`)
**Masters:** `upsert_customer`, `upsert_supplier`, `upsert_doctor`, `create_product`
**Sales:** `create_sale_order` (items + payment), `add_sale_item`, `finalize_sale`
**Purchases:** `create_purchase_order`, `record_purchase_receipt`
**Returns:** `create_credit_note`, `create_debit_note`
**Payments/Ledger:** `record_payment` (in/out), `create_journal_voucher`

Each mutating tool: zod-style validation → `buildPreview` (shows before/after + duplicates + computed totals/GST) → queues row. Commit handlers reuse existing service layer where possible (e.g. FIFO inventory RPC for sales).

## Follow-up-questions behavior

System prompt rewrite forces:
1. Before calling any mutating tool, list **required + missing** fields.
2. If anything required is missing/ambiguous → ask ONE short clarifying question instead of guessing.
3. Never invent IDs, prices, or quantities.
4. After tool returns `awaiting_approval`, reply with one sentence pointing at the card.

## Streaming

Switch `callGateway` to `stream: true` SSE and pipe to a `ReadableStream` response. Client uses AI SDK `useChat` with `DefaultChatTransport` pointed at the function URL, rendering `message.parts`. Optimistic user bubble + "Thinking…" shimmer until first token.

## UI changes

- `src/pages/Chat.tsx` rewritten to a thin AI Elements shell:
  `Conversation` + `Message`/`MessageResponse` + `PromptInput`.
- New `src/components/chat/PendingActionCard.tsx`:
  - Friendly summary table (e.g. "Sale to Rajesh — 3 items — ₹1,240 incl GST")
  - Diff for updates, duplicate warnings for creates
  - [Confirm] [Edit] [Cancel] buttons
  - Disabled state after execute/reject; shows result
- `src/services/chatAutomation.ts` kept temporarily for the legacy WhatsApp path; Chat page no longer imports it. Marked deprecated.

## Build order

1. **Backend foundation** — extend `action-agent` tool catalog + validators + previews + committers for the 4 domains; add streaming. Reuse existing RPCs (e.g. `create_sale_with_fifo`).
2. **Frontend rewrite** — replace Chat.tsx with AI Elements + streaming transport; build `PendingActionCard`.
3. **Edit flow** — modal/inline form to tweak `validated_input` then re-queue (`action="edit"` on backend, updates the pending row).
4. **QA matrix** — for each domain: missing-field → follow-up; valid → card → confirm → DB row; reject → no DB write; staff role → blocked.

## Out of scope (this iteration)

- Voice input
- Multi-step plans (e.g. "import 200 products from a PDF")
- File attachments in chat
- The legacy `chatAutomation.ts` WhatsApp parser

## Technical notes

- Reuses existing tables (`agent_*`, no migration needed).
- New tools that touch inventory call existing FIFO/ledger RPCs — no duplicate business logic.
- `MAX_STEPS` raised to 12 to accommodate multi-search + propose flows.
- All currency INR, GST inclusive/exclusive honors `BusinessContext.gstInclusive`.

Confirm and I'll start with **Step 1 (backend tool expansion + streaming)**, which is the biggest single chunk.