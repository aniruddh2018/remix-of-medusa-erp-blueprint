# Complete Electron + SQLite ERP Application Specification

## 1. Executive Summary

Build a **cross-platform desktop ERP application** using **Electron** with a local **SQLite** database. The app must be packageable as a downloadable installer for Windows, macOS, and Linux. It is a multi-vertical business management system supporting **Pharmacy**, **B2B Electronics**, and **General Trading** business types from a single codebase.

---

## 2. Technology Stack

| Layer | Technology |
|-------|-----------|
| **Desktop Framework** | Electron (latest stable) |
| **Frontend** | React 18, TypeScript, Vite |
| **Styling** | Tailwind CSS + Shadcn UI (Radix Primitives) |
| **State Management** | React Query (server state), React Context (auth & business) |
| **Routing** | React Router DOM v6 |
| **Forms** | React Hook Form + Zod validation |
| **Charts** | Recharts |
| **Local Database** | SQLite via `better-sqlite3` (sync) or `sql.js` (wasm) |
| **ORM / Query Builder** | Drizzle ORM or Knex.js (recommended for migrations) |
| **Packaging** | electron-builder or electron-forge |
| **Auto-Update** | electron-updater |
| **PDF Generation** | jsPDF or electron's `webContents.printToPDF()` |
| **Backup** | SQLite file copy + JSON export |
| **PWA (optional)** | vite-plugin-pwa (already configured; keep for web fallback) |

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────┐
│              Electron Main Process           │
│  ┌─────────────┐  ┌──────────────────────┐   │
│  │  SQLite DB   │  │  IPC Handlers        │   │
│  │  (better-    │  │  (CRUD, Auth,        │   │
│  │   sqlite3)   │  │   Backup, PDF)       │   │
│  └─────────────┘  └──────────────────────┘   │
│         ▲                    ▲                │
│         │         IPC Bridge │                │
│         ▼                    ▼                │
│  ┌──────────────────────────────────────┐    │
│  │        Electron Renderer Process      │    │
│  │   React App (Vite + TypeScript)       │    │
│  │   Shadcn UI + Tailwind CSS            │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

### Key Design Principles
- **All data stays local** — no cloud dependency, no internet required after installation
- **Single-tenant** — one company per installation (no `company_id` filtering needed)
- **Auth is local** — username/password stored in SQLite with bcrypt hashing
- **Backup = file copy** — the entire database is a single `.sqlite` file

---

## 4. Database Schema (SQLite)

### 4.1 Authentication & Users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE user_roles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'pharmacist', 'staff')),
  UNIQUE(user_id, role)
);
```

### 4.2 Company Settings

```sql
CREATE TABLE company_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- singleton row
  name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'pharmacy' CHECK (business_type IN ('pharmacy', 'b2b_electronics', 'general_trading')),
  gst_number TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  state TEXT,
  gst_inclusive INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE invoice_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- singleton row
  company_name TEXT NOT NULL DEFAULT '',
  company_address TEXT,
  company_phone TEXT,
  company_email TEXT,
  company_gstin TEXT,
  company_state TEXT,
  invoice_prefix TEXT,
  invoice_format TEXT,
  logo_url TEXT, -- local file path
  terms_and_conditions TEXT,
  show_ship_to INTEGER DEFAULT 1,
  show_due_date INTEGER DEFAULT 1,
  show_previous_balance INTEGER DEFAULT 1,
  show_tax_summary INTEGER DEFAULT 1,
  show_amount_in_words INTEGER DEFAULT 1,
  show_customer_gstin INTEGER DEFAULT 1,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_branch TEXT,
  bank_account_holder TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 4.3 Products

