import { supabase } from '@/integrations/supabase/client';
import type {
  JournalVoucher,
  JournalVoucherLine,
  LedgerTransaction,
} from '@/types/ledger';

function fromDbVoucher(row: Record<string, unknown>): JournalVoucher {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    date: row.date as string,
    referenceType: row.reference_type as JournalVoucher['referenceType'],
    referenceId: row.reference_id as string | null,
    referenceNumber: row.reference_number as string | null,
    narration: row.narration as string,
    totalAmount: Number(row.total_amount ?? 0),
    createdBy: row.created_by as string | null,
    createdAt: row.created_at as string,
  };
}

function fromDbLine(row: Record<string, unknown>): JournalVoucherLine {
  return {
    id: row.id as string,
    voucherId: row.voucher_id as string,
    ledgerId: row.ledger_id as string,
    companyId: row.company_id as string,
    debitAmount: Number(row.debit_amount ?? 0),
    creditAmount: Number(row.credit_amount ?? 0),
    narration: row.narration as string,
    createdAt: row.created_at as string,
  };
}

function fromDbTransaction(row: Record<string, unknown>): LedgerTransaction {
  return {
    date: row.date as string,
    refType: row.ref_type as string,
    refNumber: row.ref_number as string | null,
    narration: row.narration as string,
    debit: Number(row.debit ?? 0),
    credit: Number(row.credit ?? 0),
    runningBalance: Number(row.running_balance ?? 0),
    voucherId: row.voucher_id as string,
  };
}

export async function getVouchers(
  companyId: string,
  filters?: { referenceType?: string; fromDate?: string; toDate?: string; limit?: number; offset?: number },
): Promise<JournalVoucher[]> {
  let query = supabase
    .from('journal_vouchers')
    .select('*')
    .eq('company_id', companyId)
    .order('date', { ascending: false });

  if (filters?.referenceType) query = query.eq('reference_type', filters.referenceType);
  if (filters?.fromDate) query = query.gte('date', filters.fromDate);
  if (filters?.toDate) query = query.lte('date', filters.toDate);
  if (filters?.limit) query = query.limit(filters.limit);
  if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch vouchers: ${error.message}`);
  return (data ?? []).map(fromDbVoucher);
}

export async function getVoucherById(voucherId: string): Promise<JournalVoucher | null> {
  const { data, error } = await supabase
    .from('journal_vouchers')
    .select('*')
    .eq('id', voucherId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to fetch voucher: ${error.message}`);
  }
  return data ? fromDbVoucher(data) : null;
}

export async function getVoucherLines(voucherId: string): Promise<JournalVoucherLine[]> {
  const { data, error } = await supabase
    .from('journal_voucher_lines')
    .select('*')
    .eq('voucher_id', voucherId);
  if (error) throw new Error(`Failed to fetch voucher lines: ${error.message}`);
  return (data ?? []).map(fromDbLine);
}

export async function getLedgerTransactions(
  ledgerId: string,
  year?: string,
  limit = 100,
  offset = 0,
): Promise<LedgerTransaction[]> {
  const { data, error } = await supabase.rpc('get_ledger_transactions', {
    p_ledger_id: ledgerId,
    p_year: year ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(`Failed to fetch ledger transactions: ${error.message}`);
  return (data ?? []).map(fromDbTransaction);
}

export async function createManualVoucher(
  companyId: string,
  input: {
    date: string;
    narration: string;
    lines: { ledgerId: string; debitAmount: number; creditAmount: number; narration?: string }[];
    createdBy?: string;
  },
): Promise<JournalVoucher> {
  const totalAmount = input.lines.reduce((s, l) => s + l.debitAmount, 0);

  const { data: voucher, error: vError } = await supabase
    .from('journal_vouchers')
    .insert({
      company_id: companyId,
      date: input.date,
      reference_type: 'adjustment',
      narration: input.narration,
      total_amount: totalAmount,
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single();
  if (vError) throw new Error(`Failed to create voucher: ${vError.message}`);

  const lines = input.lines.map(l => ({
    voucher_id: voucher.id,
    ledger_id: l.ledgerId,
    company_id: companyId,
    debit_amount: l.debitAmount,
    credit_amount: l.creditAmount,
    narration: l.narration || '',
  }));

  const { error: lError } = await supabase.from('journal_voucher_lines').insert(lines);
  if (lError) throw new Error(`Failed to create voucher lines: ${lError.message}`);

  return fromDbVoucher(voucher);
}

export async function deleteVoucher(voucherId: string): Promise<void> {
  const { error } = await supabase.from('journal_vouchers').delete().eq('id', voucherId);
  if (error) throw new Error(`Failed to delete voucher: ${error.message}`);
}
