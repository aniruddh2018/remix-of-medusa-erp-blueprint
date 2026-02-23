# System Architecture & Migration Guide

## 1. Executive Summary
This document provides a comprehensive technical overview of the B2B SaaS application. The system is designed as a multi-tenant platform serving different business verticals (Pharmacy, Electronics, General Trading) with a unified codebase. It leverages a modern React frontend and a Supabase backend to deliver a secure, scalable, and responsive experience.

## 2. Architecture Overview

### High-Level Design
The application follows a **Serverless / BaaS (Backend-as-a-Service)** architecture:
- **Client**: Single Page Application (SPA) built with React.
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions, Realtime).
- **Infrastructure**: Hosted on Lovable Cloud (Netlify/Vercel under the hood for frontend, AWS for Supabase).

### Multi-Tenancy Model
The system uses a **Shared Database, Shared Schema** multi-tenancy approach:
- **Data Isolation**: Every operational table (products, orders, customers) contains a `company_id` column.
- **Security**: Row Level Security (RLS) policies enforce isolation at the database engine level, ensuring users can only access data belonging to their assigned company.
- **Context**: The `BusinessContext` in the frontend determines feature flags and terminology based on the logged-in user's company type.

---

## 3. Frontend Architecture

### Technology Stack
- **Framework**: React 18 + Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Shadcn UI (Radix Primitives)
- **State Management**: 
  - Server State: React Query (@tanstack/react-query)
  - Auth State: React Context (`AuthContext`)
  - Business Logic: React Context (`BusinessContext`)
- **Routing**: React Router DOM
- **Forms**: React Hook Form + Zod validation

### Key Directories
- `src/components`: Reusable UI components (atomic design).
  - `ui/`: Base Shadcn components.
  - `dialogs/`: Complex modal interactions.
  - `forms/`: Business entity forms.
- `src/pages`: Route-level components (Dashboard, Sales, Inventory).
- `src/contexts`: Global state providers.
- `src/hooks`: Custom hooks for logic reuse.
- `src/integrations/supabase`: Database types and client.

### Business Logic Adaptation
The application dynamically adapts based on `companies.business_type`:
- **Pharmacy**: Enables batch tracking, expiry dates, drug schedules, doctor details.
- **Electronics**: Enables serial numbers, warranty tracking (roadmap), model/brand fields.
- **General**: Standard inventory features.

---

## 4. Backend & Database Architecture

### Technology Stack
- **Database**: PostgreSQL 15+ (via Supabase)
- **Authentication**: Supabase Auth (JWT based)
- **Server-Side Logic**: Supabase Edge Functions (Deno/TypeScript)

### Database Schema (Core Tables)
1.  **Tenants & Users**
    - `companies`: Stores tenant details and `business_type`.
    - `profiles`: Extends `auth.users` with app-specific data (`full_name`, link to `company_id`).
    - `user_roles`: Manages RBAC (`super_admin`, `admin`, `pharmacist`, `staff`).

2.  **Inventory Management**
    - `products`: Catalog of items.
    - `inventory_batches`: Track stock levels, expiry, and batch numbers (critical for Pharmacy).
    - `suppliers`: Vendor management.

3.  **Transactions**
    - `purchase_orders`: Inbound stock (PO -> Goods Received).
    - `sales_orders`: Outbound sales.
    - `purchase_order_items` / `sales_order_items`: Line items.
    - `payments`: Financial tracking.

4.  **Compliance**
    - `scheduled_drug_register`: Automates H/H1 drug reporting for pharmacies.
    - `tax_sessions`: GST calculation and reporting periods.

### Security Model (RLS)
Security is enforced directly in the database using PostgreSQL Row Level Security:
- **View Policy**: `company_id = get_user_company_id(auth.uid())` OR `is_super_admin()`.
- **Modify Policy**: Checks if user has `admin` role AND belongs to the target company.
- **Super Admin**: Bypasses company filters for platform management.

### Edge Functions
Located in `supabase/functions/`:
- `create-user`: Handles new tenant onboarding and user creation with specific roles.
- `manage-user`: Allows Super Admins to perform privileged actions (delete users, reset passwords) safely using the `service_role` key.

---

## 5. Migration Guide

### Database Migrations
Migrations are managed via SQL files in `supabase/migrations/` (if using CLI) or applied directly via the SQL Editor in Lovable Cloud.

**Workflow for Schema Changes:**
1.  **Draft SQL**: Write SQL to `ALTER TABLE`, `CREATE TABLE`, or `CREATE POLICY`.
2.  **Test**: Apply in the **Test** environment first.
3.  **Verify**: Check RLS policies using the Supabase Policy Editor.
4.  **Apply to Live**: Run the tested SQL in the **Live** environment.

### Data Migration (Importing Legacy Data)
When migrating a new client to the system:

1.  **Prepare CSVs**: Format legacy data (Products, Customers, Suppliers) into CSV files matching the schema.
2.  **Create Company**: Create the new company entry in the `companies` table.
3.  **Get Company ID**: Retrieve the UUID of the new company.
4.  **Bulk Insert**:
    - Use a custom script or Supabase Table Editor to import CSVs.
    - **CRITICAL**: Ensure the `company_id` column in the CSV is filled with the new Company UUID before import.
    - **Inventory**: Import `products` first, then `inventory_batches` (referencing product UUIDs).

### Environment Promotion
1.  **Code**: Changes pushed to the repository are automatically deployed to the Preview/Test environment.
2.  **Publish**: Clicking "Publish" in Lovable promotes the build to the Production URL.
3.  **Database**: Schema changes must be manually applied to the Production database if they are destructive or new. Non-destructive changes are often safe, but always back up critical data.

---

## 6. Troubleshooting & Maintenance

### Common Issues
- **RLS Errors**: "Row violates row-level security policy".
  - *Cause*: Trying to insert a record without a `company_id` or with a `company_id` that doesn't match the user's assigned company.
  - *Fix*: Ensure the frontend sends the correct `company_id` context with every mutation.
- **Edge Function Failures**: 500 Errors.
  - *Check*: Supabase Function Logs.
  - *Common Cause*: Missing environment variables (`SUPABASE_SERVICE_ROLE_KEY`) or invalid payload structure.

### Backup Strategy
- Lovable Cloud / Supabase performs daily backups.
- For critical milestones, perform a manual database dump (`pg_dump`) if you have direct access, or use the "Backup" feature in the dashboard.