```sql
CREATE TABLE products (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  generic_name TEXT,
  manufacturer TEXT NOT NULL,
  category TEXT,
  drug_schedule TEXT DEFAULT 'none' CHECK (drug_schedule IN ('none', 'schedule_h', 'schedule_h1', 'schedule_x', 'narcotic')),
  hsn_code TEXT,
  unit TEXT DEFAULT 'pcs',
  min_stock_level INTEGER DEFAULT 10,
  max_stock_level INTEGER DEFAULT 1000,
  reorder_level INTEGER DEFAULT 20,
  mrp REAL NOT NULL,
  purchase_price REAL NOT NULL,
  sale_price REAL,
  gst_percentage REAL DEFAULT 12,
  strength TEXT,
  composition TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 4.4 Inventory

```sql
CREATE TABLE inventory_batches (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  product_id TEXT NOT NULL REFERENCES products(id),
  batch_number TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  purchase_price REAL NOT NULL,
  mrp REAL NOT NULL,
  expiry_date TEXT NOT NULL,
  manufacturing_date TEXT,
  received_date TEXT DEFAULT (date('now')),
  supplier_id TEXT REFERENCES suppliers(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 4.5 Suppliers

```sql
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  gst_number TEXT,
  drug_license_number TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 4.6 Customers

```sql
CREATE TABLE customers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  gst_number TEXT,
  notes TEXT,
  total_purchases REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 4.7 Purchase Orders

```sql
CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  order_number TEXT NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  order_date TEXT DEFAULT (date('now')),
  expected_delivery_date TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  challan_number TEXT,
  invoice_number TEXT,
  is_challan INTEGER DEFAULT 1,
  converted_from_challan_id TEXT REFERENCES purchase_orders(id),
  total_amount REAL DEFAULT 0,
  gst_amount REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  freight_charges REAL DEFAULT 0,
  handling_charges REAL DEFAULT 0,
  other_charges REAL DEFAULT 0,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE purchase_order_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  gst_percentage REAL NOT NULL,
  discount_percentage REAL DEFAULT 0,
  total_price REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 4.8 Sales Orders

```sql
CREATE TABLE sales_orders (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  invoice_number TEXT NOT NULL,
  sale_date TEXT DEFAULT (date('now')),
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_address TEXT,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  payment_method TEXT DEFAULT 'cash',
  prescription_number TEXT,
  total_amount REAL DEFAULT 0,
  gst_amount REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  freight_charges REAL DEFAULT 0,
  handling_charges REAL DEFAULT 0,
  delivery_charges REAL DEFAULT 0,
  other_charges REAL DEFAULT 0,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE sales_order_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  batch_id TEXT NOT NULL REFERENCES inventory_batches(id),
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  gst_percentage REAL NOT NULL,
  discount_percentage REAL DEFAULT 0,
  total_price REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 4.9 Payments

```sql
CREATE TABLE payments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('sales_order', 'purchase_order', 'credit_note', 'debit_note')),
  reference_id TEXT NOT NULL,
  reference_number TEXT NOT NULL,
  party_type TEXT NOT NULL CHECK (party_type IN ('customer', 'supplier')),
  party_name TEXT NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('received', 'made')),
  amount REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_date TEXT DEFAULT (date('now')),
  cheque_number TEXT,
  bank_name TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 4.10 Credit Notes & Debit Notes

```sql
CREATE TABLE credit_notes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  credit_note_number TEXT NOT NULL,
  original_invoice_id TEXT REFERENCES sales_orders(id),
  original_invoice_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'issued' CHECK (status IN ('issued', 'adjusted', 'cancelled')),
  total_amount REAL DEFAULT 0,
  gst_amount REAL DEFAULT 0,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE credit_note_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  credit_note_id TEXT NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  batch_id TEXT REFERENCES inventory_batches(id),
  batch_number TEXT,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  gst_percentage REAL DEFAULT 0,
  discount_percentage REAL DEFAULT 0,
  total_price REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE debit_notes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  debit_note_number TEXT NOT NULL,
  original_order_id TEXT REFERENCES purchase_orders(id),
  original_order_number TEXT NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id),
  supplier_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'issued' CHECK (status IN ('issued', 'adjusted', 'cancelled')),
  total_amount REAL DEFAULT 0,
  gst_amount REAL DEFAULT 0,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE debit_note_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  debit_note_id TEXT NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  batch_id TEXT REFERENCES inventory_batches(id),
  batch_number TEXT,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  gst_percentage REAL DEFAULT 0,
  discount_percentage REAL DEFAULT 0,
  total_price REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 4.11 Scheduled Drug Register (Pharmacy Only)

```sql
CREATE TABLE scheduled_drug_register (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  product_id TEXT NOT NULL REFERENCES products(id),
  batch_id TEXT NOT NULL REFERENCES inventory_batches(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('sale', 'receipt')),
  transaction_date TEXT DEFAULT (date('now')),
  quantity INTEGER NOT NULL,
  balance_quantity INTEGER NOT NULL,
  patient_name TEXT,
  doctor_name TEXT,
  doctor_registration_number TEXT,
  prescription_number TEXT,
  notes TEXT,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 4.12 Tax Sessions

```sql
CREATE TABLE tax_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  period_name TEXT NOT NULL,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  output_gst REAL DEFAULT 0,
  input_gst REAL DEFAULT 0,
  net_tax_liability REAL DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'filed', 'closed')),
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## 5. Feature Specification

