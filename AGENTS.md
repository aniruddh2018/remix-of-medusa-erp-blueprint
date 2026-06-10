## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
- do not touch anything irrelavent to the task at hand
- do not touch anything that is not in the scope of the task at hand
- do not touch anything that is not related to the current task
## ERP Query Engine Implementation (ACTIVE)

This project has an active ERP Query Engine implementation in progress.

**System Design**: `docs/SYSTEM_DESIGN_ERP_QUERY_ENGINE.md`
**Memory ID**: `8d3c53f2-4817-412b-9128-44b5f903b9a6`

Rules when working on this feature:
- **ALWAYS READ** `docs/SYSTEM_DESIGN_ERP_QUERY_ENGINE.md` first — it contains the full architecture + progress tracker
- **Check off items** in the progress tracker as you complete them
- **Follow the phases** in order: 1.1 → 1.2 → 1.3 → 1.4 → Phase 2...
- **Reuse existing patterns**:
  - LLM calls: see `supabase/functions/parse-order-text/index.ts` (Fireworks AI Gateway)
  - Intent parsing: see `src/services/chatAutomation.ts`
  - RBAC: check existing role checks in `src/contexts/AuthContext.tsx`
- **Update this doc** at the bottom with your progress

**Next Item to Implement**: Deploy all edge functions after setting `FIREWORKS_API_KEY` secret. Phase 1.2 code is complete (gateway migrated from Lovable to Fireworks).

## Pharma ERP Migration Engine (ACTIVE)

This project has an active Marg/Tally XML migration engine implementation.

**System Design**: `docs/SYSTEM_DESIGN_ERP_MIGRATION_ENGINE.md`
**DB Migration**: `supabase/migrations/20260528000000_add_migration_engine.sql`

Rules when working on this feature:
- **ALWAYS READ** `docs/SYSTEM_DESIGN_ERP_MIGRATION_ENGINE.md` first
- **Staging workflow**: Upload → Parse → Stage → Review → Confirm → Done
- **Never import directly to production** — always go through staging tables
- **Mapping engine**: `src/services/mappingEngine.ts` handles unit/group/tax/manufacturer auto-mapping
- **Edge functions**:
  - `tally-import` — parses Tally/Marg XML (streaming, memory-safe)
  - `migration-staging` — stages, validates, confirms, rolls back

**Next Item to Implement**: Deploy edge functions (`supabase functions deploy tally-import`, `supabase functions deploy migration-staging`) and run `supabase db push` for the migration.
