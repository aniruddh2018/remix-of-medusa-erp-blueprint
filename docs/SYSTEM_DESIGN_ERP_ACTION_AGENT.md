# ERP Action Agent - System Design & Implementation Plan

## Overview
A secure, Retrieval-Augmented Generation (RAG) driven AI agent that can perform **editing and mutation tasks** within the ERP. Instead of navigating physical UI buttons, users can instruct the agent via natural language to perform complex operations (e.g., "Create a new product called Paracetamol, MRP 50, and add 100 units to stock"). 

The agent translates these intents into API-based controls (function calls) while enforcing strict guardrails (RBAC, validation, and dry-runs) to prevent unauthorized or destructive changes.

## 1. Architecture: API-Based Control

Instead of the current regex-based approach in `chatAutomation.ts`, we will upgrade to an **LLM Function Calling** architecture.

```mermaid
graph TD
    A[User Natural Language Input] --> B[Intent & Entity Parser (LLM)]
    B -->|Function Calling| C[Action Agent Router]
    
    subgraph RAG Context
    R1[Database Schema & Constraints]
    R2[User RBAC Permissions]
    R3[Business Rules/Guardrails]
    end
    
    RAG Context -.-> B
    
    C --> D{Guardrail Engine}
    D -->|Fails| E[Reject / Request Clarification]
    D -->|Requires Approval| F[Human-in-the-Loop Approval]
    D -->|Passes| G[Execution Engine (Supabase APIs)]
    
    G --> H[Audit Log (query_history / action_history)]
    G --> I[Format Success Response to User]
```

## 2. Core Capabilities (API Tools)

The agent will be equipped with a suite of "Tools" (API functions) it can call.

### A. Inventory & Products
* `create_product(name, mrp, purchase_price, gst, category)`
* `update_stock(product_id, batch_number, quantity_change)`
* `reorder_low_stock(supplier_id)`

### B. Sales & Billing
* `create_sales_invoice(customer_id, items: [{product_id, quantity}], discount)`
* `record_payment(invoice_id, amount, method)`
* `process_refund(invoice_id, reason)`

### C. CRM
* `upsert_customer(name, phone, gst_number)`
* `update_customer_status(customer_id, status)`

## 3. The Guardrails System

To safely perform actions, the agent must be bound by multiple layers of guardrails.

### A. Role-Based Access Control (RBAC) Guardrails
* The LLM prompt is injected with the user's role and allowed operations.
* **Backend Enforcement:** Even if the LLM hallucinating an action, the Supabase API tier blocks mutations if `company_id = current_user_company_id()` or role checks fail.

### B. Schema & Validation Guardrails
* All function calls from the LLM must pass through **Zod Schema Validation** before hitting the database.
* Example: Prevent setting negative stock or deleting a product that has linked sales history.

### C. Dry-Run & "Human-in-the-Loop" (HITL)
* For destructive or high-value actions (e.g., deleting an order, bulk updating prices), the agent performs a "Dry Run".
* It responds to the user: *"I am about to update prices for 50 items. Here is the summary. Do you approve?"*
* **Confirmation Required** before the final `commit` is executed via API.

### D. Concurrency & State Guardrails
* Use database transactions to ensure multi-step actions (like creating an invoice AND deducting stock) succeed or fail together.

## 4. Implementation Phases

### Phase 1: The Foundation (Action Agent Router)
- Upgrade `chatAutomation.ts` to use `Fireworks AI Gateway` (Llama 3.1 70B Instruct) with Function Calling instead of Regex.
- Define 3 basic API Tools: `create_customer`, `create_product`, `create_sales_draft`.
- Integrate Zod validation for these tool inputs.

### Phase 2: RAG Integration
- Feed the LLM context about existing data to prevent duplicates (e.g., "Add John Doe" -> Agent searches vector DB / fuzzy search first, finds John Doe already exists, asks if you want to update instead).
- Add `query_database_for_context` tool so the agent can look up IDs (e.g., mapping "John" to `customer_id: 123`).

### Phase 3: The Guardrails Engine
- Implement the `ActionGuardrail` middleware.
- Add Dry-Run UI component in the chat.
- Wire up Audit Logging to record exactly which LLM prompt triggered which database mutation.

### Phase 4: Expansion
- Add tools for complex operations: Refunds, Inventory adjustments, Bulk updates, Data importing.

## 5. Sample Interaction Flow

**User:** "Change the price of Paracetamol 500mg to Rs 55 and update stock to 200."
**Agent (Internal RAG):** 
1. Calls `search_products(query="Paracetamol 500mg")` -> Returns `product_id: uuid-123`.
2. Formulates API call: `update_product(id="uuid-123", price=55, stock=200)`.
**Guardrail Engine:** Checks if User is Admin/Manager. Validates price > 0. 
**Agent (Response):** "I found Paracetamol 500mg. I will update the MRP from Rs 50 to Rs 55, and set stock to 200. Please confirm to proceed."
**User:** "Confirmed."
**Agent:** Executes API. "Update successful."

## 6. Technology Stack & Dependencies

### A. Orchestration: LangGraph vs LangChain
For the Action Agent, **LangGraph (JS/TS)** is the recommended orchestration framework over standard LangChain.

* **Why LangGraph?** Standard LangChain is designed for linear chains (Input -> Process -> Output). However, an editing agent requires **cyclical workflows** and **stateful graphs**. 
* **Guardrails & Human-in-the-loop:** LangGraph excels at state machines. When the agent wants to perform a destructive action, LangGraph allows us to pause the graph execution (interrupt), ask the user for confirmation (Dry-Run), and then resume the graph exactly where it left off once the user clicks "Approve".

**Dependencies to install:**
```bash
npm install @langchain/core @langchain/community @langchain/langgraph
```

### B. Vector Database Strategy (Supabase pgvector)
You **do not need** to introduce an external Vector DB (like Pinecone or Weaviate) to your architecture. Since you are already using **Supabase**, you have a built-in Vector Database via the **`pgvector`** PostgreSQL extension.

**How it works with your current DB:**
1. **Enable pgvector:** We run `CREATE EXTENSION IF NOT EXISTS vector;` in your Supabase database.
2. **Hybrid Storage:** We add a `vector` column directly to your existing tables or create a dedicated embeddings table.
   * *Example:* Add an `embedding vector(768)` column to the `products` table (Nomic v1.5 supports variable dimensions like 768).
3. **Trigger-based Updates:** Whenever a product or customer is created/updated in the ERP, a Supabase Database Trigger automatically calls an Edge Function to generate the embedding using **Nomic AI (`nomic-ai/nomic-embed-text-v1.5`) via your existing Fireworks AI account**, and saves it back to the `vector` column.
4. **Hybrid Search:** During RAG, the agent can perform a similarity search (using vector distance like cosine similarity) *combined* with your standard Row-Level Security (RLS) filters (e.g., `WHERE company_id = current_user_company_id()`). This ensures the agent only retrieves vectors the user is authorized to see.
