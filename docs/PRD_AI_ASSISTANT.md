# PRD: ERP Automation Chat — LLM Enhancement

## Document Metadata

| Field | Value |
|-------|-------|
| Status | Draft |
| Author | AI |
| Date | 2026-05-09 |
| Supersedes | N/A |
| Target Release | v2.0 |

---

## 1. Problem Statement

The ERP has two separate AI surfaces with fundamentally different scopes:

| | Automation Chat (`/chat`) | Query Engine (`/query`) |
|-|---------------------------|-------------------------|
| **Scope** | Write operations (CRUD) | Read-only queries |
| **Access** | Full write access with guardrails | Read-only with RBAC |
| **Current intelligence** | Regex-only parsing | LLM-powered (Gemini) |
| **Confirmation** | Draft preview before save | N/A (read-only) |
| **Page** | `/chat` | `/query` |

These are **two different products** and should never be merged. The Automation Chat is for doing things (creating records, recording payments, creating sales drafts). The Query Engine is for asking questions (read-only NL-to-SQL).

---

## 2. Vision

Enhance the **Automation Chat** page only — replacing the regex-only intent parser with an LLM-powered classifier that:

- **Understands** free-text natural language commands better than regex
- **Extracts** structured entity data from messy input
- **Shows** a confirmation draft before executing any write operation
- **Falls back** to the existing regex parser when LLM is unavailable
- **Remembers** the last N conversation turns for context

The Query Engine page (`/query`) remains unchanged — it is the read-only NL query surface and should NOT be merged into the chat page.

---

## 3. Scope Boundaries

| Feature | Automation Chat (`/chat`) | Query Engine (`/query`) |
|---------|---------------------------|-------------------------|
| Create customer | ✅ | ❌ |
| Create product | ✅ | ❌ |
| Record payment | ✅ | ❌ |
| Create sales draft | ✅ | ❌ |
| Update records | ✅ (Phase 2) | ❌ |
| Cancel order | ✅ (Phase 2) | ❌ |
| Query sales data | ❌ → redirect to `/query` | ✅ |
| Generate reports | ❌ → redirect to `/query` | ✅ |
| Business insights | ❌ → redirect to `/query` | ✅ |
| Navigation help | ✅ | ❌ |
| Prescription attachment | ✅ | ❌ |

---

## 4. User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Ravi** (Pharmacist) | `pharmacist` | Quick sale entry via text, prescription handling |
| **Meera** (Admin/Owner) | `admin` | Quick customer/product creation without forms |
| **Arjun** (Staff) | `staff` | Simple CRUD — add customer, record payment |
| **Vikram** (Super Admin) | `super_admin` | Bulk record creation via text |

---

## 5. Functional Requirements

### 5.1 LLM Intent Classification (Replace Regex)

**FR-1.1**: Replace `parseAutomationText()` with an LLM call via `ai-assistant` edge function. Classify into: `crud_action`, `redirect_to_query`, `navigation_help`, `clarification`, `unknown`.

**FR-1.2**: For `crud_action` intents, extract structured entity data (name, phone, GST, etc.) from free-text input.

**FR-1.3**: If required fields are missing, return a response asking for them. Do NOT auto-create partial records.

**FR-1.4**: If intent is `redirect_to_query` (user asks about data/reports), respond with: "For data queries, please use the Query Engine at /query. I handle automation commands like creating records and payments."

**FR-1.5**: Fall back to `parseAutomationText()` when:
- LLM call fails (network error, 429, 402)
- `fallback_used: true` is returned by edge function
- Regex parser catches the intent (parallel execution for comparison)

### 5.2 Guardrails — Draft Before Write

**FR-2.1**: Never execute a write operation without explicit user confirmation.

**FR-2.2**: Show a draft card with the parsed entity fields before saving.

**FR-2.3**: User must reply "YES" or press "Publish Draft" to confirm.

**FR-2.4**: User can reply "CANCEL" to discard at any time.

**FR-2.5**: Smart sales resolution (`resolveSalesDraftSmart`) is preserved — product fuzzy-match and customer lookup before draft.

### 5.3 Supported CRUD Intents

**Phase 1 (Current)**:
- `create_customer` — name, phone, email, gst_number, address
- `create_product` — name, manufacturer, mrp, purchase_price, sale_price, gst_percentage, unit, category
- `record_payment` — party_name, amount, payment_method, notes
- `create_sale_draft` — customer, items with product matching, doctor, prescription

