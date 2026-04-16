# Current Product Specification

**Product Family**: MedikaRP / MedikaRP B2B / ElectraERP / TradeERP  
**Codebase Version Basis**: Current repository state (React + Supabase implementation)  
**Document Purpose**: Capture the *implemented* product scope and architecture from Product Management and Technical Architecture perspectives.

---

## 1) Executive Product Summary

This product is a multi-tenant, role-based ERP SaaS platform designed for SMB operations across four business variants:

- **Pharmacy (Retail)**: batch + expiry + scheduled drug compliance.
- **Pharmacy B2B**: pharmacy features plus stricter GST-oriented B2B workflow.
- **B2B Electronics**: distribution workflow without pharma compliance constraints.
- **General Trading**: generic inventory + purchase/sales/accounts with configurable behavior.

The implementation follows a shared frontend codebase with tenant-specific behavior controlled by company metadata (`business_type`) and role permissions (`super_admin`, `admin`, `pharmacist`, `staff`).

---

## 2) Product Manager Perspective

## 2.1 Product Vision and Positioning

- **Vision**: Provide an operational OS for SMB distributors/retailers that unifies inventory, procurement, billing, compliance, finance tracking, and admin operations.
- **Positioning**: Vertical-adaptive ERP with pharmacy depth and reusable B2B core.
- **Differentiators**:
  - Business-type-aware UX and terminology from one codebase.
  - Built-in FEFO inventory logic and scheduled drug tracking for pharmacy.
  - Integrated AI invoice scanning and text-to-order acceleration.
  - Multi-format invoicing and export-first workflows.

## 2.2 Target Customers and Personas

### Primary customer segments
- Independent pharmacy owners and regional pharmacy distributors.
- B2B electronics distributors/stockists.
- General trading wholesalers.

### Core personas
- **Owner / Admin**: controls users, settings, and financial visibility.
- **Procurement Operator**: creates challans/invoices, receives goods, manages supplier dues.
- **Sales / Billing Operator**: creates sales invoices, handles counter sale, records payments.
- **Inventory Controller**: monitors stock, low-stock risk, and expiry.
- **Compliance Pharmacist**: manages scheduled drug records and prescription-linked entries.
- **Platform Super Admin**: multi-company setup and lifecycle governance.

## 2.3 Business Problems Solved

- Fragmented records across purchase/sales/inventory and manual reconciliations.
- Poor stock visibility (low stock, near expiry, batch traceability).
- Compliance burden in pharmacy operations.
- Inconsistent invoice formats and delayed documentation.
- Lack of tenant-isolated multi-company control and role-governed access.

## 2.4 Product Scope (Implemented)

### A) Platform and access
- Auth (signup/login/session), role resolution, onboarding flow.
- Public routes (landing, portfolio, install) + protected operational app shell.
- Command palette and keyboard-enhanced navigation.

### B) Master data
- Product catalog CRUD with industry-specific fields.
- Supplier and customer CRUD with search and summary metrics.
- Product duplicate merge workflow (with backend merge function).

### C) Inventory and compliance
- Batch-level inventory with stock status indicators.
- Expiry-centric views and valuation signals.
- Scheduled drug register (pharmacy variants only).

### D) Procurement and inbound operations
- Purchase order management with challan/invoice model.
- Linked challan conversion flow.
- Goods receiving into inventory batches.
- Purchase-side payment logging and debit note issuance.

### E) Sales and outbound operations
- Sales invoice creation with customer linkage.
- FEFO/FIFO-like batch allocation utility for sellable stock.
- Counter sale path for fast billing.
- Sales-side payment logging, editing, deletion controls, and credit notes.
- Bill output in print/PDF/HTML/CSV.

### F) Finance and reporting
- Receivables/payables-oriented account views.
- Payment ledger views and GST-oriented calculations.
- Reporting page with trends/profitability-style visual summaries.
- Export tooling for operational data sharing.

### G) Configuration and governance
- Company profile + business-type settings.
- GST inclusive/exclusive behavior flag.
- Invoice settings and backup generation (full/incremental SQL).
- Configurable forms/rules subsystem for runtime behavior tuning.

### H) Admin and platform controls
- Company-level user management for admins.
- Global company/user lifecycle operations for super admin.

### I) AI-assisted workflows
- Invoice image scanning and extraction via edge function + AI gateway.
- Natural language order parsing helper.
- CSV import pipeline for suppliers/products/inventory.

## 2.5 Feature Matrix by Business Variant

