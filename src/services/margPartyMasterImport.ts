import { supabase } from "@/integrations/supabase/client";
import { bulkSyncCustomersToLedgers, bulkSyncSuppliersToLedgers } from "@/services/ledgerBridge";
import type { ParsedParty } from "./margPartyMasterParse";

export interface PartyImportOptions {
  companyId: string;
  createMissing: boolean; // if true, insert parties not found in the target table
  overwriteFilled: boolean; // if false, only fill blank fields on existing records
}

export interface PartyImportResult {
  suppliersUpdated: number;
  suppliersCreated: number;
  customersUpdated: number;
  customersCreated: number;
  skippedOther: number;
  notFound: number; // when createMissing = false
  errors: string[];
}

type ProgressFn = (done: number, total: number) => void;

const UP = (s: string) => s.toUpperCase().trim();

function pick<T extends object>(
  existing: T,
  updates: Partial<T>,
  overwrite: boolean,
): Partial<T> {
  const rec = existing as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (v == null || v === "") continue;
    if (overwrite || rec[k] == null || rec[k] === "") out[k] = v;
  }
  return out as Partial<T>;
}

interface SupplierRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  drug_license_number: string | null;
  contact_person: string | null;
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
}

async function loadSuppliers(companyId: string): Promise<Map<string, SupplierRow>> {
  const map = new Map<string, SupplierRow>();
  let from = 0; const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id,name,phone,email,address,gst_number,drug_license_number,contact_person")
      .eq("company_id", companyId)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data) map.set(UP(r.name), r as SupplierRow);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

async function loadCustomers(companyId: string): Promise<Map<string, CustomerRow>> {
  const map = new Map<string, CustomerRow>();
  let from = 0; const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("customers")
      .select("id,name,phone,email,address,gst_number")
      .eq("company_id", companyId)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data) map.set(UP(r.name), r as CustomerRow);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

export async function importMargParties(
  parties: ParsedParty[],
  opts: PartyImportOptions,
  onProgress?: ProgressFn,
): Promise<PartyImportResult> {
  const result: PartyImportResult = {
    suppliersUpdated: 0, suppliersCreated: 0,
    customersUpdated: 0, customersCreated: 0,
    skippedOther: 0, notFound: 0, errors: [],
  };

  const [suppliers, customers] = await Promise.all([
    loadSuppliers(opts.companyId),
    loadCustomers(opts.companyId),
  ]);

  let done = 0;
  for (const p of parties) {
    try {
      if (p.kind === "supplier") {
        const key = UP(p.ledger_name);
        const existing = suppliers.get(key);
        const payload: Partial<SupplierRow> = {
          phone: p.phone,
          email: p.email,
          address: p.address,
          gst_number: p.gst_number,
          drug_license_number: p.drug_license,
          contact_person: p.contact_person,
        };
        if (existing) {
          const patch = pick(existing, payload, opts.overwriteFilled);
          if (Object.keys(patch).length > 0) {
            const { error } = await supabase.from("suppliers").update(patch).eq("id", existing.id);
            if (error) result.errors.push(`${p.ledger_name}: ${error.message}`);
            else result.suppliersUpdated++;
          }
        } else if (opts.createMissing) {
          const { data, error } = await supabase.from("suppliers")
            .insert({ company_id: opts.companyId, name: p.ledger_name, ...payload })
            .select("id,name,phone,email,address,gst_number,drug_license_number,contact_person")
            .single();
          if (error || !data) result.errors.push(`${p.ledger_name}: ${error?.message ?? "insert failed"}`);
          else { suppliers.set(key, data as SupplierRow); result.suppliersCreated++; }
        } else {
          result.notFound++;
        }
      } else if (p.kind === "customer") {
        const key = UP(p.ledger_name);
        const existing = customers.get(key);
        const payload: Partial<CustomerRow> = {
          phone: p.phone,
          email: p.email,
          address: p.address,
          gst_number: p.gst_number,
        };
        if (existing) {
          const patch = pick(existing, payload, opts.overwriteFilled);
          if (Object.keys(patch).length > 0) {
            const { error } = await supabase.from("customers").update(patch).eq("id", existing.id);
            if (error) result.errors.push(`${p.ledger_name}: ${error.message}`);
            else result.customersUpdated++;
          }
        } else if (opts.createMissing) {
          const { data, error } = await supabase.from("customers")
            .insert({ company_id: opts.companyId, name: p.ledger_name, ...payload })
            .select("id,name,phone,email,address,gst_number")
            .single();
          if (error || !data) result.errors.push(`${p.ledger_name}: ${error?.message ?? "insert failed"}`);
          else { customers.set(key, data as CustomerRow); result.customersCreated++; }
        } else {
          result.notFound++;
        }
      } else {
        result.skippedOther++;
      }
    } catch (err) {
      result.errors.push(`${p.ledger_name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    done++;
    if (done % 25 === 0) onProgress?.(done, parties.length);
  }
  onProgress?.(parties.length, parties.length);
  return result;
}
