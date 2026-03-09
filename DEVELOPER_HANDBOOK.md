# Developer Handbook — MedikaRP / ElectraERP / TradeERP

> **Last updated**: 2026-03-09  
> **Audience**: Human developers, AI developers, and code agents  
> **Purpose**: Complete reference to understand, maintain, and extend this codebase

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture & Data Flow](#4-architecture--data-flow)
5. [Database Schema](#5-database-schema)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Multi-Tenancy Model](#7-multi-tenancy-model)
8. [Business Module System](#8-business-module-system)
9. [Core Feature Modules](#9-core-feature-modules)
10. [Edge Functions (Backend)](#10-edge-functions-backend)
11. [Design System](#11-design-system)
12. [State Management](#12-state-management)
13. [Key Utilities](#13-key-utilities)
14. [Security Safeguards](#14-security-safeguards)
15. [Common Patterns & Conventions](#15-common-patterns--conventions)
16. [Known Large Files & Refactoring Notes](#16-known-large-files--refactoring-notes)
17. [Environment & Deployment](#17-environment--deployment)
18. [Troubleshooting Guide](#18-troubleshooting-guide)

---

## 1. Product Overview

A **multi-tenant B2B SaaS ERP** for small-to-medium businesses. The same codebase serves multiple industry verticals:

| Vertical | Brand Name | Key Differentiators |
|----------|-----------|-------------------|
| Pharmacy (Retail) | **MedikaRP** | Batch tracking, expiry dates, drug schedules (H/H1/X/Narcotic), prescription tracking, FEFO allocation |
| Pharmacy (B2B) | **MedikaRP B2B** | Same as above + mandatory customer GST |
| B2B Electronics | **ElectraERP** | No batch/expiry tracking, model/brand fields, B2B invoice format |
| General Trading | **TradeERP** | Expiry tracking, no drug features, generic categories |

### Core Capabilities
- Product catalog management with drug schedule classification
- Inventory management with batch-level tracking (FEFO — First Expiry First Out)
- Purchase order lifecycle (Challan → Invoice → Goods Received)
- Sales order creation with auto-batch allocation
- GST-compliant invoicing (inclusive/exclusive toggle per company)
- Credit & Debit notes
- Customer & Supplier management with outstanding balances
- Scheduled Drug Register (pharmacy compliance)
- AI-powered invoice scanning (OCR → structured data)
- Multi-format bill generation (Print / PDF / HTML / CSV)
- SQL backup generation (full & incremental)
- CSV data import (suppliers, products, inventory)
- Role-based access control (Super Admin → Admin → Pharmacist → Staff)
- Dark mode support

---

## 2. Tech Stack

### Frontend
| Technology | Purpose | Version |
|-----------|---------|---------|
| React | UI framework | 18.3 |
| TypeScript | Type safety | - |
| Vite | Build tool | - |
| Tailwind CSS | Utility-first styling | - |
| Shadcn/UI (Radix) | Component library | - |
| React Router DOM | Client-side routing | 6.30 |
| React Query (@tanstack/react-query) | Server state management | 5.62 |
| React Hook Form + Zod | Form handling & validation | - |
| Recharts | Dashboard charts | - |
| date-fns | Date utilities | - |
| Lucide React | Icons | - |
| Framer Motion | Not installed (consider for animations) | - |

### Backend (Supabase / Lovable Cloud)
| Technology | Purpose |
|-----------|---------|
| PostgreSQL 15+ | Database |
| Supabase Auth | JWT-based authentication |
| Row Level Security (RLS) | Data isolation |
| Edge Functions (Deno) | Server-side logic |
| Supabase Storage | Invoice file uploads |
| Lovable AI Gateway | AI model access (Gemini) |

---

## 3. Project Structure

```
├── public/                     # Static assets (favicon, robots.txt)
├── src/
│   ├── assets/                 # Images (logo, portfolio screenshots)
│   ├── components/
│   │   ├── ui/                 # Shadcn base components (DO NOT customize heavily)
│   │   ├── layout/             # AppLayout, AppSidebar, PageHeader
│   │   ├── dialogs/            # Complex modal dialogs
│   │   │   ├── CounterSaleDialog.tsx      # Quick POS-style sale
│   │   │   ├── CreditNoteDialog.tsx       # Sales returns
│   │   │   ├── DebitNoteDialog.tsx         # Purchase returns
│   │   │   ├── EditSaleDialog.tsx          # Modify existing sale
│   │   │   ├── EditPurchaseOrderDialog.tsx # Modify existing PO
│   │   │   ├── ReceiveInventoryDialog.tsx  # Goods received against PO
│   │   │   ├── RecordPaymentDialog.tsx     # Payment against order
│   │   │   ├── CustomerOutstandingDialog.tsx
│   │   │   ├── LinkedChallansDialog.tsx    # View challans linked to invoice
│   │   │   └── ProductHistoryDialog.tsx    # Transaction history per product
│   │   ├── forms/              # Entity creation/edit forms
│   │   │   ├── ProductFormDialog.tsx
│   │   │   └── SupplierFormDialog.tsx
│   │   ├── BackupSection.tsx
│   │   ├── CommandPalette.tsx   # Ctrl+K command palette
│   │   ├── DrugBrandSearch.tsx  # External API drug lookup
│   │   ├── InvoiceSettingsSection.tsx
│   │   └── NavLink.tsx
│   ├── contexts/
│   │   ├── AuthContext.tsx      # User session, roles, sign in/out
│   │   └── BusinessContext.tsx  # Company config, feature flags, terminology
│   ├── hooks/
│   │   ├── use-mobile.tsx       # Responsive breakpoint detection
│   │   ├── use-toast.ts        # Toast notifications
│   │   ├── useDraftSave.ts     # Auto-save form drafts to localStorage
│   │   ├── useKeyboardShortcut.ts  # Global hotkey handler
│   │   └── useKeyboardTable.ts     # Arrow key table navigation
│   ├── integrations/supabase/
│   │   ├── client.ts           # ⚠️ AUTO-GENERATED — NEVER EDIT
│   │   └── types.ts            # ⚠️ AUTO-GENERATED — NEVER EDIT
│   ├── pages/                  # Route-level components (one per route)
│   │   ├── Dashboard.tsx       # Stats cards, expiry alerts, low stock alerts
│   │   ├── Products.tsx        # Product CRUD (659 lines)
│   │   ├── Inventory.tsx       # Batch-level stock view (257 lines)
│   │   ├── Expiry.tsx          # Expiry tracking & alerts
│   │   ├── ScheduledDrugs.tsx  # Controlled substance register
│   │   ├── PurchaseOrders.tsx  # PO creation & management (1547 lines) ⚠️ LARGE
│   │   ├── Sales.tsx           # Sale creation & management (1627 lines) ⚠️ LARGE
│   │   ├── Suppliers.tsx       # Supplier CRUD
│   │   ├── Customers.tsx       # Customer CRUD with outstandings
│   │   ├── Reports.tsx         # Analytics & charts (Super Admin only)
│   │   ├── Accounts.tsx        # Payment ledger & GST sessions
│   │   ├── Notes.tsx           # Credit & Debit notes list
│   │   ├── Settings.tsx        # Company settings, invoice settings, backup
│   │   ├── Admin.tsx           # Company-level user management
│   │   ├── SuperAdmin.tsx      # Platform-level user/company management
│   │   ├── DataImport.tsx      # CSV import for bulk data
│   │   ├── ScanInvoice.tsx     # AI invoice OCR
│   │   ├── Auth.tsx            # Login/signup page
│   │   ├── Onboarding.tsx      # New user company setup
│   │   ├── LandingPage.tsx     # Public marketing page
│   │   ├── Portfolio.tsx       # Product showcase
│   │   ├── Install.tsx         # PWA install instructions
│   │   └── NotFound.tsx        # 404 page
│   ├── utils/
│   │   ├── billGenerator.ts         # Standard invoice HTML/PDF/CSV generation
│   │   ├── electronicsInvoiceGenerator.ts  # B2B invoice format
│   │   ├── fifoAllocation.ts        # FEFO batch allocation algorithm
│   │   └── backupGenerator.ts       # SQL backup generation
│   ├── App.tsx                 # Route definitions & provider tree
│   ├── main.tsx                # Entry point
│   └── index.css               # Design tokens & global styles
├── supabase/
│   ├── config.toml             # ⚠️ AUTO-GENERATED — NEVER EDIT
│   ├── functions/
│   │   ├── create-user/        # User creation (admin privilege required)
│   │   ├── manage-user/        # User update/delete + company delete (super admin)
│   │   ├── scan-invoice/       # AI-powered invoice OCR
│   │   └── csv-import/         # Bulk data import
│   └── migrations/             # ⚠️ READ-ONLY — managed by Lovable Cloud
├── SYSTEM_ARCHITECTURE.md      # High-level architecture docs
├── ELECTRON_APP_SPECIFICATION.md  # Desktop app blueprint (future)
└── DEVELOPER_HANDBOOK.md       # THIS FILE
```

---

## 4. Architecture & Data Flow

### Provider Tree (top → bottom)
```
QueryClientProvider          ← React Query cache
  └── TooltipProvider
        └── BrowserRouter
              └── AuthProvider       ← user, session, roles
                    └── BusinessProvider  ← companyId, config, feature flags
                          └── Routes
                                ├── Public: LandingPage, Auth, Install, Onboarding, Portfolio
                                └── AppLayout (protected)
                                      ├── AppSidebar (navigation, filtered by business type)
                                      └── <Outlet> (page content)
```

### Data Flow for a Typical Operation (e.g., Creating a Sale)
```
1. User fills sale form in Sales.tsx
2. Cart items are built with FIFO batch allocation (fifoAllocation.ts)
3. On submit:
   a. INSERT into sales_orders (with company_id from BusinessContext)
   b. INSERT into sales_order_items (one per cart item, with batch_id)
   c. UPDATE inventory_batches (decrement quantity per allocated batch)
   d. If pharmacy + scheduled drug: INSERT into scheduled_drug_register
   e. If customer exists: UPDATE customers.total_purchases
4. React Query invalidates relevant query keys
5. Toast notification shown
6. Optional: Print/download bill via billGenerator.ts
```

### Request Authentication Flow
```
Browser → Supabase Client (with JWT) → PostgreSQL (RLS evaluates)
                                         ├── auth.uid() → identifies user
                                         ├── get_user_company_id() → gets company
                                         └── has_role() / is_super_admin() → checks permissions
```

---

## 5. Database Schema

### Entity Relationship Summary

```
companies (tenant)
  ├── profiles (1:many) ← linked via company_id
  │     └── user_roles (1:many) ← linked via user_id
  ├── products (1:many)
  │     └── inventory_batches (1:many) ← linked via product_id
  ├── suppliers (1:many)
  │     └── purchase_orders (1:many) ← linked via supplier_id
  │           └── purchase_order_items (1:many) ← linked via purchase_order_id + product_id
  ├── customers (1:many)
  │     └── sales_orders (1:many) ← linked via customer_id
  │           └── sales_order_items (1:many) ← linked via sales_order_id + product_id + batch_id
  ├── payments (1:many) ← linked via reference_id (polymorphic: sale or purchase)
  ├── credit_notes → credit_note_items
  ├── debit_notes → debit_note_items
  ├── scheduled_drug_register
  ├── tax_sessions
  └── invoice_settings (1:1)
```

### Key Tables

#### `companies` — Tenant/Organization
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| name | text | Company display name |
| business_type | text | `pharmacy`, `pharmacy_b2b`, `b2b_electronics`, `general_trading` |
| gst_number | text? | GSTIN |
| gst_inclusive | boolean | Whether prices include GST |
| is_active | boolean | Soft delete |

#### `profiles` — User profile (extends auth.users)
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid | References auth.users(id) — **NO FK constraint** (Supabase best practice) |
| company_id | uuid? | FK → companies. Null = needs onboarding |
| full_name | text | |
| business_module | text | Mirrors company.business_type |

#### `user_roles` — RBAC
| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid | References auth.users(id) |
| role | enum | `super_admin`, `admin`, `pharmacist`, `staff` |

**Role hierarchy**: `super_admin` > `admin` > `pharmacist` > `staff`

#### `products` — Product catalog
| Column | Type | Notes |
|--------|------|-------|
| company_id | uuid | Tenant isolation |
| name, manufacturer | text | Required |
| mrp, purchase_price | numeric | Required |
| sale_price | numeric? | Optional override |
| gst_percentage | numeric | Default: 12% |
| drug_schedule | enum | `none`, `schedule_h`, `schedule_h1`, `schedule_x`, `narcotic` |
| min/max_stock_level, reorder_level | integer | Stock thresholds |
| hsn_code, generic_name, composition, strength | text? | Pharmacy-specific |

#### `inventory_batches` — Stock per batch
| Column | Type | Notes |
|--------|------|-------|
| product_id | uuid | FK → products |
| batch_number | text | Required |
| quantity | integer | Current stock (decremented on sale) |
| expiry_date | date | Required |
| mrp, purchase_price | numeric | Batch-specific pricing |
| supplier_id | uuid? | FK → suppliers |

#### `purchase_orders` — Inbound orders
| Column | Type | Notes |
|--------|------|-------|
| order_number | text | Auto-generated (PO-YYYYMMDD-XXXX) |
| supplier_id | uuid | FK → suppliers |
| status | enum | `pending`, `confirmed`, `shipped`, `delivered`, `cancelled` |
| is_challan | boolean | If true, this is a delivery challan (can be converted to invoice) |
| converted_from_challan_id | uuid? | FK → self (challan → invoice link) |
| invoice_number, challan_number | text? | |
| freight/handling/other_charges | numeric | Additional charges |

#### `sales_orders` — Outbound sales
| Column | Type | Notes |
|--------|------|-------|
| invoice_number | text | Auto-generated (INV-YYYYMMDD-XXXX) |
| customer_name | text | Snapshot (denormalized for invoice permanence) |
| customer_id | uuid? | FK → customers (optional link) |
| payment_method | text | `cash`, `upi`, `card`, `credit`, `cheque` |
| prescription_number | text? | Pharmacy only |

#### `payments` — Payment records (polymorphic)
| Column | Type | Notes |
|--------|------|-------|
| reference_type | text | `sale` or `purchase` |
| reference_id | uuid | FK → sales_orders.id or purchase_orders.id |
| party_type | text | `customer` or `supplier` |
| payment_type | text | `received` or `paid` |
| payment_method | text | `cash`, `upi`, `card`, `credit`, `cheque` |

---

## 6. Authentication & Authorization

### Auth Flow
1. **Signup**: `supabase.auth.signUp()` → email confirmation required (no auto-confirm)
2. **Login**: `supabase.auth.signInWithPassword()` → JWT issued
3. **Session**: Managed by Supabase client (auto-refresh tokens)
4. **Roles**: Fetched from `user_roles` table on login, stored in `AuthContext`

### Role Definitions
| Role | Permissions |
|------|------------|
| `super_admin` | All operations across all companies. Can create/delete users, manage companies, access reports, import data. |
| `admin` | All operations within own company. Can create users (staff/pharmacist only), manage settings. |
| `pharmacist` | CRUD on orders, products, inventory within own company. Cannot manage users or settings. |
| `staff` | INSERT-only on most tables. Can view own company data. Cannot delete or modify settings. |

### AuthContext API
```typescript
const { user, session, roles, isAdmin, isPharmacist, isSuperAdmin, hasRole, signIn, signOut } = useAuth();
```

### Security Functions (PostgreSQL)
- `has_role(_user_id uuid, _role app_role) → boolean` — SECURITY DEFINER, bypasses RLS
- `is_super_admin(_user_id uuid) → boolean` — Checks for super_admin role
- `get_user_company_id(_user_id uuid) → uuid` — Returns user's company_id from profiles
- `complete_onboarding(_business_type text, _company_name text) → uuid` — Creates company + links profile

---

## 7. Multi-Tenancy Model

### Strategy: Shared Database, Shared Schema, Row-Level Security

Every data table has a `company_id uuid` column. RLS policies ensure:

```sql
-- Standard view policy (on every table)
USING (
  (company_id = get_user_company_id(auth.uid()))
  OR is_super_admin(auth.uid())
)

-- Standard modify policy
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pharmacist'))
  AND (company_id = get_user_company_id(auth.uid()))
)

-- Staff can only INSERT (not update/delete)
WITH CHECK (company_id = get_user_company_id(auth.uid()))
```

### Critical Rule
**Every INSERT must include `company_id`**. The frontend gets it from `BusinessContext.companyId`. Forgetting this causes RLS violations.

---

## 8. Business Module System

### How It Works

`BusinessContext.tsx` defines a `BUSINESS_CONFIGS` map keyed by `BusinessType`. Each config contains:

```typescript
interface BusinessConfig {
  type: BusinessType;
  label: string;                    // "Pharmacy", "B2B Electronics", etc.
  
  // Feature flags (conditionally show/hide UI)
  hasBatchTracking: boolean;
  hasDrugSchedule: boolean;
  hasExpiryTracking: boolean;
  hasScheduledDrugs: boolean;
  hasStrength: boolean;
  hasComposition: boolean;
  hasGenericName: boolean;
  hasPrescription: boolean;
  requiresCustomerGST: boolean;
  hasChallanSystem: boolean;
  
  // Terminology (used in labels, headings)
  terms: {
    product: string;     // "Product" (same for all currently)
    manufacturer: string; // "Manufacturer" vs "Brand / OEM"
    mrp: string;          // "MRP" vs "List Price"
    appName: string;      // "MedikaRP" vs "ElectraERP"
    tagline: string;
    counterSale: string;  // "Quick Counter Sale" vs "Quick Sale"
  };
  
  // Domain-specific dropdowns
  categories: string[];
  units: { value: string; label: string }[];
  
  // Sidebar navigation filtering
  visiblePages: string[];
}
```

### Usage Pattern
```typescript
const { config, companyId, gstInclusive } = useBusiness();

// Conditional rendering
{config.hasDrugSchedule && <DrugScheduleSelect />}

// Dynamic labels
<Label>{config.terms.manufacturer}</Label>

// Navigation filtering
const visiblePages = config.visiblePages; // sidebar uses this
```

### Changing Business Type
Only admin/super_admin can change via Settings page. Updates both `companies.business_type` and `profiles.business_module`.

---

## 9. Core Feature Modules

### 9.1 Products (`Products.tsx` — 659 lines)
- CRUD with inline editing
- Drug schedule badges
- Product history dialog (sales + purchase history)
- Search by name, manufacturer, category, HSN
- Active/inactive toggle
- Conditional fields based on business type

### 9.2 Inventory (`Inventory.tsx` — 257 lines)
- Aggregated view: products with total stock across batches
- Expandable rows show individual batches
- Stock status badges (In Stock / Low / Out of Stock)
- Batch details: batch number, expiry, MRP, purchase price, supplier

### 9.3 Purchase Orders (`PurchaseOrders.tsx` — 1547 lines) ⚠️
- **Challan System**: New orders default to `is_challan: true` (delivery challan)
- **Convert Challan → Invoice**: Locks challan, creates new PO with `converted_from_challan_id`
- **Receive Inventory**: Dialog to receive goods → creates `inventory_batches` records
- **Order Lifecycle**: pending → confirmed → shipped → delivered / cancelled
- **Debit Notes**: Create return notes against purchase orders
- **Payment Recording**: Track payments against POs
- **Bill Generation**: Print/PDF/HTML/CSV formats
- **Draft Auto-Save**: Form state persisted to localStorage via `useDraftSave`
- **Inline Product/Supplier Creation**: Can add new products/suppliers without leaving the form

### 9.4 Sales (`Sales.tsx` — 1627 lines) ⚠️
- **FIFO Batch Allocation**: `allocateBatchesFIFO()` auto-selects batches by nearest expiry
- **Cart System**: Add products → auto-allocate batches → adjust quantities
- **GST Calculation**: Supports inclusive/exclusive pricing per company setting
- **Customer Selector**: Searchable dropdown with inline "Add New Customer"
- **Counter Sale**: Quick sale mode via `CounterSaleDialog`
- **Credit Notes**: Create return notes against sales
- **Payment Recording**: Track payments against sales
- **Edit Sale**: Modify quantities, items, charges on existing sales
- **Delete Sale**: Restores inventory batch quantities
- **Bill Generation**: Multiple formats with business-type-specific templates
- **Draft Auto-Save**: Full cart + form state persisted

### 9.5 Expiry Tracking (`Expiry.tsx`)
- Batches grouped by expiry window (Expired / 0-30 days / 30-90 days / 90+ days)
- Urgency badges and color coding
- Only shown for business types with `hasExpiryTracking: true`

### 9.6 Scheduled Drug Register (`ScheduledDrugs.tsx`)
- Compliance register for H/H1/X/Narcotic drugs
- Records: product, batch, quantity, patient, doctor, prescription number
- Running balance tracking
- Only shown for pharmacy business types

### 9.7 Accounts (`Accounts.tsx`)
- Payment ledger: all payments in/out
- GST tax sessions: monthly GST computation (input vs output tax)
- Outstanding balance tracking per customer/supplier

### 9.8 Reports (`Reports.tsx`)
- **Access**: Super Admin only
- Sales trends, purchase comparisons, top products, supplier performance
- Uses Recharts for visualization

### 9.9 Invoice Scanning (`ScanInvoice.tsx`)
- Upload invoice image/PDF to Supabase Storage
- Edge function sends to Gemini AI via Lovable AI Gateway
- AI extracts: supplier, items, quantities, prices, dates, GST
- Auto-matches to existing products/suppliers
- User reviews & confirms → creates purchase order

### 9.10 Super Admin (`SuperAdmin.tsx`)
- **Users Tab**: List all users across companies, edit roles, reset passwords, delete
- **Companies Tab**: List all companies, edit, delete (with safety checks)
- **Safety**: Cannot delete self, cannot delete super_admin users, cannot delete company with super_admin users

### 9.11 Settings (`Settings.tsx`)
- Company details (name, GST, address)
- Business type selector
- GST inclusive/exclusive toggle
- Invoice settings (header, bank details, terms)
- Backup generation (full/incremental SQL)

---

## 10. Edge Functions (Backend)

All in `supabase/functions/`. Auto-deployed by Lovable Cloud.

### `create-user/index.ts`
- **Auth**: Requires `admin` or `super_admin` role
- **Logic**: Creates auth user, sets profile + role
- **Restrictions**: Regular admins can only create staff/pharmacist in their own company
- **Super Admin**: Can assign any role to any company

### `manage-user/index.ts`
- **Auth**: Requires `super_admin` role only
- **Actions**:
  - `update`: Update profile fields, role, email, password
  - `delete`: Delete user (blocks self-deletion and super_admin deletion)
  - `delete_company`: Delete company (blocks own company, companies with super admins, companies with users)

### `scan-invoice/index.ts`
- **Auth**: Any authenticated user
- **Flow**: Download image from storage → convert to base64 → send to Gemini with tool-calling → return structured JSON
- **AI Model**: `google/gemini-2.5-flash` via Lovable AI Gateway
- **Tool Schema**: Detailed JSON schema for invoice extraction with supplier, line items, charges

### `csv-import/index.ts`
- **Auth**: Requires `super_admin` role
- **Types**: `suppliers`, `products`, `inventory`
- **Logic**: Row-by-row validation and insert with detailed error reporting
- **Inventory**: Pre-fetches products/suppliers for name-to-ID matching

---

## 11. Design System

### CSS Variables (index.css)
- **Font**: Plus Jakarta Sans (body) + JetBrains Mono (monospace/data)
- **Primary**: Teal/Medical Green `168 76% 36%`
- **Color Tokens**: All HSL-based, defined in `:root` and `.dark`
- **Semantic Tokens**: `--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--warning`, `--success`, `--info`
- **Drug Schedule Colors**: `--schedule-h`, `--schedule-h1`, `--schedule-x`, `--narcotic`
- **Sidebar**: Dark theme (`220 25% 12%` background)

### Component Patterns
- Use `bg-primary/10` for colored icon backgrounds
- Use `text-muted-foreground` for secondary text
- Use `bg-muted/50` for list item backgrounds
- Cards use `stat-card` class for hover effects on dashboard
- Tables use standard Shadcn Table components

### Responsive
- Sidebar collapses on mobile (Shadcn Sidebar with collapsible mode)
- Grid layouts: `grid-cols-2 md:grid-cols-3 lg:grid-cols-3`
- Mobile: Reduced padding, smaller text sizes via `text-xs sm:text-sm`

---

## 12. State Management

### Server State (React Query)
- **Query keys**: Descriptive arrays like `["products", companyId]`, `["sales-orders", companyId]`
- **Invalidation**: After mutations, invalidate related query keys
- **Caching**: Default React Query settings (5min stale time)

### Client State
| State | Location | Purpose |
|-------|----------|---------|
| Auth (user, session, roles) | `AuthContext` | Global auth state |
| Business config | `BusinessContext` | Company type, features, companyId |
| Form drafts | `localStorage` via `useDraftSave` | Persist unsaved work |
| Last backup date | `localStorage` | Track incremental backup baseline |
| UI state (dialogs, search, cart) | Component-local `useState` | Ephemeral |

### useDraftSave Hook
```typescript
const { clearDraft } = useDraftSave("draft_sale", formData, (restored) => {
  // Called on mount if draft exists
  setCart(restored.cart);
});
// Auto-saves formData to localStorage on every change
// clearDraft() removes the draft after successful submission
```

---

## 13. Key Utilities

### `fifoAllocation.ts` — FEFO Batch Allocation
```typescript
allocateBatchesFIFO(batches, requestedQuantity, existingCartQuantities)
// Returns: { success, allocations: [{batch_id, quantity, ...}], shortfall, message }
// Sorts by expiry date ascending, skips expired, accounts for cart quantities
```

### `billGenerator.ts` — Standard Bill Generation
- `printBill(data)` — Opens print dialog
- `downloadBillPDF(data)` — Downloads as PDF
- `downloadBillHTML(data)` — Downloads as HTML file
- `downloadBillCSV(data)` — Downloads as CSV

### `electronicsInvoiceGenerator.ts` — B2B Invoice Format
- Same API as billGenerator but with company header, bank details, GSTIN, amount in words
- Used when `invoiceSettings` exist or business type is `b2b_electronics` / `pharmacy_b2b`

### `backupGenerator.ts` — SQL Backup
- Full or incremental (since last backup timestamp)
- Generates INSERT statements with ON CONFLICT (idempotent restore)
- Paginates to avoid 1000-row limit
- Downloads as `.sql` file

---

## 14. Security Safeguards

### Database Level
- **RLS on all tables**: No data leaks between tenants
- **SECURITY DEFINER functions**: `has_role()`, `is_super_admin()`, `get_user_company_id()` bypass RLS to check permissions without recursion
- **No FK to auth.users**: Profiles reference `user_id` without a foreign key constraint (Supabase best practice)

### Edge Function Level
- **JWT validation**: Every edge function verifies the auth header
- **Role checks**: `create-user` requires admin+, `manage-user` requires super_admin, `csv-import` requires super_admin
- **Service role key**: Used only server-side, never exposed to client
- **Self-deletion prevention**: Cannot delete own account or own company
- **Super admin protection**: Super admin users/companies cannot be deleted

### Frontend Level
- **Route guards**: `AppLayout` checks auth, redirects to `/auth` if not logged in
- **Conditional UI**: Delete buttons disabled for protected entities, with tooltips explaining why
- **Role-based visibility**: Admin menu hidden from non-admins, Super Admin page hidden from non-super-admins
- **No hardcoded credentials**: All auth via Supabase JWT

---

## 15. Common Patterns & Conventions

### Adding a New Page
1. Create `src/pages/NewPage.tsx`
2. Add route in `src/App.tsx` inside `<AppLayout>` for protected, or outside for public
3. Add menu item in `src/components/layout/AppSidebar.tsx`
4. Add path to relevant `visiblePages` arrays in `BusinessContext.tsx`

### Adding a New Table
1. Create migration via Lovable Cloud migration tool
2. Include `company_id uuid REFERENCES companies(id)` column
3. Add RLS policies (view own + super_admin, modify for admin/pharmacist, insert for staff)
4. Types auto-regenerate in `types.ts`

### Creating a Form Dialog
```typescript
// Pattern used throughout:
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogHeader><DialogTitle>Title</DialogTitle></DialogHeader>
    {/* Form fields */}
    <DialogFooter>
      <Button onClick={handleSubmit}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Fetching Data with Company Scope
```typescript
const { data } = await supabase
  .from("products")
  .select("*")
  .eq("company_id", companyId)  // ALWAYS filter by company
  .eq("is_active", true)
  .order("name");
```

### Toast Notifications
```typescript
toast({ title: "Success", description: "Product saved" });
toast({ title: "Error", description: err.message, variant: "destructive" });
```

---

## 16. Known Large Files & Refactoring Notes

| File | Lines | Recommendation |
|------|-------|---------------|
| `Sales.tsx` | 1627 | Extract: CartSection, SalesListSection, SaleFormDialog, BillActions |
| `PurchaseOrders.tsx` | 1547 | Extract: POFormDialog, POListSection, ChallanSection |
| `Products.tsx` | 659 | Consider extracting ProductTable, ProductFilters |
| `csv-import/index.ts` | 273 | Already noted as needing refactor; extract importers to separate files |
| `SuperAdmin.tsx` | Large | Extract: UsersTab, CompaniesTab components |

### Technical Debt
- Some `as any` casts on Supabase join results (TypeScript can't infer nested selects)
- Bill generation uses string concatenation for HTML; consider a template library
- No unit tests exist currently
- No E2E tests exist currently
- PWA support is partially configured (`vite-plugin-pwa` installed but minimal setup)

---

## 17. Environment & Deployment

### Environment Variables (auto-managed, DO NOT edit `.env`)
| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `VITE_SUPABASE_PROJECT_ID` | Project identifier |

### Edge Function Secrets (auto-provisioned)
| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Database URL |
| `SUPABASE_ANON_KEY` | Public key for user-scoped queries |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key for privileged operations |
| `LOVABLE_API_KEY` | AI Gateway access (for scan-invoice) |

### Deployment
- **Preview**: Auto-deploys on code changes
- **Production**: Click "Publish" in Lovable
- **Edge Functions**: Auto-deployed on file changes
- **Database**: Migrations applied via Lovable Cloud migration tool

---

## 18. Troubleshooting Guide

### "Row violates row-level security policy"
**Cause**: Missing or wrong `company_id` on INSERT  
**Fix**: Ensure every mutation includes `company_id: companyId` from `useBusiness()`

### "Only admins can create users" (403)
**Cause**: User doesn't have `admin` or `super_admin` role  
**Fix**: Check `user_roles` table. Users can have multiple roles.

### Edge function returns 500
**Check**: Edge function logs in Lovable Cloud  
**Common**: Missing env vars, invalid JSON payload, AI gateway rate limits (429/402)

### Dashboard shows 0 for all stats
**Cause**: `companyId` is null (user has no company assigned)  
**Fix**: Assign user to a company via Super Admin, or complete onboarding

### Data missing (only showing partial results)
**Cause**: Supabase default 1000-row limit  
**Fix**: Add `.range()` pagination or use count-only queries with `{ count: 'exact', head: true }`

### Invoice scanning returns empty/wrong data
**Cause**: Poor image quality, rotated PDF, or AI rate limits  
**Fix**: Check edge function logs, verify image is readable, retry on 429

### Draft data appearing unexpectedly
**Cause**: `useDraftSave` restored from localStorage  
**Fix**: Call `clearDraft()` after successful submission, or manually clear `localStorage`

---

## Appendix: File-to-Feature Quick Reference

| Feature | Files Involved |
|---------|---------------|
| Login/Signup | `Auth.tsx`, `AuthContext.tsx` |
| Dashboard | `Dashboard.tsx` |
| Product CRUD | `Products.tsx`, `ProductFormDialog.tsx`, `ProductHistoryDialog.tsx` |
| Inventory View | `Inventory.tsx` |
| Purchase Orders | `PurchaseOrders.tsx`, `EditPurchaseOrderDialog.tsx`, `ReceiveInventoryDialog.tsx`, `LinkedChallansDialog.tsx`, `DebitNoteDialog.tsx` |
| Sales | `Sales.tsx`, `EditSaleDialog.tsx`, `CounterSaleDialog.tsx`, `CreditNoteDialog.tsx` |
| FIFO Allocation | `fifoAllocation.ts` |
| Bill Generation | `billGenerator.ts`, `electronicsInvoiceGenerator.ts` |
| Invoice Scanning | `ScanInvoice.tsx`, `scan-invoice/index.ts` |
| User Management | `Admin.tsx` (company-level), `SuperAdmin.tsx` (platform), `create-user/index.ts`, `manage-user/index.ts` |
| Settings | `Settings.tsx`, `InvoiceSettingsSection.tsx`, `BackupSection.tsx` |
| CSV Import | `DataImport.tsx`, `csv-import/index.ts` |
| Backup | `BackupSection.tsx`, `backupGenerator.ts` |
| Navigation | `AppSidebar.tsx`, `AppLayout.tsx`, `CommandPalette.tsx` |
| Business Config | `BusinessContext.tsx` |
| Keyboard Shortcuts | `useKeyboardShortcut.ts`, `useKeyboardTable.ts`, `CommandPalette.tsx` |
