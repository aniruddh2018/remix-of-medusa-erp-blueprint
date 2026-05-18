/**
 * Offline-first local database (Dexie / IndexedDB).
 *
 * This is the source of truth for the UI. All reads go here.
 * All writes go through `src/offline/repo/*` which write here AND
 * enqueue into `sync_queue` for the sync engine to push to Supabase.
 *
 * PR 1 (this file): schema only. No module is wired through it yet.
 */
import Dexie, { type Table } from "dexie";

// ──────────────────────────────────────────────────────────────────
// Sync metadata interfaces — every synced row carries these fields
// ──────────────────────────────────────────────────────────────────
export interface SyncedRow {
  id: string;
  company_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  device_id: string | null;
  deleted: boolean;
  /** Local-only state — never sent to server */
  _sync_state?: "synced" | "local_only" | "syncing" | "failed" | "conflict";
  /** Local-only timestamp of last successful pull/push */
  _local_updated_at?: number;
}

// ──────────────────────────────────────────────────────────────────
// Row shapes — kept loose (extends SyncedRow + index fields used in queries)
// Full domain shapes are still owned by Supabase generated types.
// Dexie only needs index keys; everything else lives in the object freely.
// ──────────────────────────────────────────────────────────────────
export interface CustomerRow extends SyncedRow {
  name: string;
  phone?: string | null;
  email?: string | null;
  [k: string]: unknown;
}
export interface ProductRow extends SyncedRow {
  name: string;
  manufacturer?: string;
  hsn_code?: string | null;
  is_active: boolean;
  [k: string]: unknown;
}
export interface SupplierRow extends SyncedRow {
  name: string;
  [k: string]: unknown;
}
export interface DoctorRow extends SyncedRow {
  name: string;
  [k: string]: unknown;
}
export interface InventoryBatchRow extends SyncedRow {
  product_id: string;
  batch_number: string;
  quantity: number;
  loose_quantity: number;
  expiry_date: string | null;
  mrp: number;
  [k: string]: unknown;
}
export interface InventoryTransactionRow extends SyncedRow {
  product_id: string;
  batch_id: string | null;
  transaction_type: string;
  quantity: number;
  [k: string]: unknown;
}
export interface SalesOrderRow extends SyncedRow {
  order_number: string;
  customer_id?: string | null;
  customer_name?: string;
  total_amount: number;
  sale_date?: string;
  [k: string]: unknown;
}
export interface SalesOrderItemRow extends SyncedRow {
  sales_order_id: string;
  product_id: string;
  batch_id: string | null;
  quantity: number;
  [k: string]: unknown;
}
export interface PurchaseOrderRow extends SyncedRow {
  order_number: string;
  supplier_id: string;
  total_amount: number;
  order_date: string;
  [k: string]: unknown;
}
export interface PurchaseOrderItemRow extends SyncedRow {
  purchase_order_id: string;
  product_id: string;
  quantity: number;
  [k: string]: unknown;
}
export interface PaymentRow extends SyncedRow {
  amount: number;
  payment_date: string;
  party_type: string;
  reference_id: string;
  [k: string]: unknown;
}

// ──────────────────────────────────────────────────────────────────
// Sync queue — every local mutation appends one row here
// ──────────────────────────────────────────────────────────────────
export type SyncOp = "insert" | "update" | "delete";
export type SyncStatus = "pending" | "syncing" | "synced" | "failed" | "conflict";

export interface SyncQueueRow {
  id?: number;
  table: string;
  op: SyncOp;
  /** Row id being mutated (uuid) */
  record_id: string;
  /** Full row payload (insert/update) or `{ id }` (delete) */
  payload: Record<string, unknown>;
  status: SyncStatus;
  retries: number;
  created_at: number;
  last_error?: string;
}

// ──────────────────────────────────────────────────────────────────
// Sync meta — one row per table; remembers cursor for delta pulls
// ──────────────────────────────────────────────────────────────────
export interface SyncMetaRow {
  table: string;
  /** ISO timestamp — `WHERE updated_at > last_sync` on next pull */
  last_sync: string | null;
  /** Initial full-pull completion */
  initial_pulled: boolean;
}

