# PRD: ERP AI Assistant

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

The ERP has two disconnected AI surfaces:

1. **Automation Chat** (`/chat`) — regex-only intent parser that handles CRUD operations (create customer, product, payment, sale draft). Cannot answer questions, reason about data, or maintain conversation context.
2. **Query Engine** (`/query`) — LLM-powered NL-to-SQL system that answers data questions but has no action capability and lives on a separate page.

Users must switch pages depending on whether they want to _do_ something or _ask_ something. Neither surface is conversational — the chat has no memory across turns, and the query engine is fire-and-forget.

---

## 2. Vision

Unify both surfaces into a single **AI Assistant** — a conversational copilot embedded in the existing Chat page that can:

- **Understand** free-text in natural language (LLM-powered, not regex)
- **Act** — create customers, products, payments, sales drafts (existing automation)
- **Answer** — query any ERP data (existing Query Engine)
- **Reason** — chain actions and answers across turns ("Create a customer, then show me their outstanding balance")
- **Guide** — help users navigate the app, understand features, and discover insights
- **Remember** — maintain context within a session (prior messages, prior results, prior drafts)

---

## 3. User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Ravi** (Pharmacist) | `pharmacist` | Quick sale entry via text, stock lookups, expiry alerts, prescription handling |
| **Meera** (Admin/Owner) | `admin` | Business insights, payment tracking, overdue monitoring, report generation |
| **Arjun** (Staff) | `staff` | Simple CRUD (add customer, record payment), guided workflows |
| **Vikram** (Super Admin) | `super_admin` | Cross-company queries, user management, audit investigation |

---

## 4. Functional Requirements

### 4.1 Unified Chat Interface (Enhance `/chat`)

The existing Chat page becomes the AI Assistant. It gains:

- **LLM-backed intent resolution** instead of regex-only parsing
- **Multi-turn conversation** with session memory
- **Inline data results** (tables, charts) within chat bubbles
- **Action confirmations** with rich previews (draft cards)
- **Streaming responses** for perceived latency reduction

**FR-1.1**: Replace `parseAutomationText()` with an LLM call that classifies intent into: `crud_action`, `data_query`, `navigation_help`, `insight_request`, `clarification`, `unknown`.

**FR-1.2**: Maintain a conversation session (server-side or client-side) with a sliding window of the last N messages for context.

**FR-1.3**: Render structured responses inline:
- Table results → collapsible table card (max 20 rows preview, "View all" link)
- Chart results → inline Recharts mini-chart (bar/line/pie)
- Draft previews → existing draft card pattern (enhanced)
- Navigation suggestions → clickable deep-links to ERP pages

**FR-1.4**: Support streaming: show partial assistant responses token-by-token while LLM generates.

### 4.2 Action Capabilities (CRUD)

Preserve all existing automation capabilities, enhanced with LLM understanding:

**FR-2.1**: All 4 existing CRUD intents remain: `create_customer`, `create_product`, `record_payment`, `create_sale_draft`.

**FR-2.2**: Add new CRUD intents:
- `update_customer` — "Change Raj Traders' phone to 9876543211"
- `update_product` — "Update Crocin MRP to 40"
- `cancel_order` — "Cancel invoice INV-1234"

**FR-2.3**: LLM extracts structured data from free-text, falling back to clarifying questions for missing required fields (instead of the current `missing[]` array approach which just lists them).

**FR-2.4**: Smart sales resolution (`resolveSalesDraftSmart`) is triggered when the intent is `create_sale_draft`, preserving the existing product-fuzzy-match and customer-lookup flow.

**FR-2.5**: Before executing any write action, show a confirmation draft card (existing pattern) with diff preview for updates.

### 4.3 Query Capabilities (Data Questions)

Integrate the Query Engine into the chat flow:

**FR-3.1**: When the intent is `data_query`, invoke the `nl-query` edge function with the user's question + company context.

**FR-3.2**: Render query results as inline table/charts within the chat, not on a separate page.

**FR-3.3**: Support follow-up refinement: "Now show me the same for last month" — the assistant re-executes with modified parameters using prior query context.

**FR-3.4**: Apply the same RBAC rules as the Query Engine (role-based table/field/row access).

**FR-3.5**: Support query result actions: export as CSV, save as template, bookmark result.

### 4.4 Insight & Proactive Capabilities

**FR-4.1**: Support `insight_request` intent: "How's business doing?", "Any anomalies?", "What should I restock?"

