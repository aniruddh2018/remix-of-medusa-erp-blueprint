/**
 * PR 6 — Local-first sales-order writer.
 *
 * Replaces the inline supabase.from("sales_orders") / RPC calls in Sales.tsx.
 * Everything writes to Dexie via the repo layer, which appends to sync_queue.
 * Stock is deducted/restored locally; the sync engine pushes the same rows
 * to the server when online and the server triggers re-do their own RPCs
 * implicitly via the inventory_transactions ledger.
 */
import { offlineDb } from "../db";
import { salesOrderRepo, salesOrderItemRepo } from "../repo";
import { getNextInvoiceNumber } from "../billing/invoiceNumbering";
import {
  deductSaleInventoryLocal,
  restoreSaleInventoryLocal,
  type DeductItem,
} from "../inventory/stockLocal";

export interface SalesOrderHeaderInput {
  invoice_number?: string;
  prefix: string;
  customer_id?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_gstin?: string | null;
  prescription_number?: string | null;
  prescription_date?: string | null;
  prescription_duration_days?: number | null;
  doctor_id?: string | null;
  doctor_name?: string | null;
  doctor_registration_number?: string | null;
  notes?: string | null;
  total_amount: number;
  gst_amount: number;
  discount_amount: number;
  freight_charges: number;
  handling_charges: number;
  delivery_charges: number;
  other_charges: number;
  status?: string;
  sale_date?: string | null; // YYYY-MM-DD, defaults to today
}

export interface SalesOrderLineInput {
  product_id: string;
  batch_id: string;
  quantity: number;          // billed qty (positive even for returns; flip via is_return)
  free_quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  total_price: number;
  sold_unit?: string | null;
  base_quantity: number;     // base units consumed/restored
  is_return: boolean;
}

export interface CreateSaleResult {
  id: string;
  invoice_number: string;
  customer_name: string;
  total_amount: number;
}

export async function createSalesOrderLocal(args: {
  companyId: string;
  userId: string | null;
  blockExpired?: boolean;
  header: SalesOrderHeaderInput;
  items: SalesOrderLineInput[];
}): Promise<CreateSaleResult> {
  const { companyId, userId, blockExpired, header, items } = args;

  if (items.some((i) => !i.batch_id)) {
    throw new Error(`${items.filter((i) => !i.batch_id).length} item(s) have no batch assigned.`);
  }

  // 1. resolve invoice number
  let invoiceNumber = header.invoice_number?.trim() || "";
  if (!invoiceNumber) {
    invoiceNumber = await getNextInvoiceNumber(companyId, header.prefix);
  }

  // 2. duplicate check (local)
  const dupe = await offlineDb.sales_orders
    .where("company_id")
    .equals(companyId)
    .filter((o: any) => o.invoice_number === invoiceNumber && !o.deleted)
    .first();
  if (dupe) throw new Error(`Invoice "${invoiceNumber}" already exists.`);

  // 3. insert order header
  const order = await salesOrderRepo.upsert({
    invoice_number: invoiceNumber,
    company_id: companyId,
    customer_id: header.customer_id ?? null,
    customer_name: header.customer_name,
    customer_phone: header.customer_phone ?? null,
    customer_address: header.customer_address ?? null,
    customer_gstin: header.customer_gstin ?? null,
    prescription_number: header.prescription_number ?? null,
    prescription_date: header.prescription_date ?? null,
    prescription_duration_days: header.prescription_duration_days ?? null,
    doctor_id: header.doctor_id ?? null,
    doctor_name: header.doctor_name ?? null,
    doctor_registration_number: header.doctor_registration_number ?? null,
    notes: header.notes ?? null,
    total_amount: header.total_amount,
    gst_amount: header.gst_amount,
    discount_amount: header.discount_amount,
    freight_charges: header.freight_charges,
    handling_charges: header.handling_charges,
    delivery_charges: header.delivery_charges,
    other_charges: header.other_charges,
    created_by: userId,
    status: header.status ?? "confirmed",
    sale_date: new Date().toISOString().slice(0, 10),
  } as any);

  // 4. items + stock
  try {
    for (const i of items) {
      const signedQty = i.is_return ? -i.quantity : i.quantity;
      const signedFree = i.is_return ? -i.free_quantity : i.free_quantity;
      const signedBase = i.is_return ? -i.base_quantity : i.base_quantity;
      await salesOrderItemRepo.upsert({
        sales_order_id: order.id,
        product_id: i.product_id,
        batch_id: i.batch_id,
        quantity: signedQty,
        free_quantity: signedFree,
        unit_price: i.unit_price,
        gst_percentage: i.gst_percentage,
        discount_percentage: i.discount_percentage,
        total_price: i.total_price,
        company_id: companyId,
        sold_unit: i.sold_unit ?? null,
        base_quantity: signedBase,
      } as any);
    }

    const deductItems: DeductItem[] = items
      .filter((i) => !i.is_return)
      .map((i) => ({
        batch_id: i.batch_id,
        quantity: i.quantity,
        free_quantity: i.free_quantity,
        base_quantity: i.base_quantity,
        reference_id: order.id,
        unit_price: i.unit_price,
      }));
    const restoreItems: DeductItem[] = items
      .filter((i) => i.is_return)
      .map((i) => ({
        batch_id: i.batch_id,
        quantity: i.quantity,
        free_quantity: i.free_quantity,
        base_quantity: i.base_quantity,
        reference_id: order.id,
      }));

    if (deductItems.length) await deductSaleInventoryLocal(deductItems, { companyId, userId, blockExpired });
    if (restoreItems.length) await restoreSaleInventoryLocal(restoreItems, { companyId, userId });
  } catch (err) {
    // Manual rollback: soft-delete the partial order + items
    try {
      const partialItems = await offlineDb.sales_order_items
        .where("sales_order_id")
        .equals(order.id)
        .toArray();
      for (const it of partialItems) await salesOrderItemRepo.softDelete(it.id);
      await salesOrderRepo.softDelete(order.id);
    } catch (rollbackErr) {
      console.error("[createSalesOrderLocal] rollback failed:", rollbackErr);
    }
    throw err;
  }

  return {
    id: order.id,
    invoice_number: invoiceNumber,
    customer_name: header.customer_name,
    total_amount: header.total_amount,
  };
}
