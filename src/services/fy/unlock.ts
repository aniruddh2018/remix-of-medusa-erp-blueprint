import { supabase } from "@/integrations/supabase/client";

export interface FyUnlock {
  id: string;
  financial_year_id: string;
  reason: string;
  approved_by: string;
  opened_by: string | null;
  opened_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export async function requestUnlock(input: {
  companyId: string;
  financialYearId: string;
  reason: string;
  approvedBy: string;
  minutes: number;
}): Promise<FyUnlock> {
  const expiresAt = new Date(Date.now() + input.minutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from("financial_year_unlocks")
    .insert({
      company_id: input.companyId,
      financial_year_id: input.financialYearId,
      reason: input.reason,
      approved_by: input.approvedBy,
      opened_by: input.approvedBy,
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as FyUnlock;
}

export async function revokeUnlock(unlockId: string) {
  const { error } = await supabase
    .from("financial_year_unlocks")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", unlockId);
  if (error) throw error;
}

export async function listActiveUnlocks(companyId: string): Promise<FyUnlock[]> {
  const { data, error } = await supabase
    .from("financial_year_unlocks")
    .select("*")
    .eq("company_id", companyId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("opened_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FyUnlock[];
}
