/**
 * Concrete repos for local-first reads & writes.
 *
 * PR 2: Customers / Products / Suppliers (reads).
 * PR 3: Same modules — writes through repo + sync_queue.
 * PR 4: Inventory batches + Inventory transactions (reads + writes).
 * PR 5: Sales / Purchase orders + items + payments (reads). Mutations still online.
 */
import { BaseRepo } from "./baseRepo";
import type {
  CustomerRow,
  ProductRow,
  SupplierRow,
  InventoryBatchRow,
  InventoryTransactionRow,
  SalesOrderRow,
  SalesOrderItemRow,
  PurchaseOrderRow,
  PurchaseOrderItemRow,
  PaymentRow,
  CreditNoteRow,
  CreditNoteItemRow,
  DebitNoteRow,
  DebitNoteItemRow,
  BatchConversionRow,
} from "../db";

export const customerRepo = new BaseRepo<CustomerRow>("customers");
export const productRepo  = new BaseRepo<ProductRow>("products");
export const supplierRepo = new BaseRepo<SupplierRow>("suppliers");
export const inventoryBatchRepo       = new BaseRepo<InventoryBatchRow>("inventory_batches");
export const inventoryTransactionRepo = new BaseRepo<InventoryTransactionRow>("inventory_transactions");
export const salesOrderRepo       = new BaseRepo<SalesOrderRow>("sales_orders");
export const salesOrderItemRepo   = new BaseRepo<SalesOrderItemRow>("sales_order_items");
export const purchaseOrderRepo    = new BaseRepo<PurchaseOrderRow>("purchase_orders");
export const purchaseOrderItemRepo = new BaseRepo<PurchaseOrderItemRow>("purchase_order_items");
export const paymentRepo          = new BaseRepo<PaymentRow>("payments");
export const creditNoteRepo       = new BaseRepo<CreditNoteRow>("credit_notes");
export const creditNoteItemRepo   = new BaseRepo<CreditNoteItemRow>("credit_note_items");
export const debitNoteRepo        = new BaseRepo<DebitNoteRow>("debit_notes");
export const debitNoteItemRepo    = new BaseRepo<DebitNoteItemRow>("debit_note_items");
export const batchConversionRepo  = new BaseRepo<BatchConversionRow>("batch_conversions");