### 5.1 Onboarding / First Launch

**Trigger**: App detects empty `company_settings` table on first launch.

**Flow**:
1. **Step 1**: Enter Company/Business Name
2. **Step 2**: Select Business Type → Pharmacy | B2B Electronics | General Trading
3. **Step 3**: Create first Admin user (email + password)
4. System seeds `company_settings`, `invoice_settings`, and first `users` + `user_roles` row

**UI**: Full-screen card with logo, step indicator, animated transitions.

---

### 5.2 Authentication (Local)

**Login Screen**:
- Email + Password fields
- "Remember me" checkbox (stores session token in electron-store)
- No signup screen for end users — only admins can create users

**Session Management**:
- Generate a JWT or random session token on login, store in `electron-store`
- On app launch, check for valid session; if expired or missing, show login
- Logout clears session

**Password Hashing**: Use `bcryptjs` in the main process

---

### 5.3 Multi-Business Adaptation Engine

The system dynamically adapts based on `company_settings.business_type`:

| Feature | Pharmacy | B2B Electronics | General Trading |
|---------|----------|-----------------|-----------------|
| Batch Tracking | ✅ | ❌ | ❌ |
| Drug Schedule | ✅ | ❌ | ❌ |
| Expiry Tracking | ✅ | ❌ | ✅ |
| Scheduled Drugs Register | ✅ | ❌ | ❌ |
| Strength / Composition | ✅ | ❌ | ❌ |
| Generic Name | ✅ | ❌ | ❌ |
| Prescription Field | ✅ | ❌ | ❌ |
| Customer GST Required | ❌ | ✅ (mandatory) | ❌ |
| Challan → Invoice System | ✅ | ✅ | ✅ |
| App Name | MedikaRP | ElectraERP | TradeERP |

**Implementation**: A `BusinessContext` React context reads `company_settings.business_type` and provides a config object with boolean flags, terminology overrides, category lists, unit lists, and visible page routes.

---

### 5.4 Dashboard

**Stats Cards** (dynamic based on business type):
- Total Products
- Low Stock Items (products below `reorder_level`)
- Expiring Soon (batches expiring within 90 days) — *pharmacy & general only*
- Scheduled Drugs Count — *pharmacy only*
- Today's Sales (₹ total)
- Pending Purchase Orders
- Total Customers — *B2B electronics only*

**Alert Sections**:
- **Expiring Soon** panel: Top 5 batches by nearest expiry date with color-coded badges (Expired/Critical/Soon)
- **Low Stock Alert** panel: Top 5 products below reorder level with Out of Stock / Low Stock badges

**Navigation**: Each stat card is clickable → navigates to the relevant page.

---

### 5.5 Product Management

**Table View** with columns:
- Name, Strength*, Manufacturer, Drug Schedule*, MRP, Purchase Price, Sale Price, GST%, HSN Code, Actions
- `*` = conditional columns based on business type

**Features**:
- **Add/Edit Product**: Dialog form with all fields
- **Inline Editing**: Click any numeric cell (MRP, Purchase Price, Sale Price, GST%) to edit in-place
- **Delete Product**: Confirmation dialog
- **Search**: Filter by name, generic name, manufacturer
- **Product History Dialog**: Shows all sales/purchase transactions for a product
- **Bulk Import**: CSV upload capability for initial data migration

