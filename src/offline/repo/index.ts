/**
 * Concrete repos for local-first reads & writes.
 *
 * PR 2: Customers / Products / Suppliers (reads).
 * PR 3: Same modules — writes through repo + sync_queue.
 * PR 4: Inventory batches + Inventory transactions (reads + writes).
 */
import { BaseRepo } from "./baseRepo";
import type {
  CustomerRow,
  ProductRow,
  SupplierRow,
  InventoryBatchRow,
  InventoryTransactionRow,
} from "../db";

export const customerRepo = new BaseRepo<CustomerRow>("customers");
export const productRepo  = new BaseRepo<ProductRow>("products");
export const supplierRepo = new BaseRepo<SupplierRow>("suppliers");
export const inventoryBatchRepo       = new BaseRepo<InventoryBatchRow>("inventory_batches");
export const inventoryTransactionRepo = new BaseRepo<InventoryTransactionRow>("inventory_transactions");