**FR-4.2**: The assistant can proactively suggest insights based on:
- Low stock alerts ("3 products below reorder level")
- Overdue payments ("2 customers have invoices overdue by 30+ days")
- Expiry warnings ("5 batches expire within 30 days")
- Sales trends ("Sales are down 12% this week vs last week")

**FR-4.3**: Proactive suggestions appear as subtle hint chips above the input box, refreshed on page load and after each action.

**FR-4.4**: Insights are scoped by RBAC: staff sees only their data; admin sees company-wide.

### 4.5 Navigation & Help

**FR-5.1**: Support `navigation_help` intent: "Where do I manage batches?", "How to create a credit note?", "Show me purchase return workflow."

**FR-5.2**: Assistant responds with a step-by-step guide + deep link to the relevant page.

**FR-5.3**: Surface keyboard shortcuts contextually: "You can press Ctrl+K anytime to search."

### 4.6 Conversation Memory

**FR-6.1**: Each chat session maintains a context window of the last 20 messages (user + assistant).

**FR-6.2**: Context includes structured data: if a query returned results, the column names and summary stats are remembered (not the full row data).

**FR-6.3**: Users can clear context: "Forget everything" or "Start a new conversation."

**FR-6.4**: Session persists across page navigations within the same tab (stored in state, not localStorage for privacy).

---

## 5. Architecture

### 5.1 System Flow

```
User types message
       │
       ▼
┌─────────────────────────────────────┐
│  Client: Chat.tsx                   │
│  • Append to messages[]             │
│  • Show streaming placeholder       │
│  • POST to /ai-assistant edge fn    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Edge Function: ai-assistant        │
│                                     │
│  1. Auth + Company verification     │
│  2. Build system prompt with:       │
│     - ERP schema (table/column map) │
│     - Business type & config        │
│     - User role & RBAC rules        │
│     - Conversation history          │
│  3. LLM call (Gemini) with tools:   │
│     - classify_intent()             │
│     - generate_sql()                │
│     - extract_entities()            │
│     - generate_response()           │
│  4. Route by classified intent:     │
│     ┌──────────┬─────────────┐      │
│     │ crud     │ query       │      │
│     │ → draft  │ → SQL exec  │      │
│     │ → confirm│ → analysis  │      │
│     └──────────┴─────────────┘      │
│  5. Return structured response      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Client: Render response            │
│  • Text bubble (narrative)          │
│  • Table card (query results)       │
│  • Chart card (analysis results)    │
│  • Draft card (CRUD confirm)        │
│  • Deep-link card (navigation)      │
│  • Hint chips (proactive insights)  │
└─────────────────────────────────────┘
```

### 5.2 Edge Function: `ai-assistant`

A single unified edge function replaces the separate `nl-query` and `parse-order-text` functions for chat-originated requests. The existing functions remain for their dedicated pages (Query Engine, Scan Invoice).

**Input:**

```typescript
interface AIAssistantRequest {
  message: string;
  conversation_id: string;
  history: ConversationMessage[];  // last N messages, client-sent
  company_id: string;
  user_role: AppRole;
  business_type: BusinessType;
}
```

**Output:**

```typescript
interface AIAssistantResponse {
  conversation_id: string;
  reply: {
    text: string;                          // Narrative text
    cards?: AssistantCard[];               // Structured inline cards
    draft?: AutomationDraft;               // Pending action draft
    suggestions?: string[];               // Follow-up hint chips
    navigation?: { path: string; label: string };
  };
  meta: {
    intent: string;
    confidence: number;
    sql?: string;                          // If query was executed
    execution_time_ms?: number;
    row_count?: number;
  };
}

type AssistantCard =
  | { type: "table"; columns: string[]; rows: Record<string, unknown>[]; total_rows: number }
  | { type: "chart"; chart_type: "bar" | "line" | "pie"; config: Record<string, unknown> }
  | { type: "insight"; title: string; body: string; severity: "info" | "warning" | "critical" }
  | { type: "link"; label: string; path: string; description: string };
```

### 5.3 LLM Tool Calling Strategy

The edge function uses Gemini's function calling with these tools:

| Tool | When Called | Returns |
|------|------------|---------|
| `classify_intent` | Always (first call) | Intent classification + extracted entities |
| `generate_sql` | When intent = `data_query` or `insight_request` | Parameterized SQL |
| `execute_write` | When intent = `crud_action` and confirmed | Draft object for preview |
| `get_proactive_insights` | On session start or explicitly requested | List of insight objects |