**Product Fields**:
| Field | Type | Required | Pharmacy | Electronics | General |
|-------|------|----------|----------|-------------|---------|
| name | text | ✅ | ✅ | ✅ | ✅ |
| generic_name | text | ❌ | ✅ | ❌ | ❌ |
| manufacturer | text | ✅ | ✅ | ✅ (Brand/OEM) | ✅ |
| category | select | ❌ | ✅ | ✅ | ✅ |
| drug_schedule | select | ❌ | ✅ | ❌ | ❌ |
| hsn_code | text | ❌ | ✅ | ✅ | ✅ |
| unit | select | ✅ | ✅ | ✅ | ✅ |
| mrp | number | ✅ | ✅ | ✅ | ✅ |
| purchase_price | number | ✅ | ✅ | ✅ | ✅ |
| sale_price | number | ❌ | ✅ | ✅ | ✅ |
| gst_percentage | number | ✅ | ✅ | ✅ | ✅ |
| strength | text | ❌ | ✅ | ❌ | ❌ |
| composition | text | ❌ | ✅ | ❌ | ❌ |
| reorder_level | number | ✅ | ✅ | ✅ | ✅ |
| min_stock_level | number | ✅ | ✅ | ✅ | ✅ |
| max_stock_level | number | ✅ | ✅ | ✅ | ✅ |

**Categories by Type**:
- Pharmacy: Tablets, Capsules, Syrups, Injections, Ointments, Drops, Inhalers, Powders, Sachets, Suppositories, Patches, Other
- Electronics: Smartphones, Laptops, Tablets, Monitors, Printers, Networking, Cables & Connectors, Power Supply, Storage Devices, Audio & Video, Components, Accessories, Other
- General: FMCG, Grocery, Hardware, Textiles, Stationery, Home & Kitchen, Industrial, Electrical, Other

**Units by Type**:
- Pharmacy: Pieces, Strip, Bottle, Box, Tube, Vial, Ampoule
- Electronics: Pieces, Box, Carton, Set, Pair, Meter, Kilogram
- General: Pieces, Box, Carton, Kilogram, Liter, Meter, Dozen

---

### 5.6 Inventory Management

**Aggregated View**: Products grouped with total stock across all batches.

**Table Columns**: Product, Manufacturer, Total Stock, Reorder Level, Status (badge), Batch Count

**Stock Status Badges**:
- Out of Stock (qty = 0) → red
- Low Stock (qty < reorder_level) → amber
- Normal → green
- Overstocked (qty > reorder_level × 3) → blue

**Stats Bar**: Total Products, Low Stock count, Out of Stock count, Total Batches

---

### 5.7 Expiry Tracking (Pharmacy & General Trading)

**Filters**: All Items | Expired | Within 30 Days | Within 90 Days | Within 180 Days

**Table Columns**: Product, Batch No., Expiry Date, Quantity, Value (MRP × Qty), Status Badge, Days Left

**Status Badges**:
- Expired (past due) → red "Expired"
- ≤30 days → red "Critical"
- ≤90 days → amber "Warning"
- ≤180 days → blue "Monitor"
- >180 days → green "Good"

**Stats Cards**: Expired count, <30 days count, <90 days count, Total at-risk value (₹)

---

### 5.8 Scheduled Drugs Register (Pharmacy Only)

**Two Tabs**:
1. **Drug Register** — Transaction log with columns: Date, Product, Batch, Type (Sale/Receipt), Qty, Balance, Prescription#, Patient, Doctor (name + registration#)
2. **Products** — List of all products with `drug_schedule ≠ 'none'`

