import { useCallback, useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useUnloadGuard } from "@/hooks/useUnloadGuard";
import { parseMargPartyMasterFile, type PartyParseResult } from "@/services/margPartyMasterParse";
import { importMargParties, type PartyImportResult } from "@/services/margPartyMasterImport";

type Stage = "idle" | "parsing" | "preview" | "importing" | "done";

export function MargPartyMasterImport() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<PartyParseResult | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<PartyImportResult | null>(null);
  const [createMissing, setCreateMissing] = useState(true);
  const [overwriteFilled, setOverwriteFilled] = useState(false);

  useUnloadGuard(stage === "importing");

  const handleFile = useCallback(async (file: File) => {
    setStage("parsing");
    setFileName(file.name);
    try {
      const res = await parseMargPartyMasterFile(file);
      setParsed(res);
      setStage("preview");
      toast({ title: "Parsed", description: `${res.stats.total} parties` });
    } catch (err) {
      toast({ title: "Parse failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      setStage("idle");
    }
  }, [toast]);

  const handleImport = useCallback(async () => {
    if (!parsed || !companyId) return;
    setStage("importing");
    setProgress({ done: 0, total: parsed.parties.length });
    const r = await importMargParties(
      parsed.parties,
      { companyId, createMissing, overwriteFilled },
      (done, total) => setProgress({ done, total }),
    );
    setResult(r);
    setStage("done");
    toast({
      title: "Party master imported",
      description: `${r.suppliersUpdated + r.suppliersCreated} suppliers · ${r.customersUpdated + r.customersCreated} customers`,
    });
  }, [parsed, companyId, createMissing, overwriteFilled, toast]);

  const reset = () => { setStage("idle"); setParsed(null); setResult(null); setFileName(""); setProgress({ done: 0, total: 0 }); };

  return (
    <div className="space-y-4">
      {stage === "idle" && (
        <Card>
          <CardHeader><CardTitle>MARG Party Master (Contacts)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Upload a MARG <strong>Party Master</strong> export (e.g. <code>partymst_XX.xls</code>). We'll fill in
              phone, email, address, GSTIN, PAN, drug licence, and contact person on your existing suppliers/customers
              (matched by name). Optionally create missing parties.
            </p>
            <label htmlFor="marg-party-file"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-muted/40">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="font-medium">Click to upload partymst_XX.xls</span>
              <span className="text-xs text-muted-foreground">.xls / .xlsx</span>
              <input id="marg-party-file" type="file" accept=".xls,.xlsx" className="hidden"
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
              <Stat label="Total parties" value={parsed.stats.total} />
              <Stat label="Suppliers" value={parsed.stats.suppliers} />
              <Stat label="Customers" value={parsed.stats.customers} />
              <Stat label="Other ledgers" value={parsed.stats.others} />
              <Stat label="With phone" value={parsed.stats.withPhone} />
              <Stat label="With GSTIN" value={parsed.stats.withGst} />
              <Stat label="With email" value={parsed.stats.withEmail} />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={createMissing} onCheckedChange={(v) => setCreateMissing(!!v)} />
                Create parties that don't exist yet
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={overwriteFilled} onCheckedChange={(v) => setOverwriteFilled(!!v)} />
                Overwrite fields that are already filled (default: only fill blanks)
              </label>
            </div>

            <div className="border rounded-md overflow-auto max-h-[40vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0"><tr className="text-left">
                  <th className="p-2">Ledger</th><th className="p-2">Kind</th>
                  <th className="p-2">Phone</th><th className="p-2">Email</th>
                  <th className="p-2">GSTIN</th><th className="p-2">Licence</th>
                </tr></thead>
                <tbody>
                  {parsed.parties.slice(0, 50).map((p, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">{p.ledger_name}</td>
                      <td className="p-2 capitalize">{p.kind}</td>
                      <td className="p-2">{p.phone ?? "—"}</td>
                      <td className="p-2">{p.email ?? "—"}</td>
                      <td className="p-2 font-mono">{p.gst_number ?? "—"}</td>
                      <td className="p-2">{p.drug_license ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={handleImport}>Import {parsed.parties.length} parties</Button>
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
              Keep this tab open — you'll be warned if you try to close it.
            </p>
          </CardContent>
        </Card>
      )}

      {stage === "done" && result && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" /> Party master imported
          </CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Suppliers updated" value={result.suppliersUpdated} tone="success" />
              <Stat label="Suppliers created" value={result.suppliersCreated} tone="success" />
              <Stat label="Customers updated" value={result.customersUpdated} tone="success" />
              <Stat label="Customers created" value={result.customersCreated} tone="success" />
              <Stat label="Other ledgers skipped" value={result.skippedOther} />
              <Stat label="Not found" value={result.notFound} />
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
