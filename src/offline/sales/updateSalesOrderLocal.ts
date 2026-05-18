/**
 * PR 7 — Local-first edit of an existing sales order.
 * Mirrors the logic from EditSaleDialog's online flow but routes all writes
 * through repos + local stock helpers so it works offline and queues for sync.
 *
 * Item deltas:
 *   - deletedItemIds → restore base_quantity to inventory and soft-delete the row.
 *   - existing items → adjust unit_price/qty/discount + restore or deduct delta in base units.
 *   - new items → insert + deduct base_quantity from inventory.
 */
import { offlineDb } from "../db";
import {
  salesOrderRepo,
  salesOrderItemRepo,
} from "../repo";
import {
  deductSaleInventoryLocal,
  restoreSaleInventoryLocal,
  type DeductItem,
} from "../inventory/stockLocal";

export interface EditSaleLine {
  id: string;                 // local id of existing row, OR a fresh uuid for new ones
  isNew?: boolean;
  product_id: string;
  batch_id: string;
  quantity: number;
  free_quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  total_price: number;
  base_quantity?: number;     // for new items; existing rows infer from stored value
}

export async function updateSalesOrderLocal(args: {
  saleId: string;
  companyId: string;
  userId: string | null;
  blockExpired?: boolean;
  header: Record<string, unknown>;
  items: EditSaleLine[];
  deletedItemIds: string[];
}) {
  const { saleId, companyId, userId, blockExpired, header, items, deletedItemIds } = args;

  const ctx = { companyId, userId, blockExpired };

  // 1. Restore stock for deleted lines + soft-delete the rows
  const restoreOnDelete: DeductItem[] = [];
  for (const id of deletedItemIds) {
    const orig = await offlineDb.sales_order_items.get(id);
    if (orig) {
      const total = (orig as any).quantity + ((orig as any).free_quantity || 0);
      const base = (orig as any).base_quantity ?? total;
      if (base > 0) {
        restoreOnDelete.push({
          batch_id: (orig as any).batch_id,
          quantity: (orig as any).quantity || 0,
          free_quantity: (orig as any).free_quantity || 0,
          base_quantity: base,
          reference_id: saleId,
        });
      }
      await salesOrderItemRepo.softDelete(id);
    }
  }
  if (restoreOnDelete.length) await restoreSaleInventoryLocal(restoreOnDelete, ctx);

  // 2. Existing items — compute delta
  const restoreDelta: DeductItem[] = [];
  const deductDelta: DeductItem[] = [];
  for (const item of items.filter((i) => !i.isNew)) {
    const orig = await offlineDb.sales_order_items.get(item.id);
    let newBaseQty = item.quantity + item.free_quantity;
    if (orig) {
      const origTotal = (orig as any).quantity + ((orig as any).free_quantity || 0);
      const origBase = (orig as any).base_quantity ?? origTotal;
      const factor = origTotal > 0 ? origBase / origTotal : 1;
      newBaseQty = Math.round((item.quantity + item.free_quantity) * factor);
      const baseDiff = origBase - newBaseQty;
      if (baseDiff > 0) {
        restoreDelta.push({
          batch_id: item.batch_id,
          quantity: 0,
          free_quantity: 0,
          base_quantity: baseDiff,
          reference_id: saleId,
        });
      } else if (baseDiff < 0) {
        deductDelta.push({
          batch_id: item.batch_id,
          quantity: 0,
          free_quantity: 0,
          base_quantity: Math.abs(baseDiff),
          reference_id: saleId,
          unit_price: item.unit_price,
        });
      }
      await salesOrderItemRepo.upsert({
        ...(orig as any),
        quantity: item.quantity,
        free_quantity: item.free_quantity,
        unit_price: item.unit_price,
        discount_percentage: item.discount_percentage,
        total_price: item.total_price,
        gst_percentage: item.gst_percentage,
        base_quantity: newBaseQty,
      });
    }
  }
  if (restoreDelta.length) await restoreSaleInventoryLocal(restoreDelta, ctx);
  if (deductDelta.length) await deductSaleInventoryLocal(deductDelta, ctx);

  // 3. New items — insert and deduct
  const newDeducts: DeductItem[] = [];
  for (const item of items.filter((i) => i.isNew)) {
    const base = item.base_quantity ?? (item.quantity + item.free_quantity);
    await salesOrderItemRepo.upsert({
      sales_order_id: saleId,
      product_id: item.product_id,
      batch_id: item.batch_id,
      quantity: item.quantity,
      free_quantity: item.free_quantity,
      unit_price: item.unit_price,
      gst_percentage: item.gst_percentage,
      discount_percentage: item.discount_percentage,
      total_price: item.total_price,
      company_id: companyId,
      base_quantity: base,
    } as any);
    if (base > 0) {
      newDeducts.push({
        batch_id: item.batch_id,
        quantity: item.quantity,
        free_quantity: item.free_quantity,
        base_quantity: base,
        reference_id: saleId,
        unit_price: item.unit_price,
      });
    }
  }
  if (newDeducts.length) await deductSaleInventoryLocal(newDeducts, ctx);

  // 4. Update order header
  const existing = await offlineDb.sales_orders.get(saleId);
  if (!existing) throw new Error("Sales order not found locally");
  await salesOrderRepo.upsert({ ...(existing as any), ...header });
}