| Capability | Pharmacy | Pharmacy B2B | B2B Electronics | General Trading |
|---|---:|---:|---:|---:|
| Batch tracking | Yes | Yes | No | No |
| Expiry tracking | Yes | Yes | No | Yes |
| Scheduled drug register | Yes | Yes | No | No |
| Prescription context fields | Yes | Yes | No | No |
| Customer GST emphasis | Optional | Required | Required | Optional |
| Challan workflow | Yes | Yes | Yes | Yes |
| AI invoice scanning | Yes | Yes | Yes | Yes |

## 2.6 Key User Journeys

### Journey 1: New tenant activation
1. User signs in.
2. Onboarding creates/links company.
3. Business type selected -> feature set activated.
4. User lands on dashboard with tenant-scoped context.

### Journey 2: Procure-to-stock
1. Create challan/invoice purchase document.
2. Add line items with tax/discount/charges.
3. Receive goods into inventory batches.
4. Record supplier payment and optional debit note.

### Journey 3: Sale-to-cash
1. Select/add customer.
2. Add products and allocate stock from available batches.
3. Create invoice and decrement stock.
4. Print/export invoice.
5. Record customer payment and track outstandings.

### Journey 4: Compliance and risk control
1. Monitor low stock and near-expiry inventory.
2. Capture scheduled drug issue details.
3. Review GST and payment status from accounts and reports.

### Journey 5: Data migration
1. Download CSV templates.
2. Upload and validate row-level data.
3. Commit imported data into tenant scope.

## 2.7 Operational KPIs (Product-Ready)

The existing implementation supports tracking/reporting around:

- Sales throughput and billing volume.
- Purchase throughput and vendor exposure.
- Low-stock and expiry risk counts.
- Customer/supplier outstanding balances.
- Payment activity and GST-related totals.
- Master data growth (products/customers/suppliers).

## 2.8 Constraints, Gaps, and Product Risks

- AI ERP conversational assistant is documented as planned but not present as an implemented edge function.
- Desktop/Electron blueprint exists as specification but not shipped.
- Some documented electronics-specific concepts (e.g., warranty roadmap references) are not fully materialized in runtime modules.
- Reporting quality depends on consistent payment type semantics; mismatch risk exists in some AI-created records if enums diverge.
- CSV parsing UX is present, but robustness for complex quoted CSV formats can be constrained.

## 2.9 Current Maturity Assessment

- **Strength**: strong transaction backbone (purchase/sales/inventory) with tenant-aware controls.
- **Strength**: pharmacy-specific differentiation is materially implemented.
- **Strength**: operational utility (imports, scanning, backup, exports) is practical and deployment-oriented.
- **Risk**: large page components centralize too much logic, increasing change risk and testing burden.
- **Risk**: testing automation coverage is limited; reliability depends heavily on manual validation.

---

## 3) Technical Architecture Perspective

## 3.1 System Architecture

- **Client**: React 18 SPA (TypeScript, Vite).
- **State/Data**: React Query for server state, context for auth/business.
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions + Storage).
- **Security**: Row-Level Security with role and tenant checks.
- **Deployment style**: serverless/BaaS with edge functions for privileged/AI workflows.

## 3.2 Frontend Architecture

### Application layering
- **Routing layer**: central route map in app root with public and protected segments.
- **Layout shell**: sidebar + top-level navigation, tenant-filtered menu visibility.
- **Feature pages**: route-level modules for each domain (`Products`, `Sales`, `PurchaseOrders`, etc.).
- **Reusable dialogs/forms**: composable modal workflows for record edits, payments, notes, and receiving.

### State model
- **AuthContext**: user, session, roles, auth lifecycle.
- **BusinessContext**: company, business type, feature flags, terminology, visible pages.
- **React Query**: caching and invalidation around CRUD/transaction actions.
- **Local draft persistence**: unsaved form state persistence for high-friction forms.

### UX and design system
- Tailwind + Shadcn/Radix primitives.
- Responsive layouts with mobile adaptations.
- Consistent component primitives and toast-based action feedback.

## 3.3 Backend Architecture

### Database model (multi-tenant shared schema)
- Core entities include companies, profiles, roles, products, inventory batches, customers, suppliers, purchase/sales orders and items, payments, notes, and settings.
- Tenant isolation by `company_id` across operational tables.
- Role hierarchy and role helper functions support access mediation.

### Security model
- RLS policies enforce row access by company.
- Super admin bypass pattern for platform management.
- Database helper functions (`has_role`, `is_super_admin`, `get_user_company_id`) support consistent policy logic.

### Edge functions
- `create-user`: role-gated user provisioning.
- `manage-user`: super-admin lifecycle controls.
- `scan-invoice`: AI extraction from uploaded invoice artifacts.
- `csv-import`: controlled bulk import with validation.
- `parse-order-text`: natural-language order parsing.
- `merge-products`: server-side merge consolidation support.