// ──────────────────────────────────────────────────────────────────
// Conflict log — manual-review queue (PR 3+)
// ──────────────────────────────────────────────────────────────────
export interface ConflictLogRow {
  id?: number;
  table: string;
  record_id: string;
  local_payload: Record<string, unknown>;
  server_payload: Record<string, unknown>;
  created_at: number;
  resolved: boolean;
}

// ──────────────────────────────────────────────────────────────────
// Attachment queue (PR 6)
// ──────────────────────────────────────────────────────────────────
export interface AttachmentQueueRow {
  id?: number;
  bucket: string;
  path: string;
  blob: Blob;
  mime_type: string;
  status: "pending" | "uploading" | "synced" | "failed";
  retries: number;
  created_at: number;
  last_error?: string;
}

// ──────────────────────────────────────────────────────────────────
// Encrypted offline auth cache
// ──────────────────────────────────────────────────────────────────
export interface AuthCacheRow {
  key: string; // "session" | "salt"
  ciphertext: ArrayBuffer;
  iv: ArrayBuffer;
  updated_at: number;
}

export class OfflineDB extends Dexie {
  customers!: Table<CustomerRow, string>;
  products!: Table<ProductRow, string>;
  suppliers!: Table<SupplierRow, string>;
  doctors!: Table<DoctorRow, string>;
  inventory_batches!: Table<InventoryBatchRow, string>;
  inventory_transactions!: Table<InventoryTransactionRow, string>;
  sales_orders!: Table<SalesOrderRow, string>;
  sales_order_items!: Table<SalesOrderItemRow, string>;
  purchase_orders!: Table<PurchaseOrderRow, string>;
  purchase_order_items!: Table<PurchaseOrderItemRow, string>;
  payments!: Table<PaymentRow, string>;

  sync_queue!: Table<SyncQueueRow, number>;
  sync_meta!: Table<SyncMetaRow, string>;
  conflict_log!: Table<ConflictLogRow, number>;
  attachment_queue!: Table<AttachmentQueueRow, number>;
  auth_cache!: Table<AuthCacheRow, string>;

  constructor() {
    super("medikarp_offline");

    // Indexed fields = columns used in queries. Other fields are still stored.
    this.version(1).stores({
      customers:               "id, company_id, name, updated_at, deleted",
      products:                "id, company_id, name, manufacturer, hsn_code, is_active, updated_at, deleted",
      suppliers:               "id, company_id, name, updated_at, deleted",
      doctors:                 "id, company_id, name, updated_at, deleted",
      inventory_batches:       "id, company_id, product_id, batch_number, expiry_date, updated_at, deleted",
      inventory_transactions:  "id, company_id, product_id, batch_id, transaction_type, created_at, updated_at, deleted",
      sales_orders:            "id, company_id, order_number, customer_id, sale_date, updated_at, deleted",
      sales_order_items:       "id, company_id, sales_order_id, product_id, batch_id, updated_at, deleted",
      purchase_orders:         "id, company_id, order_number, supplier_id, order_date, updated_at, deleted",
      purchase_order_items:    "id, company_id, purchase_order_id, product_id, updated_at, deleted",
      payments:                "id, company_id, party_type, reference_id, payment_date, updated_at, deleted",

      sync_queue:       "++id, table, status, created_at, [status+created_at]",
      sync_meta:        "table",
      conflict_log:     "++id, table, record_id, resolved, created_at",
      attachment_queue: "++id, status, created_at",
      auth_cache:       "key",
    });
  }
}

export const offlineDb = new OfflineDB();

/** Tables managed by the sync engine, in pull/push priority order. */
export const SYNCED_TABLES = [
  "customers",
  "suppliers",
  "doctors",
  "products",
  "inventory_batches",
  "inventory_transactions",
  "purchase_orders",
  "purchase_order_items",
  "sales_orders",
  "sales_order_items",
  "payments",
] as const;

export type SyncedTableName = (typeof SYNCED_TABLES)[number];
