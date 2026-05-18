/**
 * PR 7 — Local-first credit note creation.
 * Inserts credit_notes + credit_note_items locally (queued for sync) and
 * restores inventory for any returned line with a batch_id.
 */
import { creditNoteRepo, creditNoteItemRepo } from "../repo";
import { restoreSaleInventoryLocal, type DeductItem } from "../inventory/stockLocal";

export interface CreditNoteLineInput {
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

export async function createCreditNoteLocal(args: {
  companyId: string;
  userId: string | null;
  header: {
    credit_note_number: string;
    original_invoice_id?: string | null;
    original_invoice_number: string;
    customer_name: string;
    customer_phone?: string | null;
    reason: string;
    notes?: string | null;
    total_amount: number;
    gst_amount: number;
    status?: string;
  };
  items: CreditNoteLineInput[];
}) {
  const { companyId, userId, header, items } = args;
  const cn = await creditNoteRepo.upsert({
    ...header,
    status: header.status ?? "issued",
    created_by: userId,
    company_id: companyId,
  } as any);

  for (const it of items) {
    await creditNoteItemRepo.upsert({
      credit_note_id: cn.id,
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

  const restore: DeductItem[] = items
    .filter((i) => i.batch_id && i.quantity > 0)
    .map((i) => ({
      batch_id: i.batch_id as string,
      quantity: i.quantity,
      free_quantity: 0,
      base_quantity: i.quantity,
      reference_id: cn.id,
    }));
  if (restore.length) {
    await restoreSaleInventoryLocal(restore, {
      companyId,
      userId,
      referenceType: "credit_note",
    });
  }
  return cn;
}
