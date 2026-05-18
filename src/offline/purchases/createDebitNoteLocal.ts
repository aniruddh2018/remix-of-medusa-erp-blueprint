/**
 * PR 7 — Local-first debit note creation (supplier-side returns).
 * Optionally deducts stock from a specific batch (used by SupplierReturnDialog).
 */
import { debitNoteRepo, debitNoteItemRepo } from "../repo";
import { deductSaleInventoryLocal, type DeductItem } from "../inventory/stockLocal";

export interface DebitNoteLineInput {
  product_id: string;
  batch_id: string | null;
  product_name: string;
  batch_number: string;
  quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  total_price: number;
}

export async function createDebitNoteLocal(args: {
  companyId: string;
  userId: string | null;
  header: {
    debit_note_number: string;
    original_order_id?: string | null;
    original_order_number: string;
    supplier_id?: string | null;
    supplier_name: string;
    reason: string;
    notes?: string | null;
    total_amount: number;
    gst_amount: number;
    status?: string;
  };
  items: DebitNoteLineInput[];
  /** When true, deducts batch stock for each line that has a batch_id (supplier returns). */
  deductStock?: boolean;
}) {
  const { companyId, userId, header, items, deductStock } = args;
  const dn = await debitNoteRepo.upsert({
    ...header,
    status: header.status ?? "issued",
    created_by: userId,
    company_id: companyId,
  } as any);

  for (const it of items) {
    await debitNoteItemRepo.upsert({
      debit_note_id: dn.id,
      product_id: it.product_id,
      batch_id: it.batch_id,
      product_name: it.product_name,
      batch_number: it.batch_number,
      quantity: it.quantity,
      unit_price: it.unit_price,
      gst_percentage: it.gst_percentage,
      discount_percentage: it.discount_percentage,
      total_price: it.total_price,
      company_id: companyId,
    } as any);
  }

  if (deductStock) {
    const deducts: DeductItem[] = items
      .filter((i) => i.batch_id && i.quantity > 0)
      .map((i) => ({
        batch_id: i.batch_id as string,
        quantity: i.quantity,
        free_quantity: 0,
        base_quantity: i.quantity,
        reference_id: dn.id,
        unit_price: i.unit_price,
      }));
    if (deducts.length) {
      await deductSaleInventoryLocal(deducts, {
        companyId,
        userId,
        referenceType: "debit_note",
      });
    }
  }
  return dn;
}
