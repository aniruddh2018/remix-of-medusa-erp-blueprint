import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { format } from "date-fns";

export interface OverdueInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_phone: string | null;
  total_amount: number;
  amount_paid: number;
  due_date: string;
  payment_status: string;
  reminder_enabled: boolean;
}

export function useOverdueInvoices() {
  const { companyId, activeFinancialYearId } = useBusiness();
  const today = format(new Date(), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["overdue-invoices", companyId, today, activeFinancialYearId],
    queryFn: async (): Promise<OverdueInvoice[]> => {
      if (!companyId) return [];
      let q = supabase
        .from("sales_orders")
        .select("id, invoice_number, customer_name, customer_phone, total_amount, amount_paid, due_date, payment_status, reminder_enabled")
        .eq("company_id", companyId)
        .in("payment_status", ["partial", "credit"])
        .not("due_date", "is", null)
        .lte("due_date", today);
      if (activeFinancialYearId) q = q.eq("financial_year_id", activeFinancialYearId);
      const { data, error } = await q.order("due_date", { ascending: true });
      if (error) throw error;
      return (data || []) as OverdueInvoice[];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
}