**Phase 2 (Next)**:
- `update_customer` — find customer, update fields
- `update_product` — find product, update fields
- `cancel_order` — find and cancel invoice

### 5.4 Conversation Memory

**FR-4.1**: Maintain conversation history (last 20 messages) for LLM context.

**FR-4.2**: "New Conversation" button clears history.

**FR-4.3**: History is client-side only — never stored on server.

### 5.5 Prescription Attachment

**FR-5.1**: Preserve existing prescription image attachment flow.

**FR-5.2**: Prescription is attached to the sales draft and uploaded when draft is published.

---

---

## 6. Architecture

### 6.1 System Flow

```
User types "Add customer Raj Traders phone 9876543210"
       │
       ▼
┌─────────────────────────────────────┐
│  Client: Chat.tsx                   │
│  • Push user message to UI          │
│  • Call ai-assistant edge function  │
│  • Show "Parsing..." loading state  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Edge Function: ai-assistant        │
│                                     │
│  1. Auth + company verification     │
│  2. Build system prompt             │
│     (supported actions + history)   │
│  3. LLM classify_intent() tool      │
│  4. Route by intent:                │
│     crud_action  → build draft      │
│     redirect_to_query → suggest     │
│     /query page                     │
│     other      → respond + clarify  │
│  5. Return reply + optional draft   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Client: Chat.tsx                   │
│                                     │
│  If CRUD draft returned (≥0.7 conf):│
│    → Show draft card with fields    │
│    → User replies YES or presses    │
│      Publish Draft                  │
│    → executeAutomationDraft()       │
│    → Invalidate React Query cache   │
│    → Show success toast             │
│                                     │
│  If regex fallback triggered:       │
│    → Same flow with parseAuto...()  │
└─────────────────────────────────────┘
```

### 6.2 Edge Function: `ai-assistant`

CRUD-only intent classifier. Replaces `parseAutomationText()` regex. Redirects queries to `/query`.

**Input:**
```typescript
interface AIAssistantRequest {
  message: string;
  conversation_id: string;
  history: { id, role, text, meta }[];
  company_id: string;
  user_role: AppRole;
  business_type: string;
}
```

**Output:**
```typescript
interface AIAssistantResponse {
  conversation_id: string;
  reply: {
    text: string;
    draft?: { intent: AutomationIntent; channel: "chat"; originalText: string };
  };
  meta: {
    intent: AssistantIntentType;
    confidence: number;
    crud_action?: CrudActionType;
  };
  fallback_used?: boolean;
}
```

### 6.3 Reuse Map

| Existing Code | Reuse In |
|---------------|----------|
| `parseAutomationText()` | Fallback when LLM unavailable |
| `resolveSalesDraftSmart()` | Product fuzzy-match for `create_sale_draft` |
| `executeAutomationDraft()` | Execute confirmed drafts |
| `buildDraft()` | Build draft from LLM-parsed intent |
| `describeIntent()` | Render draft summary in chat |

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Metric | Target |
|--------|--------|
| LLM intent classification | < 2 seconds (P95) |
| Regex fallback | < 100ms |
| Draft rendering after response | < 500ms |

### 7.2 Reliability

- **LLM unavailable**: Fall back to `parseAutomationText()` regex parser for CRUD intents.
- **Edge function timeout**: 30 seconds.
- **Rate limiting**: 30 requests/minute per user.

### 7.3 Security

- CRUD actions require explicit confirmation (draft card) — never auto-execute.
- Conversation history is client-side only (never stored server-side).
- Company isolation enforced via auth + profile verification.
- No PII transmitted to LLM unnecessarily.

### 7.4 Cost

| Component | Est. Cost/Month (1000 users) |
|-----------|-------------------------------|
| Gemini 2.5 Flash (intent classification) | ~$5 |
| Supabase Edge Function compute | ~$2 |
| **Total** | **~$7/month** |

---

## 8. Implementation Phases

### Phase 1: LLM Intent Router (COMPLETE)

| # | Task | Status |
|---|------|--------|
| 1.1 | Type definitions `src/types/aiAssistant.ts` | ✅ Complete |
| 1.2 | Edge function `supabase/functions/ai-assistant/index.ts` | ✅ Complete |
| 1.3 | Service layer `src/services/aiAssistant.ts` | ✅ Complete |
| 1.4 | Chat.tsx integration (LLM first, regex fallback) | ✅ Complete |
| 1.5 | Conversation history (client-side, 20 message window) | ✅ Complete |

