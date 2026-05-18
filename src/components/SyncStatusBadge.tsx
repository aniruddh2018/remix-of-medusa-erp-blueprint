/**
 * Tiny header badge showing live sync status + a "Sync now" button.
 * Hidden when the user is logged out.
 */
import { useSync } from "@/contexts/SyncContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Cloud, CloudOff, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SyncStatusBadge() {
  const { user } = useAuth();
  const { status, online, lastSync, queueSize, lastError, forceSync } = useSync();

  if (!user) return null;

  const icon = !online ? (
    <CloudOff className="h-3.5 w-3.5" />
  ) : status === "syncing" ? (
    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
  ) : status === "error" ? (
    <AlertTriangle className="h-3.5 w-3.5" />
  ) : queueSize > 0 ? (
    <Cloud className="h-3.5 w-3.5" />
  ) : (
    <CheckCircle2 className="h-3.5 w-3.5" />
  );

  const tone =
    !online
      ? "text-destructive border-destructive/40"
      : status === "error"
      ? "text-destructive border-destructive/40"
      : queueSize > 0
      ? "text-amber-600 border-amber-500/40"
      : "text-muted-foreground border-border";

  const label = !online
    ? "Offline"
    : status === "syncing"
    ? "Syncing"
    : status === "error"
    ? "Sync error"
    : queueSize > 0
    ? `${queueSize} pending`
    : "Synced";

  const tooltip = (
    <div className="space-y-0.5 text-xs">
      <div>Status: {status}</div>
      <div>Connection: {online ? "online" : "offline"}</div>
      <div>Queue: {queueSize}</div>
      <div>Last sync: {lastSync ? new Date(lastSync).toLocaleTimeString() : "never"}</div>
      {lastError && <div className="text-destructive">Error: {lastError}</div>}
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void forceSync()}
          className={cn("h-7 gap-1.5 px-2 text-xs", tone)}
        >
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
