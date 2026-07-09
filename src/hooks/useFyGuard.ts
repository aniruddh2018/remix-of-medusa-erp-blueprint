import { useCallback, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  assertWritableFy,
  FinancialYearLockedError,
  FinancialYearNotFoundError,
} from "@/services/fy/resolver";
import { toast } from "@/hooks/use-toast";

/**
 * Reusable guard for any write path with a transaction date. Handles FY
 * resolution + writability + surface a BackdatedFyDialog for admins.
 *
 * Usage:
 *   const { ensureWritable, dialogProps } = useFyGuard();
 *   const fyId = await ensureWritable(saleDate);
 *   if (!fyId) return; // user blocked or must unlock first
 *   // ...proceed to save
 *   <BackdatedFyDialog {...dialogProps} />
 */
export function useFyGuard() {
  const { user } = useAuth();
  const { companyId, financialYears } = useBusiness();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingFyId, setPendingFyId] = useState<string | null>(null);
  const [pendingRetry, setPendingRetry] = useState<null | (() => void)>(null);

  const ensureWritable = useCallback(
    async (txDate: string, opts?: { onUnlocked?: () => void }): Promise<string | null> => {
      if (!user || !companyId) {
        toast({ title: "Not ready", description: "Sign in and select a company first.", variant: "destructive" });
        return null;
      }
      try {
        return await assertWritableFy(companyId, txDate, user.id);
      } catch (e) {
        if (e instanceof FinancialYearNotFoundError) {
          toast({
            title: "No Financial Year",
            description: `No FY covers ${txDate}. Create one in Settings → Financial Year.`,
            variant: "destructive",
          });
          return null;
        }
        if (e instanceof FinancialYearLockedError) {
          setPendingFyId(e.fyId);
          setPendingRetry(() => opts?.onUnlocked ?? null);
          setDialogOpen(true);
          return null;
        }
        toast({ title: "FY check failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
        return null;
      }
    },
    [user, companyId],
  );

  const fyLabel = pendingFyId
    ? (financialYears.find((y) => y.id === pendingFyId)?.name ?? "this year")
    : "this year";

  return {
    ensureWritable,
    dialogProps: {
      open: dialogOpen,
      onOpenChange: setDialogOpen,
      financialYearId: pendingFyId ?? "",
      fyLabel,
      onUnlocked: () => { pendingRetry?.(); },
    },
  };
}