**Deliverable**: Automation Chat now uses LLM for intent classification with regex fallback. Behavior is identical to original for CRUD operations.

### Phase 2: Extended CRUD (Next)

| # | Task |
|---|------|
| 2.1 | Add `update_customer` intent — find customer by name/phone, update fields |
| 2.2 | Add `update_product` intent — find product, update MRP/price/etc |
| 2.3 | Add `cancel_order` intent — find invoice, cancel with confirmation |

### Phase 3: UX Improvements (Future)

| # | Task |
|---|------|
| 3.1 | Show parsed field values in draft card (not just summary text) |
| 3.2 | Better clarification messages when missing fields |
| 3.3 | Quick-add shortcuts for common actions |

---

## 9. Success Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Intent resolution accuracy | ~70% (regex) | 92%+ (LLM) |
| Chat sessions per day | ~10 | 50+ |
| CRUD actions via chat | 4 intent types | 7 intent types |
| Regex fallback usage | N/A | < 5% of sessions |

---

## 10. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| LLM misclassifies intent | Medium | Regex fallback always available; confirmation draft before any write |
| LLM returns malformed entities | Low | Validate crud_action against VALID_CRUD_ACTIONS list; check missing fields |
| Cost overrun | Low | Rate limiting (30 req/min); simple single-call classification |

---

## 11. Open Questions

1. **Should update operations show a before/after diff in the draft card?** (e.g., "MRP will change from 35 to 40")
2. **How should cancel_order handle partially shipped invoices?** Require admin role confirmation.

---

## Appendix A: Intent Matrix

| Intent | Current (Regex) | LLM-Enhanced | Example |
|--------|-----------------|--------------|---------|
| create_customer | ✅ | ✅ | "Add customer Raj Traders phone 9876543210" |
| create_product | ✅ | ✅ | "Add product Crocin 650 mrp 35" |
| record_payment | ✅ | ✅ | "Record Rs 2500 from Raj Traders via UPI" |
| create_sale_draft | ✅ | ✅ | "Sale for Raj Traders: 10 Crocin @ 35" |
| update_customer | ❌ | ✅ (Phase 2) | "Change Raj Traders' phone to 9876543211" |
| update_product | ❌ | ✅ (Phase 2) | "Update Crocin MRP to 40" |
| cancel_order | ❌ | ✅ (Phase 2) | "Cancel invoice INV-1234" |
| query_data | ✅ (separate page) | ❌ → `/query` | Redirects to Query Engine |
| insight_request | ❌ | ❌ → `/query` | Redirects to Query Engine |
| unknown | ✅ | ✅ (regex fallback) | "I couldn't understand..." |

---

## Appendix B: Scope Boundaries

```
AUTOMATION CHAT (/chat)          QUERY ENGINE (/query)
─────────────────────────        ─────────────────────
Create records (write)           Ask questions (read-only)
Draft → confirm → execute        NL query → SQL → table/chart
Prescription attachments         No write operations
Smart sales resolution           RBAC-scoped results
LLM + regex parser               LLM SQL generator only
```

---

# IMPLEMENTATION PROGRESS TRACKER

> **AGENT HANDOFF RULE**: When continuing this work, READ this PRD completely and check off completed items. Update status at the bottom.

## Phase 1: LLM Intent Router

### 1.1 Type Definitions ✅ COMPLETE
- [x] Create `src/types/aiAssistant.ts`:
  - `AIAssistantRequest`, `AIAssistantResponse`
  - `AssistantCard` union type (table, chart, insight, link, choice)
  - `ConversationMessage`, `IntentClassification`
  - `AssistantReply`, `AssistantMeta`
  - `ProactiveInsight`, `ProactiveInsightsResponse`
  - `HINT_CHIP_PRESETS` per business type
  - `MAX_CONVERSATION_HISTORY` constant