## 3.4 Data and Transaction Flows

### Sales flow (high-level)
- Client builds sale payload + allocations.
- Inserts sale header/items.
- Updates inventory batch quantities.
- Optionally records compliance entries for scheduled drugs.
- Optionally records or links payments/notes.
- Invalidates query keys to refresh UI state.

### Purchase receiving flow
- Create purchase record (challan/invoice modes).
- Persist line items and taxes/charges.
- Receive stock into inventory batches.
- Record supplier payment and debit-note adjustments when needed.

## 3.5 Multi-Tenancy and Role Governance

- **Tenant unit**: company record.
- **User association**: profile links to company.
- **Role scope**:
  - Super admin: global, cross-tenant management.
  - Admin/pharmacist/staff: tenant-bounded operations with varying privileges.
- **Frontend adaptation**: business config controls feature visibility and wording; backend enforces security regardless of UI.

## 3.6 AI and Automation Architecture

- AI-backed document intake via invoice scanning function.
- Input artifacts stored/retrieved from storage, then sent to AI gateway.
- Structured extraction returned for user review before persistence.
- Text parsing helper exists for faster order drafting.
- AI conversational ERP agent remains roadmap-only (documented, not deployed).

## 3.7 Configurability Architecture

- Business-type feature flags provide coarse-grained behavior changes.
- Form/rule configuration subsystem provides finer runtime customization.
- Invoice settings persist tenant-specific print/export output behavior.

## 3.8 Reliability, Scalability, and Maintainability

### Current strengths
- Managed backend services reduce ops burden.
- RLS and schema-level controls centralize data protection.
- Modular pages/dialogs support iterative feature additions.

### Current challenges
- Very large page files increase cognitive load and regression risk.
- Limited automated tests reduce confidence for refactors.
- Some legacy/roadmap documentation exceeds implemented runtime behavior.

## 3.9 Deployment and Environment Model

- Frontend built with Vite and deployed through managed pipeline.
- Supabase project handles DB/auth/functions/storage.
- Migration files represent schema and policy evolution over time.
- PWA tooling is present with install-focused UX page.

## 3.10 Technical Debt and Improvement Priorities

1. Break up largest domain pages into orchestrator + submodules.
2. Standardize transaction enums and add invariant checks in edge functions.
3. Improve CSV parser robustness for complex input formats.
4. Add test baseline (unit tests for utils + integration tests for key flows).
5. Align architecture docs continuously with implemented function inventory.

---

## 4) Source Areas Analyzed

This specification is derived from implemented code and project docs across:

- `src/pages` (24 route modules)
- `src/components` (layout/dialog/forms/settings/util components)
- `src/contexts`, `src/hooks`, `src/utils`
- `supabase/functions` (edge logic)
- `supabase/migrations` (schema + policy history)
- `SYSTEM_ARCHITECTURE.md`, `DEVELOPER_HANDBOOK.md`, and related product docs

---

## 5) Conclusion

The product is an advanced SMB ERP foundation with strong pharmacy depth, practical B2B transaction workflows, and a mature multi-tenant security model. It is already feature-rich for operational rollout, with the biggest leverage now in quality hardening (testing, modularization, and enum/data consistency), plus selective roadmap completion (conversational AI agent and deeper vertical-specific capabilities).

---

## 6) UX Guide, Usage, and Improvements (Current Implementation)

## 6.1 UX Principles Visible in the Current Product

- **Role-first access**: users see capabilities based on role and tenant context.
- **Business-type adaptation**: labels, fields, and menu visibility change by company type.
- **Fast operator workflows**: dialogs, keyboard shortcuts, quick sale, and command palette reduce navigation overhead.
- **Operational transparency**: dashboard, low-stock, expiry, and ledger-style pages surface action-needed signals.
- **Exportability-first**: invoices/reports/backup emphasize practical day-to-day documentation.

## 6.2 Navigation UX (How users move through the system)

- **Primary navigation**: left sidebar modules (`Dashboard`, `Products`, `Inventory`, `Purchase Orders`, `Sales`, etc.).
- **Contextual visibility**: menu items are filtered using business feature flags.
- **Secondary actions**: dialogs for in-flow tasks (receive stock, payments, notes, edit order/sale).
- **Global quick access**: command palette and keyboard support for repetitive operations.

### Recommended navigation pattern for users
1. Start day in `Dashboard` for alerts.
2. Move to `Purchase Orders` / `Sales` for transactions.
3. Check `Inventory` + `Expiry` for stock health.
4. Reconcile in `Accounts` / `Notes`.
5. Finalize through invoice export and backup in `Settings`.

