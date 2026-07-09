import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { requestUnlock } from "@/services/fy/unlock";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  financialYearId: string;
  fyLabel: string;
  onUnlocked: () => void;
}

/**
 * Shown when a user tries to write into a closed / locked FY. Staff see a hard
 * block; admins can open a timed unlock window that gets audited.
 */
export function BackdatedFyDialog({
  open, onOpenChange, financialYearId, fyLabel, onUnlocked,
}: Props) {
  const { user, roles } = useAuth();
  const { companyId } = useBusiness();
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");

  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setReason(""); setMinutes(60); } }, [open]);

  const handleUnlock = async () => {
    if (!user || !companyId) return;
    if (reason.trim().length < 4) {
      toast({ title: "Reason required", description: "Enter at least 4 characters.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await requestUnlock({
        companyId,
        financialYearId,
        reason: reason.trim(),
        approvedBy: user.id,
        minutes,
      });
      toast({ title: "FY unlocked", description: `${fyLabel} writable for ${minutes} min. Audit logged.` });
      onUnlocked();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Unlock failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Transaction belongs to a closed year</AlertDialogTitle>
          <AlertDialogDescription>
            The date you entered falls in <b>{fyLabel}</b>, which is closed or locked.
            {isAdmin
              ? " As an admin you can open a temporary unlock window. All writes during the window are audited."
              : " Ask your company owner or admin to open an unlock window for this year."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isAdmin && (
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="fy-unlock-reason">Reason</Label>
              <Input id="fy-unlock-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="GST correction, missed entry, etc." />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fy-unlock-mins">Duration (minutes)</Label>
              <Input id="fy-unlock-mins" type="number" min={5} max={480} value={minutes}
                onChange={(e) => setMinutes(Math.max(5, Math.min(480, Number(e.target.value) || 60)))} />
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {isAdmin && (
            <AlertDialogAction onClick={handleUnlock} disabled={busy}>
              {busy ? "Unlocking…" : "Unlock & retry"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
