import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { useUnloadGuard } from "@/hooks/useUnloadGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Loader2, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { parseMargStockFile, type StockParseResult } from "@/services/margStockParse";
import {
  importMargStock, stockUnmatchedToCsv,
  type StockImportResult,
} from "@/services/margStockImport";

type Stage = "idle" | "parsing" | "preview" | "importing" | "done";

export function MargStockImport() {
  const { isSuperAdmin } = useAuth();
  const { companyId: activeCompanyId } = useBusiness();
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>("idle");
  useUnloadGuard(stage === "importing");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<StockParseResult | null>(null);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [targetCompanyId, setTargetCompanyId] = useState<string>("");
  const [override, setOverride] = useState(true);
  const [updatePrices, setUpdatePrices] = useState(true);
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<StockImportResult | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) { setTargetCompanyId(activeCompanyId ?? ""); return; }
    supabase.from("companies").select("id,name").order("name").then(({ data }) => {
      setCompanies(data ?? []);
      if (!targetCompanyId && activeCompanyId) setTargetCompanyId(activeCompanyId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, activeCompanyId]);

  const handleFile = useCallback(async (file: File) => {
    setStage("parsing"); setFileName(file.name);
    try {
      const res = await parseMargStockFile(file);
      setParsed(res); setStage("preview");
      toast({ title: "Parsed", description: `${res.stats.totalRows.toLocaleString()} stock rows` });
    } catch (err) {
      toast({ title: "Parse failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      setStage("idle");
    }
  }, [toast]);

  const handleImport = useCallback(async () => {
    if (!parsed || !targetCompanyId) {
      toast({ title: "Select a target company", variant: "destructive" }); return;
    }
    setStage("importing");
    setProgress({ done: 0, total: parsed.rows.length });
    const r = await importMargStock(
      parsed.rows,
      { companyId: targetCompanyId, overrideExisting: override, updateProductPrices: updatePrices, asOfDate },
      (done, total) => setProgress({ done, total }),
    );
    setResult(r); setStage("done");
    toast({
      title: "Stock import finished",
      description: `${r.productsMatched} matched · ${r.batchesOpened} opening batches · ${r.batchesZeroed} zeroed`,
    });
  }, [parsed, targetCompanyId, override, updatePrices, asOfDate, toast]);

  const downloadUnmatched = useCallback(() => {
    if (!result) return;
    const csv = stockUnmatchedToCsv(result.unmatched);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = "marg_stock_unmatched.csv";
    a.click(); URL.revokeObjectURL(url);
  }, [result]);

  const reset = () => {
    setStage("idle"); setParsed(null); setResult(null);
    setFileName(""); setProgress({ done: 0, total: 0 });
  };

  return (
    <div className="space-y-4">
      {stage === "idle" && (
        <Card>
          <CardHeader><CardTitle>MARG Stock Importer</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Drop a MARG <strong>Stock Report</strong> export (stock_XX.xls). This runs
              <em> after</em> purchase history so it can override the seeded quantities with
              the authoritative on-hand numbers as of a chosen date.
            </p>
            <label
              htmlFor="marg-stock-file"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-muted/40"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="font-medium">Click to upload stock_XX.xls</span>
              <span className="text-xs text-muted-foreground">.xls / .xlsx</span>
              <input
                id="marg-stock-file"
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
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {fileName}
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${parsed.format === "detailed" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                {parsed.format === "detailed" ? "batch + expiry detected" : "legacy (no batch info)"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Batch rows" value={parsed.stats.totalRows} />
              <Stat label="Distinct products" value={parsed.stats.distinctProducts} />
              <Stat label="With expiry" value={parsed.stats.batchesWithExpiry} tone={parsed.stats.batchesWithExpiry ? "success" : "muted"} />
              <Stat label="Suppliers" value={parsed.stats.distinctSuppliers} />
              <Stat label="Manufacturers" value={parsed.stats.distinctManufacturers} />
              <Stat label="Stock value" value={parsed.stats.totalStockValue} />
              <Stat label="Zero-qty rows" value={parsed.stats.zeroQtyRows} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Target company</label>
              {isSuperAdmin ? (
                <Select value={targetCompanyId} onValueChange={setTargetCompanyId}>
                  <SelectTrigger className="max-w-md"><SelectValue placeholder="Choose company…" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-sm text-muted-foreground">Will import into your active company.</div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Fallback as-of date</label>
                <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="max-w-xs" />
                <p className="text-[11px] text-muted-foreground">Used only when a row has no Rec./Inv. date.</p>
              </div>
              <div className="space-y-2 pt-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={override} onCheckedChange={(v) => setOverride(!!v)} />
                  Override — zero existing batches for matched products first
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={updatePrices} onCheckedChange={(v) => setUpdatePrices(!!v)} />
                  Update product MRP / sale / purchase prices from file
                </label>
              </div>
            </div>

            <div className="border rounded-md overflow-auto max-h-[45vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">Code</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Batch</th>
                    <th className="p-2">Expiry</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">MRP</th>
                    <th className="p-2 text-right">Rate</th>
                    <th className="p-2">Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 50).map((r, i) => (
                    <tr key={`${r.code}-${i}`} className="border-t">
                      <td className="p-2 font-mono">{r.code}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2 font-mono">{r.batch_number || <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-2">{r.expiry_date || <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-2 text-right">{r.qtyRaw}</td>
                      <td className="p-2 text-right">{r.mrp.toFixed(2)}</td>
                      <td className="p-2 text-right">{r.purchase_price.toFixed(2)}</td>
                      <td className="p-2 truncate max-w-[160px]">{r.supplier_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 50 && (
                <div className="p-2 text-xs text-center text-muted-foreground border-t">
                  Showing first 50 of {parsed.rows.length.toLocaleString()}.
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={handleImport} disabled={!targetCompanyId || parsed.rows.length === 0}>
                Import {parsed.rows.length.toLocaleString()} batch rows
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
              <span>Importing {progress.done.toLocaleString()} / {progress.total.toLocaleString()} rows…</span>
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
              <Stat label="Products matched" value={result.productsMatched} tone="success" />
              <Stat label="Opening batches" value={result.batchesOpened} tone="success" />
              <Stat label="Batches zeroed" value={result.batchesZeroed} />
              <Stat label="Products updated" value={result.productsUpdated} />
              <Stat label="Unmatched" value={result.productsSkippedNoMatch} tone={result.productsSkippedNoMatch ? "error" : "muted"} />
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