### 1.2 Edge Function: ai-assistant ✅ COMPLETE
- [x] Create `supabase/functions/ai-assistant/index.ts`
- [x] Auth + company verification (reuse pattern from `nl-query`)
- [x] System prompt with ERP schema, business type, RBAC rules
- [x] Intent classification via Gemini `classify_intent` tool
- [x] Route `crud_action` → structured entity extraction → return draft data
- [x] Route `data_query` → `generate_sql` tool → validate → execute → return table card
- [x] Route `insight_request` → run pre-defined insight SQL queries → return insight cards
- [x] Route `navigation_help` → match to page map → return link card
- [x] Route `clarification` → return choice card
- [x] Fallback to regex `parseAutomationText()` when LLM unavailable
- [x] Rate limiting + error handling (429, 402)
- [x] Audit logging to `query_history` for query intents
- [ ] Deploy to Supabase (BACKLOG — on hold)

### 1.3 Service Layer ✅ COMPLETE
- [x] Create `src/services/aiAssistant.ts`:
  - `callAIAssistant()` — calls edge function with message + history
  - `getProactiveInsights()` — background fetch for hint chips
  - `buildConversationMessage()` — helper to build messages
  - `trimHistory()` — sliding window management

### 1.4 Chat.tsx Integration ✅ COMPLETE
- [x] Replace direct `parseAutomationText()` call with `callAIAssistant()`
- [x] Add conversation history state (client-side `ConversationMessage[]`)
- [x] Render `AssistantCard` types inline (table, insight, link, choice, chart placeholder)
- [x] Keep regex fallback for offline/LLM-unavailable scenarios
- [x] Add "New Conversation" button
- [x] Add hint chips above input box (proactive insights)
- [x] Add insight badges with severity colors
- [x] Preserve existing smart sales resolution flow
- [x] Update sidebar label from "Automation Chat" to "AI Assistant"

## Phase 2: Rich Response Cards

### 2.1 Card Components ⬜
- [ ] `src/components/assistant/AssistantTableCard.tsx` — collapsible table, max 20 row preview, export
- [ ] `src/components/assistant/AssistantChartCard.tsx` — inline Recharts mini-chart
- [ ] `src/components/assistant/AssistantInsightCard.tsx` — severity-colored alert card
- [ ] `src/components/assistant/AssistantLinkCard.tsx` — deep-link card
- [ ] `src/components/assistant/AssistantChoiceCard.tsx` — button group for disambiguation

### 2.2 Chat Message Renderer ⬜
- [ ] Update Chat.tsx to detect and render card types in assistant messages
- [ ] Add export CSV button to table cards
- [ ] Add "View All" link for large result sets

## Phase 3: Proactive Insights

### 3.1 Insight Queries ⬜
- [ ] `getProactiveInsights()` in edge function
- [ ] Low stock alerts
- [ ] Overdue payments
- [ ] Expiry warnings
- [ ] Sales trend summary

### 3.2 Hint Chips UI ⬜
- [ ] Hint chip component above chat input
- [ ] Load on page mount (background)
- [ ] Refresh after CRUD actions
- [ ] RBAC-scoped by user role

## Phase 4: Multi-Turn Reasoning

### 4.1 Conversation Context ⬜
- [ ] Context window in LLM prompt (last 20 messages)
- [ ] Follow-up query refinement ("same for last month")
- [ ] Chained actions ("create customer, then show balance")
- [ ] "New Conversation" button to clear context

### 4.2 Streaming ⬜
- [ ] SSE from edge function
- [ ] Token-by-token rendering in Chat.tsx

## Phase 5: Extended CRUD + Navigation

### 5.1 New CRUD Intents ⬜
- [ ] `update_customer` intent
- [ ] `update_product` intent
- [ ] `cancel_order` intent

### 5.2 Navigation Help ⬜
- [ ] `navigation_help` intent with page deep-links
- [ ] Step-by-step guide rendering
- [ ] Keyboard shortcut hints

---

## CURRENT STATUS

| Item | Status | Notes |
|------|--------|-------|
| PRD | ✅ Complete | This document |
| Phase 1.1 - Type Definitions | ✅ Complete | `src/types/aiAssistant.ts` — 10 types + constants |
| Phase 1.2 - Edge Function | ✅ Complete | `supabase/functions/ai-assistant/index.ts` — intent classification + routing |
| Phase 1.3 - Service Layer | ✅ Complete | `src/services/aiAssistant.ts` — callAIAssistant, getProactiveInsights |
| Phase 1.4 - Chat.tsx Integration | ✅ Complete | Enhanced Chat page with AI assistant + cards + insights |
| Phase 2.1 - Card Components | ⬜ Not started | Extract to separate component files |
| Phase 3.1 - Proactive Insights | ✅ Partial | Backend done in edge fn; client-side load on mount done |
| Phase 4.1 - Multi-Turn Reasoning | ✅ Partial | History sent in request; context window implemented |
| Phase 4.2 - Streaming | ⬜ Not started | SSE from edge function |
| Phase 5 - Extended CRUD | ⬜ Not started | update_customer, update_product, cancel_order |
| Next Action | ⏳ Deploy | Deploy edge fn + test, then Phase 2 card components |

