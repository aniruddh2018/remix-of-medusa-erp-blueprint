import { useCallback, useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useUnloadGuard } from "@/hooks/useUnloadGuard";
import { parseMargDoctorMapFile, type DoctorParseResult } from "@/services/margDoctorMapParse";
import { importMargDoctorMap, type DoctorMapImportResult } from "@/services/margDoctorMapImport";

type Stage = "idle" | "parsing" | "preview" | "importing" | "done";

export function MargDoctorMapImport() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<DoctorParseResult | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<DoctorMapImportResult | null>(null);
  const [createMissing, setCreateMissing] = useState(true);
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  useUnloadGuard(stage === "importing");

  const handleFile = useCallback(async (file: File) => {
    setStage("parsing");
    setFileName(file.name);
    try {
      const res = await parseMargDoctorMapFile(file);
      setParsed(res);
      setStage("preview");
      toast({ title: "Parsed", description: `${res.stats.totalBills} bills · ${res.distinctDoctors.length} doctors` });
    } catch (err) {
      toast({ title: "Parse failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      setStage("idle");
    }
  }, [toast]);

  const handleImport = useCallback(async () => {
    if (!parsed || !companyId) return;
    setStage("importing");
    setProgress({ done: 0, total: parsed.rows.length });
    const r = await importMargDoctorMap(
      parsed.rows,
      { companyId, createMissingDoctors: createMissing, overwriteExistingDoctor: overwriteExisting },
      (done, total) => setProgress({ done, total }),
    );
    setResult(r);
    setStage("done");
    toast({ title: "Doctor mapping applied", description: `${r.billsUpdated} bills updated · ${r.doctorsCreated} doctors created` });
  }, [parsed, companyId, createMissing, overwriteExisting, toast]);

  const reset = () => { setStage("idle"); setParsed(null); setResult(null); setFileName(""); setProgress({ done: 0, total: 0 }); };

  return (
    <div className="space-y-4">
      {stage === "idle" && (
        <Card>
          <CardHeader><CardTitle>MARG Bill ↔ Doctor Mapping</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Upload the MARG <strong>Bill vs Doctor Wise Sale Analysis</strong> export. We'll create any missing
              doctors and fill the <code>doctor_id</code> / <code>doctor_name</code> on your already-imported sales
              bills by matching <strong>invoice number</strong>.
            </p>
            <label htmlFor="marg-doctor-file"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-muted/40">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="font-medium">Click to upload bill_vs_doctor_wise_sale_analysis.xls</span>
              <span className="text-xs text-muted-foreground">.xls / .xlsx</span>
              <input id="marg-doctor-file" type="file" accept=".xls,.xlsx" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
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
              <Stat label="Bills in file" value={parsed.stats.totalBills} />
              <Stat label="With doctor" value={parsed.stats.billsWithDoctor} />
              <Stat label="Without doctor" value={parsed.stats.billsWithoutDoctor} />
              <Stat label="Distinct doctors" value={parsed.distinctDoctors.length} />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={createMissing} onCheckedChange={(v) => setCreateMissing(!!v)} />
                Create doctors that don't exist yet
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={overwriteExisting} onCheckedChange={(v) => setOverwriteExisting(!!v)} />
                Overwrite doctor on bills where one is already set
              </label>
            </div>

            <div className="border rounded-md overflow-auto max-h-[30vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0"><tr className="text-left">
                  <th className="p-2">Doctor code</th><th className="p-2">Name</th><th className="p-2 text-right">Bills</th>
                </tr></thead>
                <tbody>
                  {parsed.distinctDoctors.map((d, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 font-mono">{d.code || "—"}</td>
                      <td className="p-2">{d.name || "—"}</td>
                      <td className="p-2 text-right">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={handleImport}>Apply mapping to {parsed.rows.length} bills</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "importing" && (
        <Card>
          <CardContent className="space-y-3 py-10">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Updating {progress.done.toLocaleString()} / {progress.total.toLocaleString()}…</span>
            </div>
            <div className="w-full h-2 bg-muted rounded">
              <div className="h-2 bg-primary rounded transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              Keep this tab open — you'll be warned if you try to close it. Safe to re-run: already-set bills are
              skipped unless overwrite is on.
            </p>
          </CardContent>
        </Card>
      )}

      {stage === "done" && result && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" /> Mapping applied
          </CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Doctors created" value={result.doctorsCreated} tone="success" />
              <Stat label="Doctors matched" value={result.doctorsMatchedExisting} />
              <Stat label="Bills updated" value={result.billsUpdated} tone="success" />
              <Stat label="Bills matched in DB" value={result.billsMatched} />
              <Stat label="Invoices not found" value={result.billsMissingInvoice} tone={result.billsMissingInvoice ? "error" : "muted"} />
              <Stat label="Skipped (no doctor)" value={result.billsSkippedNoDoctor} />
              <Stat label="Skipped (already set)" value={result.billsSkippedAlreadySet} />
            </div>

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