**Filters**: Search (product, patient, doctor, prescription#), Schedule filter (All/H/H1/X/Narcotic)

**Auto-recording**: When a sale includes a scheduled drug, an entry is automatically created in the register with the patient name, doctor details, and prescription number from the sale.

---

### 5.9 Purchase Orders

**Challan / Invoice System**:
- Toggle between creating a "Challan" (delivery note) or "Invoice" (final bill)
- Challans can be later converted to Invoices
- Multiple challans can be merged into a single invoice
- Duplicate challan/invoice number validation per supplier

**Create Purchase Order Dialog**:
- Select Supplier (with inline "Add New Supplier" option)
- Toggle: Challan / Invoice
- Challan/Invoice Number input
- Expected Delivery Date
- Item table: Select Product (with inline "Add New Product"), Batch Number, Quantity, Unit Price, GST%, Discount%, auto-calculated Total
- Additional charges: Freight, Handling, Other
- Notes field
- **Auto-totals**: Subtotal, GST Amount, Discount Amount, Additional Charges, Grand Total

**Auto-Receive on Create**: When a PO is created, inventory batches are automatically created and the order status is set to "delivered". Default expiry = 2 years from today.

**Manual Receive**: Dialog to receive inventory against a PO with custom batch numbers, expiry dates, and quantities.

**Table Columns**: Order#/Challan#, Invoice#, Supplier, Date, Status, Items count, Total, Paid, Balance, Actions

**Actions per Order**:
- View/Print Bill (Print, PDF, HTML, CSV)
- Edit Order
- Update Status (Pending → Confirmed → Shipped → Delivered → Cancelled)
- Record Payment
- Receive Inventory
- View Linked Challans (for invoices)
- Issue Debit Note (return to supplier)

**Draft Auto-Save**: Form state (items, supplier, charges) is auto-saved to localStorage every few seconds and restored on next visit.

---

### 5.10 Sales Orders

**Create Sale Dialog**:
- Customer selection (with inline "Add New Customer" for B2B with mandatory GSTIN)
- Customer Name, Phone, Address (auto-filled from customer record)
- Invoice Number (auto-generated or manual)
- Payment Method: Cash, UPI, Card, Credit, Bank Transfer, Cheque
- Prescription Number (pharmacy only)
- Item table:
  - Product search (combobox with fuzzy search)
  - **FIFO Batch Allocation**: System automatically selects the batch with the nearest expiry date first
  - Quantity, Rate (defaults to MRP or Sale Price), Discount%, auto-calculated Total
  - Show available stock per batch
- Additional charges: Freight, Handling, Delivery, Other
- Notes field
- **Auto-totals**: Subtotal, GST, Discounts, Charges, Grand Total

**Counter Sale Mode**: Quick sale without customer details — just products and payment.

**Table Columns**: Invoice#, Customer, Date, Payment Method, Items count, Total, Paid, Balance, Status, Actions

**Actions per Sale**:
- Print Invoice / Download PDF / Download HTML / Download CSV (4 export formats)
- Edit Sale
- Record Payment
- Issue Credit Note (customer return)
- Delete Invoice (admin only, with type-to-confirm safety dialog — must type exact invoice number)

**Invoice Formats**:
1. **Standard Format** (Pharmacy): Simple table with product details, batch numbers, expiry
2. **B2B Electronics Format**: Full GST invoice with:
   - Company header with logo, GSTIN, state
   - Bill To / Ship To sections
   - Customer GSTIN display
   - HSN/SAC-wise tax summary table
   - CGST + SGST breakdown (intra-state) or IGST (inter-state)
   - Amount in Words (auto-converted)
   - Previous Balance + Current Balance tracking
   - Bank Details section
   - Terms & Conditions footer

**Customer GSTIN on Invoices**: For BOTH old and new invoices, the system resolves customer GSTIN via:
1. Direct customer_id lookup
2. Normalized name + phone match
3. Phone-only fallback
4. Name-only fallback

**Draft Auto-Save**: Same as Purchase Orders — form state persisted to localStorage.

---

### 5.11 Suppliers Management

**Table/Card View** (responsive):
- Name, Contact Person, Phone, Email, GST Number, Drug License Number*, Status (Active/Inactive), Actions
- `*` Drug License = pharmacy only

**CRUD**: Add, Edit (dialog form), Delete (confirmation)
**Search**: By name, contact person, GST number

**Supplier Form Fields**: Name*, Contact Person, Phone, Email, Address, GST Number, Drug License Number* (pharmacy only), Active/Inactive toggle

---

### 5.12 Customer Management

**Table/Card View** (responsive):
- Name, GSTIN* (B2B only), Contact (phone + email), Address, Total Purchases, Outstanding Balance, Since (date), Actions

**CRUD**: Add, Edit, Delete
**Search**: By name, phone, email, GSTIN

**Outstanding Balance Calculation**:
- Total outstanding = Sum of all sales amounts − Sum of all received payments
- Clickable outstanding badge opens a detailed breakdown dialog

**Customer Outstanding Dialog**: Shows all invoices for the customer with paid/unpaid status and allows recording payments against specific invoices.

**B2B Electronics**: GSTIN is **mandatory** — validation error if blank.

---

### 5.13 Credit & Debit Notes

**Credit Notes** (Sales Returns):
- Issue against a specific sales invoice
- Select items to return with quantities
- Auto-restores inventory batch quantities
- Auto-generates credit note number (CN-XXXX)
- Fields: Original Invoice, Customer, Reason, Items, Total Credit Amount

**Debit Notes** (Purchase Returns):
- Issue against a specific purchase order
- Select items to return with quantities
- Auto-deducts inventory batch quantities
- Auto-generates debit note number (DN-XXXX)
- Fields: Original PO, Supplier, Reason, Items, Total Debit Amount

**Table View**: Tabs for Credit Notes / Debit Notes with search, columns: Note#, Original Order#, Party, Reason, Date, Status, Amount

---

### 5.14 Accounts & Financial Dashboard

**Summary Cards** (6 metrics):
- Total Sales, Received Payments, Sales Outstanding
- Total Purchases, Paid to Suppliers, Purchase Outstanding

**Date Filter**: This Month, Last Month, Last 3/6 Months, This Year

**Tabs**:
1. **Sales Receivable**: Table of all sales invoices with Invoice#, Customer, Date, Method, Total, Received, Balance, Status, "Record Payment" button
2. **Purchase Payable**: Same for purchase orders
3. **Payment Ledger**: All payment transactions with Reference#, Party, Type (Received/Made), Amount, Method, Date
4. **GST Summary**:
   - Output GST by Rate (table: Rate%, Taxable Value, CGST, SGST, Total GST, Transactions)
   - Input GST by Rate (same format)
   - Net Tax Liability = Output GST − Input GST
   - HSN-wise Sales Summary
   - HSN-wise Purchase Summary

---

### 5.15 Reports & Analytics

**Access**: Admin only (redirect non-admins)

**Date Range Selector**: Last 7 Days, Last 30 Days, This Month, All Time

**Key Metric Cards**: Total Sales, Total Purchases, Gross Profit, Profit Margin %

**Charts**:
1. **Sales & Purchase Trend** — Area chart, daily comparison
2. **Top Selling Products** — Horizontal bar chart by revenue (top 10)

**Tables**:
3. **Product Profit Margins** — All products with Purchase Price, Sale Price, MRP, Margin %
4. **Supplier Performance** — Orders count, Total value, Delivery rate %

---

### 5.16 User Management (Admin Page)

**Access**: Admin role required

**Stats**: Total Users, Pharmacists count, Admins count

**Create User Dialog**: Full Name, Email, Password (min 6 chars), Role (Staff/Pharmacist/Admin)

**User Table**: Name, Current Role (badge), Change Role (dropdown)

**Role Permissions**:
| Action | Staff | Pharmacist | Admin |
|--------|-------|------------|-------|
| View Dashboard | ✅ | ✅ | ✅ |
| View Products | ✅ | ✅ | ✅ |
| Add/Edit Products | ❌ | ✅ | ✅ |
| Create Sales | ✅ | ✅ | ✅ |
| Create POs | ❌ | ✅ | ✅ |
| Delete Invoices | ❌ | ❌ | ✅ |
| View Reports | ❌ | ❌ | ✅ |
| Manage Users | ❌ | ❌ | ✅ |
| Change Settings | ❌ | ❌ | ✅ |
| Backup/Restore | ❌ | ❌ | ✅ |

---

### 5.17 Settings

**Sections**:
1. **Company Information**: Edit business name
2. **Business Type**: Visual cards to switch type (Pharmacy/Electronics/General) — shows which features are enabled/disabled
3. **Active Features Summary**: Grid showing on/off status for all feature flags
4. **GST Pricing Mode**: Toggle for GST-inclusive pricing
5. **Invoice Settings**: Company details, logo upload, bank details, terms & conditions, display toggles
6. **Data Backup**: Manual backup and restore (see §5.18)

---

### 5.18 Backup & Restore

**Backup**:
- Copy the SQLite database file to a user-selected directory
- Also export as JSON (all tables) for portability
- Show file size and timestamp
- Option to schedule daily auto-backup to a configured folder

**Restore**:
- Select a `.sqlite` or `.json` backup file
- Confirmation dialog with warning
- Replace current database with backup
- Restart app after restore

---

### 5.19 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search bar on current page |
| `Alt+1` | Navigate to Dashboard |
| `Alt+2` | Navigate to Sales |
| `Alt+3` | Navigate to Purchase Orders |
| `Alt+4` | Navigate to Inventory |
| `Alt+5` | Navigate to Products |
| `Alt+6` | Navigate to Suppliers |
| `Ctrl+K` / `Cmd+K` | Open Command Palette |
| `Arrow Up/Down` | Navigate table rows |
| `Enter` | Open selected row |

---

### 5.20 Command Palette

- Triggered by `Ctrl+K` / `Cmd+K`
- Search across all pages and actions
- Quick navigation to any page
- Quick actions: New Sale, New PO, Add Product, etc.

---

## 6. FIFO Batch Allocation (Pharmacy)

When creating a sale, the system allocates stock using **First Expiry, First Out (FEFO)**:

1. Query all batches for the selected product where `quantity > 0`
2. Sort by `expiry_date ASC` (nearest expiry first)
3. Allocate requested quantity across batches:
   - If batch has enough → allocate from single batch
   - If batch doesn't have enough → split across multiple batches
4. Deduct allocated quantities from `inventory_batches.quantity`
5. If total available stock < requested quantity → show error, prevent sale

---

## 7. Invoice / Bill Generation

### 7.1 Standard Format (Pharmacy / General)

**Print**: Open browser print dialog with formatted HTML
**PDF**: Generate using jsPDF or `webContents.printToPDF()`
**HTML**: Download as standalone HTML file
**CSV**: Download as CSV with item details

**Template includes**:
- Company header
- Bill To: Customer Name, Phone, Address, GSTIN
- Item table: Product, Batch#, HSN, Qty, Unit, Rate, Disc%, GST%, Amount
- Subtotal, GST Amount, Discount, Additional Charges, Grand Total
- Payment Method

### 7.2 Electronics / B2B Format

**Enhanced template includes all standard fields PLUS**:
- Company Logo
- Company GSTIN + State
- Ship To section (with toggle)
- Customer GSTIN (mandatory display)
- HSN/SAC Summary Table: HSN Code, Taxable Value, CGST Rate & Amount, SGST Rate & Amount, Total Tax
- Amount in Words (e.g., "Rupees Twelve Thousand Five Hundred and Fifty Only")
- Previous Balance + Current Invoice = Total Due
- Bank Details box (Bank Name, A/C No, IFSC, Branch, A/C Holder)
- Terms & Conditions footer
- Authorized Signatory line

---

## 8. Electron-Specific Implementation

### 8.1 IPC Communication

All database operations happen in the **main process**. The renderer communicates via `ipcRenderer.invoke()`:

```typescript
// Main process handlers
ipcMain.handle('db:query', (event, sql, params) => { ... });
ipcMain.handle('db:run', (event, sql, params) => { ... });
ipcMain.handle('auth:login', (event, email, password) => { ... });
ipcMain.handle('auth:logout', () => { ... });
ipcMain.handle('backup:create', (event, targetPath) => { ... });
ipcMain.handle('backup:restore', (event, sourcePath) => { ... });
ipcMain.handle('print:pdf', (event, html) => { ... });
```

### 8.2 Database Location

- Store SQLite file in `app.getPath('userData')` (per-platform user data directory)
- Path: `<userData>/erp-database.sqlite`

### 8.3 Window Configuration

```typescript
const mainWindow = new BrowserWindow({
  width: 1280,
  height: 800,
  minWidth: 1024,
  minHeight: 600,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
  titleBarStyle: 'hiddenInset', // macOS
  icon: path.join(__dirname, 'assets/icon.png'),
});
```

### 8.4 Packaging

Use `electron-builder` with configurations for:
- **Windows**: NSIS installer (.exe) + portable
- **macOS**: DMG + .app bundle
- **Linux**: AppImage + .deb

### 8.5 Auto-Updates

Use `electron-updater` with a GitHub Releases or S3 update server:
- Check for updates on app launch
- Show update available notification
- Download in background
- Install on next restart

---

## 9. UI / UX Guidelines

### 9.1 Design System

- **Color Scheme**: Teal primary (#0d9488), dark sidebar with gradient
- **Font**: System font stack (no external dependencies — offline first)
- **Components**: Shadcn UI with custom variants
- **Responsive**: Desktop-first but handle window resize gracefully
- **Dark Mode**: Support via CSS custom properties and `next-themes`
- **Animations**: Subtle fade-in transitions on page navigation

### 9.2 Layout

- **Sidebar** (left): Collapsible, gradient background, grouped menu items with separators
  - Main: Dashboard, Products, Inventory, Expiry Tracking*
  - Orders: Purchase Orders, Sales Orders
  - Compliance: Scheduled Drugs*, Credit & Debit Notes, Accounts
  - Management: Suppliers, Customers
  - Admin: Reports, User Management, Settings
- **Header**: Page title, breadcrumbs, action buttons
- **Content**: Cards with tables, stat cards at top

### 9.3 Mobile/Tablet Considerations

Even though this is a desktop app, handle small window sizes:
- Tables switch to card view below 768px width
- Sidebar collapses to icon-only mode
- Dialogs become full-screen on small windows

---

## 10. Data Migration Plan

### 10.1 From Current Web App

1. Export all tables from current Supabase database as CSV
2. Build an import tool in the Electron app that:
   - Reads CSV files
   - Maps columns to SQLite schema
   - Handles UUID generation for new IDs
   - Maintains referential integrity (products before batches, etc.)

### 10.2 Import Order

1. `company_settings` (from `companies`)
2. `users` + `user_roles` (from `profiles` + `user_roles`)
3. `suppliers`
4. `products`
5. `customers`
6. `inventory_batches`
7. `purchase_orders` + `purchase_order_items`
8. `sales_orders` + `sales_order_items`
9. `payments`
10. `credit_notes` + `credit_note_items`
11. `debit_notes` + `debit_note_items`
12. `scheduled_drug_register`
13. `tax_sessions`
14. `invoice_settings`

---

## 11. Security Considerations

- All passwords hashed with bcrypt (cost factor 12)
- SQLite file is local — no network exposure
- Optional: Encrypt SQLite database with SQLCipher for at-rest encryption
- Session tokens expire after configurable timeout (default: 24 hours)
- Admin-only actions verified in main process IPC handlers (not just UI checks)

---

## 12. Testing Strategy

- **Unit Tests**: Vitest for business logic (FIFO allocation, GST calculations, amount-in-words)
- **Component Tests**: React Testing Library for form validation, conditional rendering
- **E2E Tests**: Playwright with Electron support for full flow testing
- **Database Tests**: Test migrations, constraints, and cascading deletes

---

## 13. Release & Distribution

### 13.1 Installers

| Platform | Format | Tool |
|----------|--------|------|
| Windows | .exe (NSIS), .msi | electron-builder |
| macOS | .dmg, .pkg | electron-builder |
| Linux | .AppImage, .deb, .rpm | electron-builder |

### 13.2 Code Signing

- Windows: Use a code signing certificate (EV recommended for SmartScreen)
- macOS: Apple Developer ID certificate + notarization

### 13.3 Auto-Update Server

- Host releases on GitHub Releases or a private S3 bucket
- `electron-updater` checks for updates on app launch
- Download delta updates when possible

---

## 14. Development Phases

### Phase 1: Core (4-6 weeks)
- Electron scaffold + SQLite setup
- Auth system (local login)
- Onboarding flow
- Products CRUD
- Suppliers CRUD
- Customers CRUD
- Business type adaptation engine

### Phase 2: Transactions (4-6 weeks)
- Purchase Orders (challan/invoice system)
- Sales Orders (FIFO batch allocation)
- Inventory management
- Invoice generation (Print, PDF, HTML, CSV)
- Payment recording

### Phase 3: Compliance & Finance (3-4 weeks)
- Credit Notes & Debit Notes
- Accounts dashboard (receivable/payable/GST)
- Scheduled Drug Register (pharmacy)
- Expiry tracking

### Phase 4: Polish & Distribution (2-3 weeks)
- Reports & Analytics
- Settings page
- Backup & Restore
- Keyboard shortcuts & Command Palette
- Packaging & installers
- Auto-update system
- Data migration tool

---

*This specification is generated from the live MedikaRP web application codebase. All features, database schemas, and business logic are derived from the actual working implementation.*
