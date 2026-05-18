/**
 * PR 6 — Local-first purchase-order writer.
 * Mirrors the createOrderMutation in PurchaseOrders.tsx.
 */
import { offlineDb } from "../db";
import { purchaseOrderRepo, purchaseOrderItemRepo } from "../repo";
import { getNextPurchaseOrderNumber } from "../billing/invoiceNumbering";
import { receivePurchaseBatchesLocal, type ReceiveBatch } from "../inventory/stockLocal";

export interface PurchaseHeaderInput {
  supplier_id: string;
  expected_delivery_date?: string | null;
  notes?: string | null;
  total_amount: number;
  gst_amount: number;
  discount_amount: number;
  freight_charges: number;
  handling_charges: number;
  other_charges: number;
  status?: string;
  challan_number?: string | null;
  is_challan: boolean;
  invoice_number?: string | null;
}

export interface PurchaseItemInput {
  product_id: string;
  product_name?: string;
  quantity: number;
  free_quantity: number;
  purchased_unit?: string | null;
  base_quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  total_price: number;
  batch_number?: string;
  expiry_date?: string | null;
  mrp?: number;
  fromChallan?: boolean;
}

export async function createPurchaseOrderLocal(args: {
  companyId: string;
  userId: string | null;
  header: PurchaseHeaderInput;
  items: PurchaseItemInput[];
}) {
  const { companyId, userId, header, items } = args;

  if (!header.supplier_id) throw new Error("Please select a supplier");
  if (items.length === 0) throw new Error("Add at least one item");

  // Duplicate challan/invoice check (local)
  if (header.challan_number) {
    const number = header.challan_number;
    const conflict = await offlineDb.purchase_orders
      .where("company_id")
      .equals(companyId)
      .filter((p: any) =>
        !p.deleted &&
        p.supplier_id === header.supplier_id &&
        (header.is_challan ? p.challan_number === number : p.invoice_number === number),
      )
      .first();
    if (conflict) {
      throw new Error(`${header.is_challan ? "Challan" : "Invoice"} "${number}" already exists for this supplier.`);
    }
  }

  // Validate product ids exist locally
  const newItems = items.filter((i) => !i.fromChallan);
  const ids = Array.from(new Set(newItems.map((i) => i.product_id).filter(Boolean)));
  if (ids.length) {
    const found = await offlineDb.products.where("id").anyOf(ids).toArray();
    const existingSet = new Set(found.filter((p: any) => !p.deleted).map((p: any) => p.id));
    const missing = newItems.filter((i) => !existingSet.has(i.product_id));
    if (missing.length) {
      throw new Error(`These products no longer exist: ${missing.map((m) => m.product_name).join(", ")}`);
    }
  }

  const orderNumber = await getNextPurchaseOrderNumber();
  const order = await purchaseOrderRepo.upsert({
    order_number: orderNumber,
    supplier_id: header.supplier_id,
    expected_delivery_date: header.expected_delivery_date ?? null,
    notes: header.notes ?? null,
    total_amount: header.total_amount,
    gst_amount: header.gst_amount,
    discount_amount: header.discount_amount,
    freight_charges: header.freight_charges,
    handling_charges: header.handling_charges,
    other_charges: header.other_charges,
    created_by: userId,
    status: header.status ?? "pending",
    challan_number: header.is_challan ? header.challan_number ?? null : null,
    is_challan: header.is_challan,
    invoice_number: !header.is_challan ? header.challan_number ?? null : null,
    company_id: companyId,
    order_date: new Date().toISOString().slice(0, 10),
  } as any);

  try {
    if (newItems.length) {
      for (const item of newItems) {
        await purchaseOrderItemRepo.upsert({
          purchase_order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          free_quantity: item.free_quantity,
          purchased_unit: item.purchased_unit ?? null,
          base_quantity: item.base_quantity,
          unit_price: item.unit_price,
          gst_percentage: item.gst_percentage,
          discount_percentage: item.discount_percentage,
          total_price: item.total_price,
          company_id: companyId,
        } as any);
      }

      const batchPayload: ReceiveBatch[] = newItems.map((item) => ({
        product_id: item.product_id,
        batch_number: item.batch_number || "",
        quantity: item.base_quantity,
        purchase_price: item.unit_price,
        mrp: item.mrp || item.unit_price * 1.2,
        expiry_date: item.expiry_date || null,
        manufacturing_date: null,
        supplier_id: header.supplier_id || null,
        company_id: companyId,
      }));
      await receivePurchaseBatchesLocal(batchPayload, order.id, { companyId, userId });
    }

    // Mark merged challans
    // (kept online-only for now; that path is rare and triggers another local mutation)
  } catch (err) {
    try {
      const partialItems = await offlineDb.purchase_order_items
        .where("purchase_order_id")
        .equals(order.id)
        .toArray();
      for (const it of partialItems) await purchaseOrderItemRepo.softDelete(it.id);
      await purchaseOrderRepo.softDelete(order.id);
    } catch (rollbackErr) {
      console.error("[createPurchaseOrderLocal] rollback failed:", rollbackErr);
    }
    throw err;
  }

  return order;
}
