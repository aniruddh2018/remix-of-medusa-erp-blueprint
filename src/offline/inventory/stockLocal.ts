/**
 * PR 6 — Local-first stock mutations.
 *
 * Mirrors server RPCs `deduct_sale_inventory`, `restore_sale_inventory`,
 * and `receive_purchase_batches`. Every batch write goes through
 * `inventoryBatchRepo` so it lands in sync_queue too.
 */
import { offlineDb } from "../db";
import {
  inventoryBatchRepo,
  inventoryTransactionRepo,
} from "../repo";

export interface DeductItem {
  batch_id: string;
  quantity: number;
  free_quantity?: number;
  base_quantity?: number;
  reference_id: string;
  unit_price?: number;
}

export interface ReceiveBatch {
  product_id: string;
  batch_number: string;            // "" if none — uses MRP_<mrp> placeholder like server
  quantity: number;                // base units
  purchase_price: number;
  mrp: number;
  expiry_date: string | null;      // YYYY-MM-DD
  manufacturing_date: string | null;
  supplier_id: string | null;
  company_id: string;
}

interface DeductCtx {
  companyId: string;
  userId: string | null;
  blockExpired?: boolean;
  referenceType?: string; // default "sales_order"
}

/** Deduct stock from a list of (already FIFO-allocated) batches. */
export async function deductSaleInventoryLocal(items: DeductItem[], ctx: DeductCtx) {
  for (const it of items) {
    const base = Number(it.base_quantity ?? (it.quantity + (it.free_quantity ?? 0)));
    if (!(base > 0)) continue;

    const batch = await offlineDb.inventory_batches.get(it.batch_id);
    if (!batch) throw new Error(`Batch not found locally: ${it.batch_id}`);

    const pack = Number((batch as any).pack_size) || 0;
    const sealed = Number(batch.quantity) || 0;
    const loose = Number((batch as any).loose_quantity) || 0;

    if (ctx.blockExpired && batch.expiry_date && batch.expiry_date <= new Date().toISOString().slice(0, 10)) {
      throw new Error(`Cannot sell from expired batch (expired ${batch.expiry_date})`);
    }
    if (loose + sealed * (pack || 1) < base) {
      throw new Error(`Insufficient stock in batch ${batch.batch_number}. Need ${base}, have ${loose + sealed * (pack || 1)}`);
    }

    let need = base;
    let newLoose = loose;
    let newSealed = sealed;
    let broken = 0;

    if (newLoose >= need) {
      newLoose -= need;
      need = 0;
    } else {
      need -= newLoose;
      newLoose = 0;
    }
    if (need > 0) {
      if (pack <= 0) {
        newSealed -= need;
      } else {
        broken = Math.ceil(need / pack);
        newSealed -= broken;
        newLoose = broken * pack - need;
      }
    }

    await inventoryBatchRepo.upsert({
      ...(batch as any),
      quantity: newSealed,
      loose_quantity: newLoose,
    });

    await inventoryTransactionRepo.upsert({
      company_id: ctx.companyId,
      product_id: (batch as any).product_id,
      batch_id: batch.id,
      transaction_type: "sale",
      quantity: -(it.quantity + (it.free_quantity ?? 0)),
      rate: it.unit_price ?? 0,
      reference_type: "sales_order",
      reference_id: it.reference_id,
      created_by: ctx.userId,
      notes: broken > 0 ? `Broke ${broken} sealed pack(s) into loose` : null,
    } as any);
  }
}

/** Restore stock for sale-return lines (reform sealed packs from full multiples). */
export async function restoreSaleInventoryLocal(items: DeductItem[], ctx: DeductCtx) {
  for (const it of items) {
    const base = Number(it.base_quantity ?? (it.quantity + (it.free_quantity ?? 0)));
    if (!(base > 0)) continue;

    const batch = await offlineDb.inventory_batches.get(it.batch_id);
    if (!batch) throw new Error(`Batch not found locally: ${it.batch_id}`);

    const pack = Number((batch as any).pack_size) || 0;
    const sealed = Number(batch.quantity) || 0;
    const loose = Number((batch as any).loose_quantity) || 0;

    let addSealed = base;
    let addLoose = 0;
    if (pack > 0) {
      addSealed = Math.floor(base / pack);
      addLoose = base - addSealed * pack;
    }

    await inventoryBatchRepo.upsert({
      ...(batch as any),
      quantity: sealed + addSealed,
      loose_quantity: loose + addLoose,
    });

    await inventoryTransactionRepo.upsert({
      company_id: ctx.companyId,
      product_id: (batch as any).product_id,
      batch_id: batch.id,
      transaction_type: "sale_return",
      quantity: it.quantity + (it.free_quantity ?? 0),
      rate: 0,
      reference_type: "sales_order",
      reference_id: it.reference_id,
      created_by: ctx.userId,
    } as any);
  }
}

/**
 * Local equivalent of receive_purchase_batches.
 * Merges into an existing batch with the same (product, batch_number, mrp, company),
 * else creates one. Returns { batchIdByIndex } for callers needing the resolved id.
 */
export async function receivePurchaseBatchesLocal(
  batches: ReceiveBatch[],
  purchaseOrderId: string | null,
  ctx: DeductCtx,
): Promise<string[]> {
  const ids: string[] = [];
  for (const b of batches) {
    if (!(b.quantity > 0)) {
      ids.push("");
      continue;
    }
    const isUserProvided = !!b.batch_number?.trim();
    const effectiveBatchNumber = isUserProvided ? b.batch_number.trim() : `MRP_${b.mrp}`;
    const effectiveExpiry = isUserProvided ? b.expiry_date : null;

    const existing = (await offlineDb.inventory_batches
      .where("product_id")
      .equals(b.product_id)
      .toArray())
      .find(
        (row: any) =>
          row.batch_number === effectiveBatchNumber &&
          Number(row.mrp) === Number(b.mrp) &&
          row.company_id === b.company_id &&
          !row.deleted,
      );

    let targetId: string;
    if (existing) {
      await inventoryBatchRepo.upsert({
        ...(existing as any),
        quantity: Number(existing.quantity) + b.quantity,
        purchase_price: b.purchase_price,
        expiry_date: effectiveExpiry ?? existing.expiry_date,
        manufacturing_date: b.manufacturing_date ?? (existing as any).manufacturing_date,
        supplier_id: b.supplier_id ?? (existing as any).supplier_id,
      });
      targetId = existing.id;
    } else {
      const created = await inventoryBatchRepo.upsert({
        product_id: b.product_id,
        batch_number: effectiveBatchNumber,
        quantity: b.quantity,
        loose_quantity: 0,
        purchase_price: b.purchase_price,
        mrp: b.mrp,
        expiry_date: effectiveExpiry,
        manufacturing_date: b.manufacturing_date,
        supplier_id: b.supplier_id,
        company_id: b.company_id,
        received_date: new Date().toISOString().slice(0, 10),
      } as any);
      targetId = created.id;
    }
    ids.push(targetId);

    await inventoryTransactionRepo.upsert({
      company_id: ctx.companyId,
      product_id: b.product_id,
      batch_id: targetId,
      transaction_type: "purchase",
      quantity: b.quantity,
      rate: b.purchase_price,
      reference_type: "purchase_order",
      reference_id: purchaseOrderId,
      created_by: ctx.userId,
    } as any);
  }
  return ids;
}
