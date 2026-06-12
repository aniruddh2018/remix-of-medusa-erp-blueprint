import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/contexts/BusinessContext";
import { runRecovery, type RecoveryResult } from "@/services/offlineRecovery";
import { LifeBuoy, Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export function OfflineRecoverySection() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [result, setResult] = useState<RecoveryResult | null>(null);

  const handleFile = async (file: File) => {
    if (!companyId) {
      toast({ title: "No company", description: "Sign in with a company before restoring.", variant: "destructive" });
      return;
    }
    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: 1, current: "Parsing file…" });
    try {
      const res = await runRecovery(file, {
        companyId,
        onProgress: (done, total, current) => setProgress({ done, total, current }),
      });
      setResult(res);
      toast({
        title: "Recovery complete",
        description: `Restored ${res.totalInserted} of ${res.totalAttempted} rows across ${res.tables.length} tables.`,
      });
    } catch (e) {
      toast({
        title: "Recovery failed",
        description: e instanceof Error ? e.message : "Could not parse file.",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <LifeBuoy className="h-5 w-5 text-primary" />
          Offline Recovery
        </CardTitle>
        <CardDescription>
          Restore data from a backup .sql file or a legacy offline export .json file.
          Rows are upserted into your current company — existing records with the same id are updated.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept=".json,.sql,application/json,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => inputRef.current?.click()} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {running ? "Restoring…" : "Upload recovery file"}
          </Button>
          <span className="text-xs text-muted-foreground">Supports .json (legacy offline dump) and .sql (backup export).</span>
        </div>

        {progress && running && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.current}</span>
              <span>{progress.done}/{progress.total}</span>
            </div>
            <Progress value={pct} />
          </div>
        )}

        {result && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Restored {result.totalInserted} of {result.totalAttempted} rows
              <Badge variant="outline" className="ml-auto text-[10px] uppercase">{result.source}</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
              {result.tables.map((t) => (
                <div key={t.table} className="flex justify-between">
                  <span className="text-muted-foreground">{t.table}</span>
                  <span className={`font-mono ${t.errors.length ? "text-destructive" : ""}`}>
                    {t.inserted}/{t.attempted}
                  </span>
                </div>
              ))}
            </div>
            {result.tables.some((t) => t.errors.length > 0) && (
              <div className="text-xs text-destructive space-y-1 pt-1">
                <div className="flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>Some rows failed. First errors:</span>
                </div>
                <ul className="pl-5 list-disc space-y-0.5 font-mono text-[11px]">
                  {result.tables
                    .filter((t) => t.errors.length > 0)
                    .slice(0, 5)
                    .map((t) => (
                      <li key={t.table}>
                        <span className="font-semibold">{t.table}:</span> {t.errors[0]}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