Two-call pattern for queries:
1. **Call 1**: Classify intent + extract entities
2. **Call 2**: Generate SQL (if query intent) or draft (if CRUD intent)

### 5.4 Reuse Map

| Existing Code | Reuse In |
|---------------|----------|
| `parseAutomationText()` | Fallback when LLM is unavailable or for latency-critical paths |
| `resolveSalesDraftSmart()` | Product fuzzy-match + customer lookup when intent = `create_sale_draft` |
| `executeAutomationDraft()` | Execute confirmed drafts |
| `nl-query/index.ts` | SQL generation + validation + execution pattern (refactored into shared module) |
| `src/lib/query/analysis.ts` | Trend/anomaly detection for insight responses |
| `AuthContext` roles | RBAC enforcement |
| `BusinessContext` config | Business-type-aware prompts |

---

## 6. UI Design

### 6.1 Enhanced Chat Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Assistant                                         [New Chat]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🤖 Hi Meera! 3 things to look at today:                       │
│     • 2 overdue payments (Rs 45,000)                            │
│     • 5 batches expiring within 30 days                        │
│     • Sales up 8% this week                                     │
│                                                                 │
│  👤 Show me the overdue payments                                │
│                                                                 │
│  🤖 Here are your overdue payments:                            │
│  ┌──────────────────────────────────────────────┐              │
│  │ Customer    │ Amount    │ Overdue By │ Invoice│              │
│  │ Raj Traders │ Rs 25,000 │ 45 days    │ INV-89│              │
│  │ MedPlus     │ Rs 20,000 │ 32 days    │ INV-92│              │
│  └──────────────────────────────────────────────┘              │
│  [Export CSV] [View All]                                        │
│                                                                 │
│  👤 Send a reminder to Raj Traders                              │
│                                                                 │
│  🤖 I can record a payment or add a note to their profile.     │
│     What would you like to do?                                  │
│     [Record Payment] [Add Note] [View Customer]                 │
│                                                                 │
│  👤 Add product Dolo 650 manufacturer Micro Labs mrp 32        │
│                                                                 │
│  🤖 Here's the product I'll create:                            │
│  ┌────────────────────────────────────────┐                    │
│  │ Create Product: Dolo 650               │                    │
│  │ Manufacturer: Micro Labs               │                    │
│  │ MRP: Rs 32  |  GST: 12%  |  Unit: pcs│                    │
│  │ [Confirm] [Edit] [Cancel]              │                    │
│  └────────────────────────────────────────┘                    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Hint: "How's inventory?" "Top sellers this month" "Expiring?" │
├─────────────────────────────────────────────────────────────────┤
│  [📎] [Type a message...                              ] [Send]  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Response Card Components

| Card Type | When Used | Component |
|-----------|-----------|-----------|
| **Table Card** | Query results | `AssistantTableCard` — collapsible table with max 20 row preview, export button |
| **Chart Card** | Trend/comparison results | `AssistantChartCard` — inline Recharts mini-chart |
| **Draft Card** | CRUD action preview | Enhanced existing draft card with Confirm/Edit/Cancel |
| **Insight Card** | Proactive alerts | `AssistantInsightCard` — severity-colored card with icon |
| **Link Card** | Navigation suggestions | `AssistantLinkCard` — clickable deep-link with description |
| **Choice Card** | Clarification needed | `AssistantChoiceCard` — button group for disambiguation |

### 6.3 Hint Chips

Dynamic suggestion chips above the input box, updated after each exchange:

- **On page load**: Business-health summary (overdue, low stock, expiry)
- **After query**: "Refine this", "Export results", "Compare with last period"
- **After CRUD**: "View record", "Create another", "Related actions"
- **Idle (30s)**: "Ask me anything about your ERP data"

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Metric | Target |
|--------|--------|
| First token latency (streaming) | < 2 seconds |
| CRUD intent resolution (non-LLM fallback) | < 500ms |
| Query execution + rendering | < 5 seconds (P95) |
| Proactive insight generation | < 3 seconds (background) |

### 7.2 Reliability

