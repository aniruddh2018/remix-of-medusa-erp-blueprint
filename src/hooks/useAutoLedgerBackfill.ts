/**
 * useAutoLedgerBackfill
 *
 * On login (per company, per browser/session), silently runs the
 * `backfill_company_ledger_entries` RPC so that legacy sales/purchases/
 * payments that pre-date the unified ledger system get posted as journal
 * vouchers and reflected in ledger balances.
 *
 * Guards:
 *   - Only runs when an authenticated user + resolved companyId exist.
 *   - Runs at most once per company per browser (localStorage flag).
 *   - Failures are swallowed (toast only) so login UX is never blocked.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "@/hooks/use-toast";

const FLAG_PREFIX = "ledger_backfill_done:";
// Bump this when the backfill RPC's logic changes so all clients re-run once.
const BACKFILL_VERSION = "v1";

export function useAutoLedgerBackfill() {
  const { user } = useAuth();
  const { companyId } = useBusiness();
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !companyId) return;

    const flagKey = `${FLAG_PREFIX}${companyId}:${BACKFILL_VERSION}`;
    if (localStorage.getItem(flagKey) === "1") return;

    // Prevent duplicate runs in StrictMode / re-renders.
    if (startedRef.current === companyId) return;
    startedRef.current = companyId;

    (async () => {
      try {
        const { data, error } = await supabase.rpc(
          "backfill_company_ledger_entries",
          { p_company_id: companyId },
        );
        if (error) throw error;

        localStorage.setItem(flagKey, "1");

        // Notify only when something actually got posted.
        const result = (data ?? {}) as {
          ledgers_created?: number;
          vouchers_posted?: number;
        };
        const posted =
          (result.ledgers_created ?? 0) + (result.vouchers_posted ?? 0);
        if (posted > 0) {
          toast({
            title: "Ledgers synced",
            description: `Imported ${result.ledgers_created ?? 0} parties and posted ${result.vouchers_posted ?? 0} historical vouchers.`,
          });
        }
      } catch (e) {
        console.warn("[AutoLedgerBackfill] failed:", e);
        // Do NOT set the flag — let it retry next login.
      }
    })();
  }, [user, companyId, offlineMode]);
}
