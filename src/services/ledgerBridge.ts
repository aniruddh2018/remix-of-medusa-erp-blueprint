// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';
import * as ledgerService from '@/services/ledgerService';
import type { LedgerRoleType } from '@/types/ledger';

interface CustomerRow {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gst_number?: string | null;
  notes?: string | null;
  company_id: string;
}

interface SupplierRow {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  gst_number?: string | null;
  contact_person?: string | null;
  drug_license_number?: string | null;
  address?: string | null;
  state?: string | null;
  is_active?: boolean;
  company_id: string;
}

export async function syncCustomerToLedger(customer: CustomerRow, companyId: string): Promise<void> {
  if (!companyId || companyId !== customer.company_id) return;

  const { data: existing } = await supabase
    .from('ledger_roles')
    .select('ledger_id')
    .eq('company_id', companyId)
    .eq('role_type', 'customer')
    .limit(1);

  const existingLedgerIds = new Set((existing ?? []).map(r => r.ledger_id as string));

  const { data: matchingLedger } = await supabase
    .from('ledgers')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('name', customer.name)
    .limit(1);

  if (matchingLedger && matchingLedger.length > 0) {
    const ledgerId = matchingLedger[0].id;
    await ledgerService.addLedgerRole(ledgerId, companyId, 'customer', !existingLedgerIds.has(ledgerId)).catch(() => {});

    await supabase.from('ledgers').update({
      gst_number: customer.gst_number || null,
      phone: customer.phone || null,
      email: customer.email || null,
      import_metadata: { legacy_customer_id: customer.id, notes: customer.notes },
    }).eq('id', ledgerId).eq('company_id', companyId);
  } else {
    try {
      const ledger = await ledgerService.createLedger(companyId, {
        name: customer.name,
        phone: customer.phone || undefined,
        email: customer.email || undefined,
        gstNumber: customer.gst_number || undefined,
        address: customer.address ? { line1: customer.address } : undefined,
        roles: ['customer'],
        primaryRole: 'customer',
        sourceSystem: 'manual',
      });

      await supabase.from('ledgers').update({
        import_metadata: { legacy_customer_id: customer.id, notes: customer.notes },
      }).eq('id', ledger.id);
    } catch (err) {
      console.warn('[ledgerBridge] Failed to sync customer to ledger:', err);
    }
  }
}

export async function syncSupplierToLedger(supplier: SupplierRow, companyId: string): Promise<void> {
  if (!companyId || companyId !== supplier.company_id) return;

  const { data: matchingLedger } = await supabase
    .from('ledgers')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('name', supplier.name)
    .limit(1);

  if (matchingLedger && matchingLedger.length > 0) {
    const ledgerId = matchingLedger[0].id;
    await ledgerService.addLedgerRole(ledgerId, companyId, 'supplier').catch(() => {});

    await supabase.from('ledgers').update({
      gst_number: supplier.gst_number || null,
      phone: supplier.phone || null,
      email: supplier.email || null,
      contact_person: supplier.contact_person || null,
      state: supplier.state || null,
      import_metadata: {
        legacy_supplier_id: supplier.id,
        drug_license_number: supplier.drug_license_number,
      },
    }).eq('id', ledgerId).eq('company_id', companyId);
  } else {
    try {
      const ledger = await ledgerService.createLedger(companyId, {
        name: supplier.name,
        phone: supplier.phone || undefined,
        email: supplier.email || undefined,
        gstNumber: supplier.gst_number || undefined,
        contactPerson: supplier.contact_person || undefined,
        state: supplier.state || undefined,
        address: supplier.address ? { line1: supplier.address } : undefined,
        roles: ['supplier'],
        primaryRole: 'supplier',
        sourceSystem: 'manual',
      });

      await supabase.from('ledgers').update({
        import_metadata: {
          legacy_supplier_id: supplier.id,
          drug_license_number: supplier.drug_license_number,
        },
      }).eq('id', ledger.id);
    } catch (err) {
      console.warn('[ledgerBridge] Failed to sync supplier to ledger:', err);
    }
  }
}

export async function syncLedgerToCustomer(ledgerId: string, companyId: string): Promise<void> {
  const { data: ledger } = await supabase
    .from('ledgers')
    .select('*')
    .eq('id', ledgerId)
    .eq('company_id', companyId)
    .single();
  if (!ledger) return;

  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('company_id', companyId)
    .eq('name', ledger.name)
    .limit(1);

  const meta = ledger.import_metadata as Record<string, unknown> | null;
  const notes = (meta?.notes as string) || null;

  if (existing && existing.length > 0) {
    await supabase.from('customers').update({
      phone: ledger.phone || null,
      email: ledger.email || null,
      address: (ledger.address as Record<string, unknown>)?.line1 as string || null,
      gst_number: ledger.gst_number || null,
      notes,
    }).eq('id', existing[0].id).eq('company_id', companyId);
  } else {
    await supabase.from('customers').insert({
      name: ledger.name,
      phone: ledger.phone || null,
      email: ledger.email || null,
      address: (ledger.address as Record<string, unknown>)?.line1 as string || null,
      gst_number: ledger.gst_number || null,
      notes,
      company_id: companyId,
    }).select().single().catch(() => {});
  }
}

export async function syncLedgerToSupplier(ledgerId: string, companyId: string): Promise<void> {
  const { data: ledger } = await supabase
    .from('ledgers')
    .select('*')
    .eq('id', ledgerId)
    .eq('company_id', companyId)
    .single();
  if (!ledger) return;

  const { data: existing } = await supabase
    .from('suppliers')
    .select('id')
    .eq('company_id', companyId)
    .eq('name', ledger.name)
    .limit(1);

  const meta = ledger.import_metadata as Record<string, unknown> | null;
  const drugLicense = (meta?.drug_license_number as string) || null;

  if (existing && existing.length > 0) {
    await supabase.from('suppliers').update({
      phone: ledger.phone || null,
      email: ledger.email || null,
      contact_person: ledger.contact_person || null,
      gst_number: ledger.gst_number || null,
      drug_license_number: drugLicense,
      address: (ledger.address as Record<string, unknown>)?.line1 as string || null,
      state: ledger.state || null,
    }).eq('id', existing[0].id).eq('company_id', companyId);
  } else {
    await supabase.from('suppliers').insert({
      name: ledger.name,
      phone: ledger.phone || null,
      email: ledger.email || null,
      contact_person: ledger.contact_person || null,
      gst_number: ledger.gst_number || null,
      drug_license_number: drugLicense,
      address: (ledger.address as Record<string, unknown>)?.line1 as string || null,
      state: ledger.state || null,
      company_id: companyId,
    }).select().single().catch(() => {});
  }
}

export async function bulkSyncCustomersToLedgers(companyId: string): Promise<{ synced: number; errors: number }> {
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('company_id', companyId);

  if (!customers || customers.length === 0) return { synced: 0, errors: 0 };

  let synced = 0;
  let errors = 0;

  for (const c of customers) {
    try {
      await syncCustomerToLedger(c, companyId);
      synced++;
    } catch {
      errors++;
    }
  }

  return { synced, errors };
}

export async function bulkSyncSuppliersToLedgers(companyId: string): Promise<{ synced: number; errors: number }> {
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('*')
    .eq('company_id', companyId);

  if (!suppliers || suppliers.length === 0) return { synced: 0, errors: 0 };

  let synced = 0;
  let errors = 0;

  for (const s of suppliers) {
    try {
      await syncSupplierToLedger(s, companyId);
      synced++;
    } catch {
      errors++;
    }
  }

  return { synced, errors };
}