- **LLM unavailable**: Fall back to existing `parseAutomationText()` regex parser for CRUD intents. Query intents get a graceful error with suggestion to use the Query Engine page directly.
- **Edge function timeout**: 60 seconds (vs 30s for nl-query — higher limit for multi-step reasoning)
- **Rate limiting**: 30 requests/minute per user (higher than Query Engine's 100/min because chat messages are smaller)

### 7.3 Security

- All existing security rules from `nl-query` apply: SELECT-only SQL, company_id enforcement, forbidden keywords, RLS
- CRUD actions require explicit user confirmation (draft card) before execution
- Conversation history is client-side only, never stored on server (privacy)
- Proactive insights are scoped by RBAC
- No PII in LLM prompts — customer names/phones are referenced by ID when possible, only included when necessary for the action

### 7.4 Cost

| Component | Est. Cost/Month (1000 users) |
|-----------|-------------------------------|
| Gemini 2.5 Flash (classify + generate) | ~$15 |
| Gemini 2.5 Flash (query SQL generation) | ~$10 |
| Supabase Edge Function compute | ~$5 |
| **Total** | **~$30/month** |

---

## 8. Implementation Phases

### Phase 1: LLM Intent Router (Week 1)

| # | Task | Depends On |
|---|------|------------|
| 1.1 | Create `supabase/functions/ai-assistant/index.ts` edge function | - |
| 1.2 | Implement intent classification via Gemini function calling | 1.1 |
| 1.3 | Route CRUD intents to existing `parseAutomationText()` + `executeAutomationDraft()` | 1.2 |
| 1.4 | Route query intents to existing `nl-query` logic (refactored as shared module) | 1.2 |
| 1.5 | Update `Chat.tsx` to call `ai-assistant` instead of local `parseAutomationText()` | 1.3, 1.4 |
| 1.6 | Add conversation history management (client-side sliding window) | 1.5 |

**Deliverable**: Chat page uses LLM for understanding, but behavior is identical to current (CRUD + query).

### Phase 2: Rich Response Cards (Week 2)

| # | Task | Depends On |
|---|------|------------|
| 2.1 | Build `AssistantTableCard` component | - |
| 2.2 | Build `AssistantChartCard` component (Recharts) | - |
| 2.3 | Build `AssistantInsightCard` component | - |
| 2.4 | Build `AssistantLinkCard` component | - |
| 2.5 | Build `AssistantChoiceCard` component | - |
| 2.6 | Update `Chat.tsx` message rendering to support card types | 2.1–2.5 |
| 2.7 | Add export buttons to table cards (CSV via existing `export.ts`) | 2.1 |

**Deliverable**: Query results and insights render as rich cards inside chat.

### Phase 3: Proactive Insights (Week 3)

| # | Task | Depends On |
|---|------|------------|
| 3.1 | Create `get_proactive_insights()` in edge function | Phase 1 |
| 3.2 | Implement insight queries: low stock, overdue payments, expiry warnings, sales trends | 3.1 |
| 3.3 | Add hint chip component above chat input | - |
| 3.4 | Load insights on page mount (background fetch) | 3.2, 3.3 |
| 3.5 | Refresh insights after CRUD actions | 3.4 |
| 3.5 | RBAC-scope insights by user role | 3.2 |

**Deliverable**: Assistant proactively surfaces relevant business alerts.

### Phase 4: Multi-Turn Reasoning (Week 4)

| # | Task | Depends On |
|---|------|------------|
| 4.1 | Implement conversation context in LLM prompt (last 20 messages) | Phase 1 |
| 4.2 | Support follow-up query refinement ("same for last month") | 4.1 |
| 4.3 | Support chained actions ("create customer, then show their balance") | 4.1 |
| 4.4 | Add "New Conversation" button to clear context | 4.1 |
| 4.5 | Streaming responses (SSE from edge function) | Phase 1 |

**Deliverable**: Conversational AI that maintains context and chains actions.

### Phase 5: Extended CRUD + Navigation (Week 5)

| # | Task | Depends On |
|---|------|------------|
| 5.1 | Add `update_customer`, `update_product` intents | Phase 1 |
| 5.2 | Add `cancel_order` intent | Phase 1 |
| 5.3 | Add `navigation_help` intent with page deep-links | Phase 1 |
| 5.4 | Build step-by-step guide rendering for help responses | 5.3 |
| 5.5 | Add keyboard shortcut hints contextually | 5.3 |

**Deliverable**: Full CRUD coverage + in-app navigation help.

---

## 9. Success Metrics

| Metric | Baseline (Current) | Target (3 months) |
|--------|--------------------|--------------------|
| Chat DAU | ~5% of active users | 25% of active users |
| Avg. messages per session | 1.8 (fire-and-forget) | 5+ (conversational) |
| Intent resolution accuracy | ~70% (regex) | 92%+ (LLM) |
| CRUD via chat | 4 intent types | 7+ intent types |
| Query via chat | 0% (separate page) | 60% of queries originate from chat |
| Proactive insight click-through | N/A | 15%+ |

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM latency frustrates users | Medium | High | Streaming responses + non-LLM fallback for simple CRUD |
| LLM hallucinates SQL or actions | Medium | Critical | SQL validation layer (existing), confirmation drafts before writes, never auto-execute |
| Cost overrun from heavy usage | Low | Medium | Rate limiting, cache common queries, sliding context window |
| Regex fallback divergence from LLM | Low | Low | Shared test suite; LLM is primary, regex is backup |
| PII leakage to LLM | Medium | Critical | Strip PII from prompts where possible, use IDs over names in SQL generation prompts |

---

## 11. Open Questions

1. **Should conversation history persist across sessions?** Current proposal: no (client-side only, lost on refresh). Alternative: store in `query_history`-like table with RLS. Trade-off is privacy vs. continuity.
2. **Streaming protocol**: SSE vs. WebSocket? SSE is simpler and works with Supabase Edge Functions. WebSocket enables true bi-directional but adds complexity.
3. **Model selection**: Gemini 2.5 Flash for all calls, or use Flash for classification and Pro for SQL generation? Cost vs. accuracy trade-off.
4. **Mobile responsiveness**: The current chat layout uses `lg:grid-cols-[minmax(0,1fr)_320px]`. The assistant should work well on mobile with the sidebar collapsed.

---

## Appendix A: Current vs. Proposed Intent Matrix

| Intent | Current (Regex) | Proposed (LLM) | Example |
|--------|-----------------|-----------------|---------|
| create_customer | ✅ | ✅ Enhanced | "Add customer Raj Traders phone 9876543210" |
| create_product | ✅ | ✅ Enhanced | "Add product Crocin 650 mrp 35" |
| record_payment | ✅ | ✅ Enhanced | "Record Rs 2500 from Raj Traders via UPI" |
| create_sale_draft | ✅ | ✅ Enhanced | "Sale for Raj Traders: 10 Crocin @ 35" |
| query_data | ✅ (basic) | ✅ Enhanced | "Show me total sales this month" |
| update_customer | ❌ | ✅ New | "Change Raj Traders' phone to 9876543211" |
| update_product | ❌ | ✅ New | "Update Crocin MRP to 40" |
| cancel_order | ❌ | ✅ New | "Cancel invoice INV-1234" |
| insight_request | ❌ | ✅ New | "How's business doing?" |
| navigation_help | ❌ | ✅ New | "Where do I manage batches?" |
| clarification | ❌ | ✅ New | (LLM-triggered when ambiguous) |
| unknown | ✅ (generic) | ✅ (guided) | "I didn't understand. Did you mean..." |

---

## Appendix B: Database Changes

No new tables required for Phase 1-3. Conversation history is client-side.

**Phase 4+** (optional, if server-side persistence is chosen):

```sql
CREATE TABLE assistant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  company_id UUID REFERENCES companies(id) NOT NULL,
  title VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES assistant_conversations(id) ON DELETE CASCADE NOT NULL,
  role VARCHAR(20) NOT NULL, -- 'user' | 'assistant'
  content JSONB NOT NULL,    -- { text, cards?, draft?, meta? }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE assistant_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conv_user_isolation ON assistant_conversations
  FOR ALL USING (user_id = auth.uid());

ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY msg_user_isolation ON assistant_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM assistant_conversations WHERE user_id = auth.uid()
    )
  );
```

---

## Appendix C: Edge Function Skeleton

```typescript
// supabase/functions/ai-assistant/index.ts
// High-level structure

Deno.serve(async (req) => {
  // 1. Auth + company verification
  // 2. Parse request body (message, history, company_id, role, business_type)
  // 3. Build system prompt:
  //    - ERP schema (tables, columns, relationships)
  //    - Business type features (pharmacy vs electronics)
  //    - Role permissions (what tables/fields they can access)
  //    - Available tools and their schemas
  // 4. Call Gemini with tools:
  //    - classify_intent(message, history) -> { intent, entities, confidence }
  // 5. Route by intent:
  //    - crud_action -> extract_entities + build draft -> return draft card
  //    - data_query  -> generate_sql + validate + execute -> return table/chart card
  //    - insight_request -> build insight queries + execute -> return insight cards
  //    - navigation_help -> match to page -> return link card
  //    - clarification -> return choice card
  // 6. Return structured AIAssistantResponse
});
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
