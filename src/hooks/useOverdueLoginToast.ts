import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOverdueInvoices } from "@/hooks/useOverdueInvoices";
import { toast } from "sonner";

const SESSION_FLAG = "overdue_toast_shown_session";

/**
 * Shows a one-time toast on app load (per browser session) when there are
 * overdue credit invoices. Company-isolated through RLS in useOverdueInvoices.
 */
export function useOverdueLoginToast() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: overdue, isLoading } = useOverdueInvoices();

  useEffect(() => {
    if (!user || isLoading) return;
    if (!overdue || overdue.length === 0) return;
    if (sessionStorage.getItem(SESSION_FLAG)) return;

    sessionStorage.setItem(SESSION_FLAG, "1");
    const total = overdue.reduce((s, o) => s + (Number(o.total_amount) - Number(o.amount_paid || 0)), 0);

    toast.warning(`${overdue.length} overdue credit invoice${overdue.length > 1 ? "s" : ""}`, {
      description: `Total outstanding: ₹${total.toFixed(2)}`,
      duration: 8000,
      action: {
        label: "View",
        onClick: () => navigate("/sales"),
      },
    });
  }, [user, isLoading, overdue, navigate]);
}
