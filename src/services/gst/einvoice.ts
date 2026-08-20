// Frontend client for GST e-Invoicing (IRN) + e-Way Bill.
// All calls go through the `gst-einvoice` edge function — credentials are
// never fetched/stored on the client; only status flags are.

import { supabase } from "@/integrations/supabase/client";

export interface EInvoiceStatus {
  configured: boolean;
  mock_mode: boolean;
  env: "sandbox" | "production";
  gstin: string | null;
  api_base_url: string | null;
  is_active: boolean;
}

export interface SaveCredentialsInput {
  companyId: string;
  env: "sandbox" | "production";
  gstin: string;
  username: string;
  client_id: string;
  is_active?: boolean;
  password?: string;
  client_secret?: string;
  public_key_pem?: string;
  api_base_url?: string;
  auth_path?: string;
  generate_irn_path?: string;
  cancel_irn_path?: string;
  generate_ewb_path?: string;
  cancel_ewb_path?: string;
}

async function invoke<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("gst-einvoice", { body });
  if (error) {
    // Supabase JS surfaces the edge function's JSON error body on error.context when available.
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    if (ctx?.json) {
      try {
        const parsed = await ctx.json();
        if (parsed?.error) throw new Error(parsed.error);
      } catch { /* fall through to generic message */ }
    }
    throw error;
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as T;
}

export function getEInvoiceStatus(companyId: string): Promise<EInvoiceStatus> {
  return invoke<EInvoiceStatus>({ action: "get_status", companyId });
}

export function saveEInvoiceCredentials(input: SaveCredentialsInput): Promise<{ ok: true }> {
  return invoke({ action: "save_credentials", ...input });
}

export interface GenerateIrnResult {
  ok: true;
  mock: boolean;
  Irn: string;
  AckNo: string;
  AckDt: string;
  SignedInvoice: string;
  SignedQRCode: string;
}

export function generateIrn(salesOrderId: string, overrides?: Record<string, unknown>): Promise<GenerateIrnResult> {
  return invoke<GenerateIrnResult>({ action: "generate_irn", salesOrderId, ...overrides });
}

export function cancelIrn(salesOrderId: string, reason: string, remarks?: string): Promise<{ ok: true; mock: boolean }> {
  return invoke({ action: "cancel_irn", salesOrderId, reason, remarks });
}

export interface EwayBillInput {
  transporterId?: string;
  transporterName?: string;
  transportMode?: "1" | "2" | "3" | "4";
  vehicleNumber?: string;
  distanceKm?: number;
}

export function generateEwayBill(salesOrderId: string, input: EwayBillInput): Promise<{ ok: true; mock: boolean; EwbNo: string; EwbValidTill: string }> {
  return invoke({ action: "generate_ewaybill", salesOrderId, ...input });
}

export function cancelEwayBill(salesOrderId: string, reason: string, remarks?: string): Promise<{ ok: true; mock: boolean }> {
  return invoke({ action: "cancel_ewaybill", salesOrderId, reason, remarks });
}
