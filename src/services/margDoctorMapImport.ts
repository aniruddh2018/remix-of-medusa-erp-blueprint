import { supabase } from "@/integrations/supabase/client";
import type { ParsedBillDoctor } from "./margDoctorMapParse";

export interface DoctorMapImportOptions {
  companyId: string;
  createMissingDoctors: boolean;
  overwriteExistingDoctor: boolean; // overwrite sales_orders.doctor_id if already set
}

export interface DoctorMapImportResult {
  doctorsCreated: number;
  doctorsMatchedExisting: number;
  billsMatched: number;
  billsUpdated: number;
  billsMissingInvoice: number;
  billsSkippedNoDoctor: number;
  billsSkippedAlreadySet: number;
  errors: string[];
}

type Progress = (done: number, total: number) => void;
const UP = (s: string) => s.toUpperCase().trim();
const KEY = (code: string | null, name: string | null) =>
  `${UP(code ?? "")}|${UP(name ?? "")}`;

interface DoctorLite { id: string; name: string; notes: string | null; }

async function loadDoctors(companyId: string): Promise<Map<string, DoctorLite>> {
  const map = new Map<string, DoctorLite>();
  const { data } = await supabase
    .from("doctors")
    .select("id,name,notes")
    .eq("company_id", companyId);
  for (const d of data ?? []) {
    map.set(UP(d.name), d as DoctorLite);
    // Also index by MARG code stored in notes if present.
    if (d.notes) {
      const m = d.notes.match(/marg_code:\s*(\S+)/i);
      if (m) map.set(`code:${UP(m[1])}`, d as DoctorLite);
    }
  }
  return map;
}

export async function importMargDoctorMap(
  rows: ParsedBillDoctor[],
  opts: DoctorMapImportOptions,
  onProgress?: Progress,
): Promise<DoctorMapImportResult> {
  const result: DoctorMapImportResult = {
    doctorsCreated: 0, doctorsMatchedExisting: 0,
    billsMatched: 0, billsUpdated: 0, billsMissingInvoice: 0,
    billsSkippedNoDoctor: 0, billsSkippedAlreadySet: 0, errors: [],
  };

  const doctorCache = await loadDoctors(opts.companyId);

  // Step 1: ensure a doctor row for every distinct (code,name) combo.
  const distinct = new Map<string, { code: string | null; name: string | null }>();
  for (const r of rows) {
    if (!r.doctor_code && !r.doctor_name) continue;
    distinct.set(KEY(r.doctor_code, r.doctor_name), { code: r.doctor_code, name: r.doctor_name });
  }

  const doctorIdByKey = new Map<string, string>();
  for (const { code, name } of distinct.values()) {
    const displayName = name || code || "Unknown";
    const byName = doctorCache.get(UP(displayName));
    const byCode = code ? doctorCache.get(`code:${UP(code)}`) : undefined;
    const hit = byName ?? byCode;
    if (hit) {
      doctorIdByKey.set(KEY(code, name), hit.id);
      result.doctorsMatchedExisting++;
      continue;
    }
    if (!opts.createMissingDoctors) continue;
    const { data, error } = await supabase.from("doctors")
      .insert({
        company_id: opts.companyId,
        name: displayName,
        notes: code ? `marg_code: ${code}` : null,
      })
      .select("id,name,notes")
      .single();
    if (error || !data) {
      result.errors.push(`doctor ${displayName}: ${error?.message ?? "insert failed"}`);
      continue;
    }
    doctorIdByKey.set(KEY(code, name), data.id);
    doctorCache.set(UP(displayName), data as DoctorLite);
    if (code) doctorCache.set(`code:${UP(code)}`, data as DoctorLite);
    result.doctorsCreated++;
  }

  // Step 2: batch-fetch matching sales_orders by invoice_number.
  const invoiceToRow = new Map<string, ParsedBillDoctor>();
  for (const r of rows) invoiceToRow.set(r.invoice_number, r);

  const invoices = [...invoiceToRow.keys()];
  const existing = new Map<string, { id: string; doctor_id: string | null }>();
  const CHUNK = 500;
  for (let i = 0; i < invoices.length; i += CHUNK) {
    const slice = invoices.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("sales_orders")
      .select("id,invoice_number,doctor_id")
      .eq("company_id", opts.companyId)
      .in("invoice_number", slice);
    if (error) {
      result.errors.push(`fetch sales_orders: ${error.message}`);
      continue;
    }
    for (const so of data ?? []) {
      existing.set(so.invoice_number, { id: so.id, doctor_id: so.doctor_id });
    }
    onProgress?.(Math.min(i + CHUNK, invoices.length), invoices.length + rows.length);
  }

  // Step 3: update each bill.
  let done = invoices.length;
  const total = invoices.length + rows.length;
  for (const r of rows) {
    const so = existing.get(r.invoice_number);
    if (!so) { result.billsMissingInvoice++; done++; continue; }
    result.billsMatched++;

    if (!r.doctor_code && !r.doctor_name) { result.billsSkippedNoDoctor++; done++; continue; }
    if (so.doctor_id && !opts.overwriteExistingDoctor) {
      result.billsSkippedAlreadySet++; done++; continue;
    }
    const doctorId = doctorIdByKey.get(KEY(r.doctor_code, r.doctor_name));
    const doctorName = r.doctor_name || r.doctor_code || null;
    const update: { doctor_id?: string | null; doctor_name?: string | null } = {
      doctor_name: doctorName,
    };
    if (doctorId) update.doctor_id = doctorId;

    const { error } = await supabase.from("sales_orders").update(update).eq("id", so.id);
    if (error) result.errors.push(`${r.invoice_number}: ${error.message}`);
    else result.billsUpdated++;

    done++;
    if (done % 50 === 0) onProgress?.(done, total);
  }
  onProgress?.(total, total);
  return result;
}
