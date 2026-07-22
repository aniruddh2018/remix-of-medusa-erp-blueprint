import { useCallback, useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { useUnloadGuard } from "@/hooks/useUnloadGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Loader2, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import {
  parseMargLedgerBalanceFile,
  type LedgerBalanceParseResult,
} from "@/services/margLedgerBalanceParse";
import {
  importMargLedgerBalances,
  ledgerBalanceUnmatchedToCsv,
  type LedgerBalanceImportResult,
} from "@/services/margLedgerBalanceImport";
import { FyImportBadge } from "@/components/data-import/FyImportBadge";

type Stage = "idle" | "parsing" | "preview" | "importing" | "done";

export function MargLedgerBalanceImport() {
  const { companyId, activeFinancialYearId, activeFinancialYear } = useBusiness();
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>("idle");
  useUnloadGuard(stage === "importing");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<LedgerBalanceParseResult | null>(null);
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reconcile, setReconcile] = useState(true);
  const [createMissing, setCreateMissing] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<LedgerBalanceImportResult | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setStage("parsing"); setFileName(file.name);
    try {
      const res = await parseMargLedgerBalanceFile(file);
      setParsed(res); setStage("preview");
      toast({ title: "Parsed", description: `${res.stats.totalRows} ledger rows` });
    } catch (err) {
      toast({ title: "Parse failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      setStage("idle");
    }
  }, [toast]);

  const handleImport = useCallback(async () => {
    if (!parsed || !companyId) return;
    if (!activeFinancialYearId) {
      toast({ title: "Select a financial year first", variant: "destructive" });
      return;
    }
    setStage("importing");
    setProgress({ done: 0, total: parsed.rows.length });
    const r = await importMargLedgerBalances(
      parsed.rows,
      {
        companyId,
        financialYearId: activeFinancialYearId,
        asOfDate,
        reconcileAgainstFy: reconcile,
        createMissingLedgers: createMissing,
      },
      (done, total) => setProgress({ done, total }),
    );
    setResult(r); setStage("done");
    toast({
      title: "Ledger openings imported",
      description: `${r.ledgersCreated} new · ${r.ledgersMatched} matched · ${r.openingsInserted + r.openingsUpdated} openings posted`,
    });
  }, [parsed, companyId, activeFinancialYearId, asOfDate, reconcile, createMissing, toast]);

  const downloadUnmatched = useCallback(() => {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([ledgerBalanceUnmatchedToCsv(result.unmatched)], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url; a.download = "marg_ledger_openings_unmatched.csv";
    a.click(); URL.revokeObjectURL(url);
  }, [result]);

  const reset = () => {
    setStage("idle"); setParsed(null); setResult(null);
    setFileName(""); setProgress({ done: 0, total: 0 });
  };

  return (
    <div className="space-y-4">
      <FyImportBadge requireActive />
      {stage === "idle" && (
        <Card>
          <CardHeader><CardTitle>MARG Ledger Openings Importer</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Drop the MARG <strong>Ledger Accounts</strong> trial balance
              (columns: LEDGER, GROUP, OPENING, DEBIT, CREDIT, BALANCE).
              Balances that don't match current-FY sales/purchase are posted
              as <strong>opening balances</strong> for the active financial year —
              same principle as opening stock.
            </p>
            <label
              htmlFor="marg-ledger-file"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-muted/40"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="font-medium">Click to upload ledger_XX.xls</span>
              <span className="text-xs text-muted-foreground">.xls / .xlsx</span>
              <input
                id="marg-ledger-file"
                type="file"
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </label>
          </CardContent>
        </Card>
      )}

      {stage === "parsing" && (
        <Card><CardContent className="flex items-center gap-3 py-10">
          <Loader2 className="w-5 h-5 animate-spin" /><span>Parsing {fileName}…</span>
        </CardContent></Card>
      )}

      {stage === "preview" && parsed && (
        <Card>
          <CardHeader><CardTitle className="text-base">{fileName}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Ledger rows" value={parsed.stats.totalRows} />
              <Stat label="Non-zero" value={parsed.stats.nonZeroRows} />
              <Stat label="Groups" value={parsed.stats.distinctGroups} />
              <Stat label="Total DR" value={parsed.stats.totalDebit} />
              <Stat label="Total CR" value={parsed.stats.totalCredit} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">As-of date (MARG export date)</label>
                <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="max-w-xs" />
                <p className="text-[11px] text-muted-foreground">
                  Movement already posted in this FY up to this date is subtracted
                  from the balance to derive the true opening.
                </p>
              </div>
              <div className="space-y-2 pt-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={reconcile} onCheckedChange={(v) => setReconcile(!!v)} />
                  Reconcile against current-FY entries (recommended)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={createMissing} onCheckedChange={(v) => setCreateMissing(!!v)} />
                  Create missing ledgers automatically
                </label>
              </div>
            </div>

            <div className="border rounded-md overflow-auto max-h-[45vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">Ledger</th>
                    <th className="p-2">Group</th>
                    <th className="p-2 text-right">Balance</th>
                    <th className="p-2 text-right">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 100).map((r, i) => (
                    <tr key={`${r.serial}-${i}`} className="border-t">
                      <td className="p-2">{r.ledgerName}</td>
                      <td className="p-2 text-muted-foreground">{r.groupName}</td>
                      <td className="p-2 text-right font-mono">{r.balance.toLocaleString()}</td>
                      <td className="p-2 text-right">
                        {r.balance === 0 ? <span className="text-muted-foreground">—</span>
                          : r.balance > 0 ? <span className="text-green-600">DR</span>
                          : <span className="text-red-600">CR</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 100 && (
                <div className="p-2 text-xs text-center text-muted-foreground border-t">
                  Showing first 100 of {parsed.rows.length.toLocaleString()}.
                </div>
              )}
            </div>

            {(fyBlocked || !activeFinancialYearId) && (
              <Alert variant="destructive">
                <AlertDescription>
                  {!activeFinancialYearId
                    ? "Select a financial year in the top bar before importing openings."
                    : "This financial year is locked. Switch to the active (current) FY to post openings."}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2 sticky bottom-0 bg-background pt-2 border-t">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button
                size="lg"
                onClick={handleImport}
                disabled={parsed.rows.length === 0}
              >
                <Upload className="w-4 h-4 mr-2" />
                Import openings ({parsed.rows.length.toLocaleString()})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "importing" && (
        <Card>
          <CardContent className="space-y-3 py-10">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Posting {progress.done.toLocaleString()} / {progress.total.toLocaleString()} openings…</span>
            </div>
            <div className="w-full h-2 bg-muted rounded">
              <div className="h-2 bg-primary rounded transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "done" && result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" /> Import finished
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Groups created" value={result.groupsCreated} tone={result.groupsCreated ? "success" : "muted"} />
              <Stat label="Ledgers created" value={result.ledgersCreated} tone="success" />
              <Stat label="Ledgers matched" value={result.ledgersMatched} />
              <Stat label="Openings inserted" value={result.openingsInserted} tone="success" />
              <Stat label="Openings updated" value={result.openingsUpdated} />
              <Stat label="Matched (skipped)" value={result.skippedMatched} />
              <Stat label="Zero balance" value={result.skippedZero} />
              <Stat label="Unmatched" value={result.unmatched.length} tone={result.unmatched.length ? "error" : "muted"} />
              <Stat label="Errors" value={result.errors.length} tone={result.errors.length ? "error" : "muted"} />
            </div>

            {result.unmatched.length > 0 && (
              <Button variant="outline" onClick={downloadUnmatched}>
                <Download className="w-4 h-4 mr-1" /> Download unmatched CSV
              </Button>
            )}

            {result.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <div className="font-medium mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> First errors:
                  </div>
                  <ul className="text-xs list-disc pl-4 space-y-0.5">
                    {result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <Button onClick={reset}>Import another file</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "muted" }: { label: string; value: number; tone?: "success" | "error" | "muted" }) {
  const color = tone === "success" ? "text-green-600" : tone === "error" ? "text-destructive" : "text-foreground";
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}
