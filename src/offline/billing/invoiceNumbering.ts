/**
 * PR 6 — Offline-safe invoice/order numbering.
 *
 * Online → call `get_next_invoice_number` RPC (canonical, sequential).
 * Offline → local per-device counter: `<PREFIX>-D<shortDevice>-<seq>`.
 *   These never collide with server numbers, and on reconcile the server
 *   can reassign canonical numbers; we expose the local one until then.
 */
import { supabase } from "@/integrations/supabase/client";
import { getDeviceShortId } from "../device";

const COUNTER_KEY_PREFIX = "medikarp_local_seq_";

export async function getNextInvoiceNumber(companyId: string, rawPrefix: string): Promise<string> {
  const prefix = (rawPrefix || "INV").replace(/[-\s]+$/g, "") || "INV";
  if (typeof navigator !== "undefined" && navigator.onLine) {
    const { data, error } = await supabase.rpc("get_next_invoice_number", {
      _company_id: companyId,
      _prefix: prefix,
    });
    if (!error && data) return data as string;
    // fall through to local on RPC error
  }
  return localSequenceNumber(prefix);
}

export async function getNextPurchaseOrderNumber(): Promise<string> {
  // POs use timestamp+device naming already; keep that but add device suffix offline-safe.
  return `PO-${Date.now()}-D${getDeviceShortId()}`;
}

function localSequenceNumber(prefix: string): string {
  const year = new Date().getFullYear();
  const device = getDeviceShortId();
  const key = `${COUNTER_KEY_PREFIX}${prefix}_${year}`;
  const next = (Number(localStorage.getItem(key)) || 0) + 1;
  localStorage.setItem(key, String(next));
  return `${prefix}-${year}-D${device}-${String(next).padStart(4, "0")}`;
}
