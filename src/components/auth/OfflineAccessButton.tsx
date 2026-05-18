/**
 * Header button to enable offline access (PIN setup).
 * Shows only after the user has a live session; hides once a PIN is configured.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldPlus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { OfflinePinSetup } from "./OfflinePinSetup";
import type { CachedSession } from "@/offline/auth/offlineSession";

export function OfflineAccessButton() {
  const { user, roles, hasPin, refreshPinStatus, offlineMode } = useAuth();
  const { companyId } = useBusiness();
  const [open, setOpen] = useState(false);

  if (!user || offlineMode) return null;

  const session: CachedSession = {
    user_id: user.id,
    email: user.email ?? "",
    full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    company_id: companyId ?? null,
    roles,
    cached_at: Date.now(),
    ttl_ms: 30 * 24 * 60 * 60 * 1000,
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(true)}
              className="text-muted-foreground hover:text-foreground hidden sm:flex"
              aria-label={hasPin ? "Offline access enabled" : "Enable offline access"}
            >
              {hasPin
                ? <ShieldCheck className="h-4 w-4 text-primary" />
                : <ShieldPlus className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {hasPin ? "Update offline PIN" : "Enable offline access (PIN)"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <OfflinePinSetup
        open={open}
        onOpenChange={setOpen}
        session={session}
        onConfigured={refreshPinStatus}
      />
    </>
  );
}
