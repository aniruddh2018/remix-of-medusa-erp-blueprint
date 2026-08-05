import { useState, useEffect, useCallback } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";
import {
  previewCleanup,
  runCleanup,
  type CleanupScope,
  type CleanupPreview,
} from "@/services/margImportCleanup";

interface Props {
  scope: CleanupScope;
  label: string;
  onDone?: () => void;
}

export function RemoveImportsButton({ scope, label, onDone }: Props) {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const loadPreview = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setPreview(await previewCleanup(scope, companyId));
    } catch (e) {
      toast({
        title: "Preview failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally { setLoading(false); }
  }, [companyId, scope, toast]);

  useEffect(() => { if (open) { setConfirmText(""); loadPreview(); } }, [open, loadPreview]);

  const handleDelete = async () => {
    if (!companyId) return;
    setRunning(true);
    const res = await runCleanup(scope, companyId);
    setRunning(false);
    const total = Object.values(res.deleted).reduce((a, b) => a + b, 0);
    if (res.errors.length) {
      toast({
        title: "Cleanup blocked / errored",
        description: res.errors.slice(0, 3).join(" • "),
        variant: "destructive",
      });
    } else {
      toast({ title: "Removed", description: `Deleted ${total.toLocaleString()} rows.` });
      setOpen(false);
      onDone?.();
    }
    await loadPreview();
  };

  const blocked = (preview?.blockedBy.length ?? 0) > 0;
  const hasWarnings = (preview?.warn.length ?? 0) > 0;
  const canConfirm = confirmText.trim().toUpperCase() === "DELETE";

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-destructive hover:text-destructive">
        <Trash2 className="w-4 h-4 mr-1" /> Remove old imports
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Remove {label}
            </DialogTitle>
            <DialogDescription>
              This permanently deletes data for this company. It cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {loading || !preview ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading counts…
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(preview.counts).map(([k, v]) => (
                  <div key={k} className="border rounded p-2">
                    <div className="text-[10px] uppercase text-muted-foreground">{k.replace(/_/g, " ")}</div>
                    <div className="text-lg font-semibold">{v.toLocaleString()}</div>
                  </div>
                ))}
              </div>

              {blocked && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs space-y-1">
                    <div className="font-medium">Cannot delete — remove dependent data first:</div>
                    <ul className="list-disc pl-4">
                      {preview.blockedBy.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {hasWarnings && !blocked && (
                <Alert>
                  <AlertDescription className="text-xs space-y-1">
                    <div className="font-medium">The following will also be deleted automatically:</div>
                    <ul className="list-disc pl-4">
                      {preview.warn.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {!blocked && preview.total > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Type <span className="font-mono bg-muted px-1 rounded">DELETE</span> to confirm:
                  </label>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE"
                    autoFocus
                  />
                </div>
              )}

              {!blocked && preview.total === 0 && (
                <Alert>
                  <AlertDescription className="text-xs">Nothing to remove.</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={blocked || !canConfirm || running || !preview || preview.total === 0}
              onClick={handleDelete}
            >
              {running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
