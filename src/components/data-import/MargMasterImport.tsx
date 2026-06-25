import { useCallback, useEffect, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  importMargMasterRows,
  type MargMasterImportResult,
  type MargMasterRow,
} from "@/services/margMasterImport";

type Stage = "idle" | "parsing" | "preview" | "importing" | "done";

const REQUIRED_COLS = ["mrp"]; // name comes from clean_name OR original_name
const EXPECTED_COLS = [
  "clean_name",
  "original_name",
  "manufacturer",
  "composition",
  "form",
  "strength",
  "base_unit",
  "secondary_unit",
  "conversion",
  "mrp",
  "rate",
  "gst_percent",
];

export function MargMasterImport() {
  const { isSuperAdmin } = useAuth();
  const { companyId: activeCompanyId } = useBusiness();
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<MargMasterRow[]>([]);
  const [missingCols, setMissingCols] = useState<string[]>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [targetCompanyId, setTargetCompanyId] = useState<string>("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<MargMasterImportResult | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) {
      setTargetCompanyId(activeCompanyId ?? "");
      return;
    }
    supabase
      .from("companies")
      .select("id,name")
      .order("name")
      .then(({ data }) => {
        setCompanies(data ?? []);
        if (!targetCompanyId && activeCompanyId) setTargetCompanyId(activeCompanyId);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, activeCompanyId]);

  const handleFile = useCallback(
    (file: File) => {
      setStage("parsing");
      setFileName(file.name);
      Papa.parse<MargMasterRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const headers = (res.meta.fields ?? []).map((h) => h.trim().toLowerCase());
          const missing = REQUIRED_COLS.filter((c) => !headers.includes(c));
          setMissingCols(missing);
          setRows(res.data);
          setStage("preview");
          toast({
            title: "Parsed",
            description: `${res.data.length.toLocaleString()} rows loaded`,
          });
        },
        error: (err) => {
          toast({ title: "Parse failed", description: err.message, variant: "destructive" });
          setStage("idle");
        },
      });
    },
    [toast],
  );

  const handleImport = useCallback(async () => {
    if (!targetCompanyId) {
      toast({ title: "Select a target company", variant: "destructive" });
      return;
    }
    setStage("importing");
    setProgress({ done: 0, total: rows.length });
    const r = await importMargMasterRows(rows, targetCompanyId, (done, total) =>
      setProgress({ done, total }),
    );
    setResult(r);
    setStage("done");
    toast({
      title: "Import finished",
      description: `${r.inserted} added, ${r.skipped} skipped, ${r.failed} failed`,
    });
  }, [rows, targetCompanyId, toast]);

  const reset = () => {
    setStage("idle");
    setRows([]);
    setResult(null);
    setFileName("");
    setMissingCols([]);
    setProgress({ done: 0, total: 0 });
  };

  return (
    <div className="space-y-4">
      {stage === "idle" && (
        <Card>
          <CardHeader>
            <CardTitle>MARG Master CSV Importer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload the merged MARG master CSV (columns:{" "}
              <code className="text-xs">{EXPECTED_COLS.join(", ")}</code>).
              <br />
              Conversion is read as <strong>1 secondary_unit = conversion × base_unit</strong> — e.g.{" "}
              base <code>TAB</code> + secondary <code>STRIP</code> + conversion <code>10</code> means{" "}
              <strong>1 STRIP = 10 TAB</strong>.
            </p>

            <label
              htmlFor="marg-master-file"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-muted/40"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="font-medium">Click to upload CSV</span>
              <span className="text-xs text-muted-foreground">UTF-8 CSV, no row limit</span>
              <input
                id="marg-master-file"
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </CardContent>
        </Card>
      )}

      {stage === "parsing" && (
        <Card>
          <CardContent className="flex items-center gap-3 py-10">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Parsing {fileName}…</span>
          </CardContent>
        </Card>
      )}

      {stage === "preview" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{fileName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm">
              <strong>{rows.length.toLocaleString()}</strong> rows ready ·{" "}
              <span className="text-muted-foreground">
                duplicates (same name + strength + manufacturer) will be skipped automatically
              </span>
            </div>

            {missingCols.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  Missing required columns: {missingCols.join(", ")}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Target company</label>
              {isSuperAdmin ? (
                <Select value={targetCompanyId} onValueChange={setTargetCompanyId}>
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="Choose company to import into…" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Will import into your active company.
                </div>
              )}
            </div>

            <div className="border rounded-md overflow-auto max-h-[50vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">Name</th>
                    <th className="p-2">Manufacturer</th>
                    <th className="p-2">Composition</th>
                    <th className="p-2">Form</th>
                    <th className="p-2">Strength</th>
                    <th className="p-2">Conversion</th>
                    <th className="p-2 text-right">MRP</th>
                    <th className="p-2 text-right">Rate</th>
                    <th className="p-2 text-right">GST%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.clean_name || r.original_name}</td>
                      <td className="p-2">{r.manufacturer}</td>
                      <td className="p-2 truncate max-w-[200px]">{r.composition}</td>
                      <td className="p-2">{r.form}</td>
                      <td className="p-2">{r.strength}</td>
                      <td className="p-2 whitespace-nowrap text-muted-foreground">
                        {r.conversion && r.secondary_unit && r.base_unit
                          ? `1 ${r.secondary_unit} = ${r.conversion} ${r.base_unit}`
                          : "—"}
                      </td>
                      <td className="p-2 text-right">{r.mrp}</td>
                      <td className="p-2 text-right">{r.rate}</td>
                      <td className="p-2 text-right">{r.gst_percent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 100 && (
                <div className="p-2 text-xs text-center text-muted-foreground border-t">
                  Showing first 100 of {rows.length.toLocaleString()}.
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!targetCompanyId || missingCols.length > 0 || rows.length === 0}
              >
                Import {rows.length.toLocaleString()} rows
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
              <span>
                Importing {progress.done.toLocaleString()} / {progress.total.toLocaleString()}…
              </span>
            </div>
            <div className="w-full h-2 bg-muted rounded">
              <div
                className="h-2 bg-primary rounded transition-all"
                style={{
                  width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                }}
              />
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
              <Stat label="Inserted" value={result.inserted} tone="success" />
              <Stat label="Skipped (dupes)" value={result.skipped} tone="muted" />
              <Stat label="Failed" value={result.failed} tone={result.failed ? "error" : "muted"} />
              <Stat label="Conversions" value={result.conversionsInserted} tone="muted" />
            </div>
            {result.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <div className="font-medium mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> First errors:
                  </div>
                  <ul className="text-xs list-disc pl-4 space-y-0.5">
                    {result.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "error" | "muted";
}) {
  const color =
    tone === "success" ? "text-green-600" : tone === "error" ? "text-destructive" : "text-foreground";
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}