## AGENT RESTART CHECKLIST

When another agent continues this work:

1. **Read this PRD** completely — especially sections 4 (FR), 5 (Architecture), and this tracker
2. **Read** `docs/SYSTEM_DESIGN_ERP_QUERY_ENGINE.md` — the Query Engine is being integrated into the assistant
3. **Follow the phases** in order: 1.1 → 1.2 → 1.3 → 1.4 → Phase 2...
4. **Check off items** above as you complete them
5. **Update status** table at the bottom
6. **Reference patterns** from:
   - `supabase/functions/nl-query/index.ts` (LLM calling + SQL validation)
   - `supabase/functions/parse-order-text/index.ts` (LLM function calling)
   - `src/services/chatAutomation.ts` (existing intent parser — KEEP as fallback)
   - `src/pages/Chat.tsx` (existing chat UI to enhance)
7. **Do NOT delete** the Query Engine page (`/query`) — it remains as a standalone surface

---

**Last Updated**: 2026-05-09
**Status**: Phase 1 complete (types, edge fn, service, Chat.tsx). Ready for deploy + Phase 2.
**Next Agent**: Deploy `ai-assistant` edge function, test the Chat page, then implement Phase 2 card components as separate files

## IMPLEMENTATION NOTES

### Files Created/Modified:

1. `src/types/aiAssistant.ts` (100 lines) — Type definitions:
   - `AssistantIntentType`, `CrudActionType`, `IntentClassification`
   - `ConversationMessage`, `AssistantCard` (5 card types)
   - `AssistantReply`, `AssistantMeta`
   - `AIAssistantRequest`, `AIAssistantResponse`
   - `ProactiveInsight`, `ProactiveInsightsResponse`
   - `HINT_CHIP_PRESETS` per business type, `MAX_CONVERSATION_HISTORY`

2. `supabase/functions/ai-assistant/index.ts` (~480 lines) — Edge function:
   - Intent classification via Gemini `classify_intent` tool
   - Routes: crud_action, data_query, insight_request, navigation_help, clarification, unknown
   - CRUD: extracts entities, returns draft data + choice cards for missing fields
   - Data Query: generates SQL via `generate_sql` tool, validates, executes, returns table card
   - Insights: runs 4 parallel insight SQL queries (low stock, overdue, expiry, sales trend)
   - Navigation: page map with deep links
   - Auth + company verification (same pattern as nl-query)
   - Error handling for 429, 402, validation failures
   - Audit logging to query_history

3. `src/services/aiAssistant.ts` (~140 lines) — Service layer:
   - `callAIAssistant()` — invokes edge function with message + history
   - `getProactiveInsights()` — client-side proactive insight fetch
   - `buildConversationMessage()` — helper to build typed messages
   - `trimHistory()` — sliding window management

4. `src/pages/Chat.tsx` (~540 lines) — Enhanced Chat page:
   - Replaced `parseAutomationText()` with `callAIAssistant()` as primary path
   - `parseAutomationText()` kept as fallback when LLM unavailable
   - Conversation history state (`ConversationMessage[]`) with sliding window
   - Inline card rendering (`AssistantCardRenderer`) for table, insight, link, choice, chart
   - Proactive insights loaded on mount, refreshed after actions
   - Hint chips above input box (dynamic, business-type-aware)
   - "New Conversation" button
   - Preserved all existing smart sales resolution flow
   - Loading state with "Thinking..." indicator

5. `src/components/layout/AppSidebar.tsx` — Updated sidebar label from "Automation Chat" to "AI Assistant"

### To Complete Deployment:
```bash
# 1. Deploy the edge function
supabase functions deploy ai-assistant

# 2. Test the AI Assistant page
# Navigate to /chat in the app
# Try: "Show me total sales this month"
# Try: "Add customer Raj Traders phone 9876543210"
# Try: "How's business doing?"
```