## 6.3 How to Use the Product (Role-Based Practical Guide)

### A) Admin (company owner/operator)
1. Complete onboarding and verify business type.
2. Set company/invoice/GST preferences in `Settings`.
3. Create users from `Admin`.
4. Seed masters (`Products`, `Suppliers`, `Customers`) manually or through `Data Import`.
5. Run daily operations via `Purchase Orders`, `Sales`, `Accounts`, and periodic `Backup`.

### B) Procurement operator
1. Open `Purchase Orders`.
2. Create challan or invoice record; add line items/taxes/charges.
3. Receive inventory through `Receive Inventory`.
4. Confirm stock reflected in `Inventory`.
5. Record payment and issue debit note when needed.

### C) Billing/sales operator
1. Open `Sales`.
2. Select customer (or add inline) and add items.
3. Validate auto-allocation from available batches.
4. Save invoice and print/export immediately.
5. Record payment now or later from `Sales` / `Accounts`.

### D) Pharmacist/compliance user
1. Use `Products` with schedule metadata.
2. Monitor `Scheduled Drugs` register and complete prescription-related fields.
3. Track near-expiry and expired stock from `Expiry`.

### E) Super admin (platform operations)
1. Use `SuperAdmin` to create/manage companies and users.
2. Assign roles and ensure each user is linked to a tenant.
3. Use platform controls for lifecycle actions (reset/delete with safeguards).

## 6.4 First 7-Day Adoption Playbook (Suggested)

### Day 1-2: Setup
- Onboarding, user roles, settings, business type check.
- Import suppliers/products/customers.

### Day 3-4: Transaction baseline
- Start live purchase entries and stock receipts.
- Start live billing and invoice exports.

### Day 5-6: Controls and quality
- Validate expiry/low-stock alerts.
- Start payment ledger discipline and note usage.

### Day 7: Review and hardening
- Verify KPI trends from dashboard/reports.
- Run full backup and define SOP for periodic backup.

## 6.5 Current UX Strengths

- Strong alignment to operator mental model (buy -> stock -> sell -> collect/pay).
- Important workflows are in-app and do not require external tools.
- Dialog-heavy design minimizes context switching.
- Business variant adaptation prevents irrelevant UI clutter.
- Action outputs (print/PDF/CSV/backup) support real-world operations.

## 6.6 Current UX Frictions (based on current code)

- `Sales` and `PurchaseOrders` pages are very large, making UX behavior harder to keep consistent over time.
- Some transaction semantics (e.g., payment type variants from AI-assisted entry) can create reconciliation confusion.
- CSV import experience can fail on complex CSV formats (quoted commas/newlines).
- Documentation references some roadmap features not fully present in runtime UX, which can confuse expectation-setting.
- Mobile usability exists but dense transactional views remain desktop-optimized.

## 6.7 UX Improvements (Prioritized)

## Priority 1: Safety and consistency
1. Enforce canonical enums and validation in all create/update paths (especially payments and AI-assisted inserts).
2. Add pre-submit validation summaries for critical financial forms.
3. Add stronger user-facing error states with actionable fixes (not only generic toasts).

## Priority 2: Workflow speed
1. Add saved filters/views in `Products`, `Inventory`, `Sales`, `Purchase Orders`.
2. Add keyboard-first quick actions for common tasks (new sale, receive inventory, record payment).
3. Add inline cross-links between related entities (customer -> outstanding -> invoice list).

## Priority 3: Usability and discoverability
1. Introduce guided empty states and first-run hints on complex pages.
2. Add progressive disclosure for advanced fields (tax/charges/compliance sections).
3. Improve mobile/tablet optimized layouts for list-heavy transactional screens.

## Priority 4: Trust and auditability
1. Add visible timeline/activity logs for sale/purchase edits/deletes.
2. Show reconciliation badges/status directly on order lists.
3. Add post-action verification widgets (inventory impact, GST impact, outstanding impact).

## Priority 5: Information architecture
1. Refactor `Sales` and `PurchaseOrders` into subcomponents to stabilize UX behavior.
2. Standardize dialog patterns and footer actions across modules.
3. Create a shared “transaction header” pattern for purchase/sales/notes pages.

## 6.8 Suggested UX Success Metrics for Improvement Tracking

- Time-to-create sale/purchase (median seconds).
- Draft recovery rate and form-abandonment rate.
- Invoice export success rate.
- Payment reconciliation mismatch incidents.
- Low-stock/expiry action completion time.
- Support requests per 100 active users for top 5 workflows.
