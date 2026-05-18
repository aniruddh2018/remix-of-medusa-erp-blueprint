/**
 * PR 7 — Local-first wrapper around receivePurchaseBatchesLocal that also
 * persists per-batch conversions (Pack -> Base) used by ReceiveInventoryDialog.
 */
import { batchConversionRepo } from "../repo";
import {
  receivePurchaseBatchesLocal,
  type ReceiveBatch,
} from "./stockLocal";

export interface ReceiveBatchWithConv extends ReceiveBatch {
  pack_unit?: string;
  base_unit?: string;
  pack_size?: number; // base units per pack (0/1 = no hierarchy)
}

export async function receiveInventoryLocal(args: {
  companyId: string;
  userId: string | null;
  purchaseOrderId: string | null;
  batches: ReceiveBatchWithConv[];
}): Promise<{ batchIds: string[]; created: number; merged: number }> {
  const { companyId, userId, purchaseOrderId, batches } = args;

  const ids = await receivePurchaseBatchesLocal(
    batches.map((b) => ({
      product_id: b.product_id,
      batch_number: b.batch_number,
      quantity: b.quantity,
      purchase_price: b.purchase_price,
      mrp: b.mrp,
      expiry_date: b.expiry_date,
      manufacturing_date: b.manufacturing_date,
      supplier_id: b.supplier_id,
      company_id: b.company_id,
    })),
    purchaseOrderId,
    { companyId, userId },
  );

  // Persist per-batch conversions for newly received batches with a meaningful pack hierarchy.
  let created = 0;
  let merged = 0;
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i];
    const targetId = ids[i];
    if (!targetId) continue;
    const sameUnit =
      (b.pack_unit ?? "").trim().toLowerCase() === (b.base_unit ?? "").trim().toLowerCase();
    if (!sameUnit && b.pack_size && b.pack_size > 1 && b.pack_unit && b.base_unit) {
      await batchConversionRepo.upsert({
        company_id: companyId,
        product_id: b.product_id,
        batch_id: targetId,
        from_unit: b.pack_unit,
        to_unit: b.base_unit,
        conversion_factor: Number(b.pack_size),
      } as any);
      created++;
    } else {
      merged++;
    }
  }
  return { batchIds: ids, created, merged };
}
