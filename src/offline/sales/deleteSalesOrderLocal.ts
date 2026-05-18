/**
 * PR 7 — Local-first delete of a sales order.
 * Restores stock for sale lines (qty>0) and re-deducts for return lines (qty<0).
 * Soft-deletes the order, its items, and any linked payments.
 * Detaches credit_notes that referenced this invoice (local rows only).
 */
import { offlineDb } from "../db";
import {
  salesOrderRepo,
  salesOrderItemRepo,
  paymentRepo,
  creditNoteRepo,
} from "../repo";
import {
  deductSaleInventoryLocal,
  restoreSaleInventoryLocal,
  type DeductItem,
} from "../inventory/stockLocal";

export async function deleteSalesOrderLocal(
  orderId: string,
  ctx: { companyId: string; userId: string | null },
) {
  const items = await offlineDb.sales_order_items
    .where("sales_order_id")
    .equals(orderId)
    .toArray();

  const restoreItems: DeductItem[] = items
    .filter((i: any) => Number(i.quantity) > 0)
    .map((i: any) => ({
      batch_id: i.batch_id,
      quantity: i.quantity,
      free_quantity: i.free_quantity || 0,
      base_quantity: i.base_quantity ?? (i.quantity + (i.free_quantity || 0)),
      reference_id: orderId,
    }));
  const reDeductItems: DeductItem[] = items
    .filter((i: any) => Number(i.quantity) < 0)
    .map((i: any) => ({
      batch_id: i.batch_id,
      quantity: Math.abs(i.quantity),
      free_quantity: Math.abs(i.free_quantity || 0),
      base_quantity: Math.abs(i.base_quantity ?? (i.quantity + (i.free_quantity || 0))),
      reference_id: orderId,
    }));

  if (restoreItems.length) await restoreSaleInventoryLocal(restoreItems, ctx);
  if (reDeductItems.length) await deductSaleInventoryLocal(reDeductItems, ctx);

  // Detach linked credit notes (clear original_invoice_id locally).
  const linkedCNs = await offlineDb.credit_notes
    .where("original_invoice_id")
    .equals(orderId)
    .toArray();
  for (const cn of linkedCNs) {
    if (cn.deleted) continue;
    await creditNoteRepo.upsert({ ...(cn as any), original_invoice_id: null });
  }

  // Soft-delete payments tied to this order.
  const pays = await offlineDb.payments
    .where("reference_id")
    .equals(orderId)
    .toArray();
  for (const p of pays) {
    if ((p as any).reference_type === "sales_order" && !p.deleted) {
      await paymentRepo.softDelete(p.id);
    }
  }

  for (const it of items) {
    if (!it.deleted) await salesOrderItemRepo.softDelete(it.id);
  }
  await salesOrderRepo.softDelete(orderId);
}
