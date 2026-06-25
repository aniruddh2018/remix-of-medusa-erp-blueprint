import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Loader2, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { parseMargSalesFile, type ParseResult } from "@/services/margSalesParse";
import {
  importMargSales, unmatchedToCsv,
  type SalesImportResult,
} from "@/services/margSalesImport";

type Stage = "idle" | "parsing" | "preview" | "importing" | "done";

export function MargSalesImport() {
  const { isSuperAdmin } = useAuth();
  const { companyId: activeCompanyId } = useBusiness();
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [targetCompanyId, setTargetCompanyId] = useState<string>("");
  const [skipDup, setSkipDup] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<SalesImportResult | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) {
      setTargetCompanyId(activeCompanyId ?? "");
      return;
    }
    supabase.from("companies").select("id,name").order("name").then(({ data }) => {
      setCompanies(data ?? []);
      if (!targetCompanyId && activeCompanyId) setTargetCompanyId(activeCompanyId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, activeCompanyId]);

  const handleFile = useCallback(async (file: File) => {
    setStage("parsing");
    setFileName(file.name);
    try {
      const res = await parseMargSalesFile(file);
      setParsed(res);
      setStage("preview");
      toast({
        title: "Parsed",
        description: `${res.stats.totalBills.toLocaleString()} bills, ${res.stats.totalItems.toLocaleString()} items`,
      });
    } catch (err) {
      toast({
        title: "Parse failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      setStage("idle");
    }
  }, [toast]);

  const handleImport = useCallback(async () => {
    if (!parsed || !targetCompanyId) {
      toast({ title: "Select a target company", variant: "destructive" });
      return;
    }
    setStage("importing");
    setProgress({ done: 0, total: parsed.bills.length });
    const r = await importMargSales(
      parsed.bills,
      { companyId: targetCompanyId, skipDuplicateInvoices: skipDup },
      (done, total) => setProgress({ done, total }),
    );
    setResult(r);
    setStage("done");
    toast({
      title: "Sales import finished",
      description: `${r.billsInserted} bills · ${r.itemsInserted} items`,
    });
  }, [parsed, targetCompanyId, skipDup, toast]);

  const downloadUnmatched = useCallback(() => {
    if (!result) return;
    const csv = unmatchedToCsv(result.unmatchedProducts);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "marg_sales_unmatched_products.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const reset = () => {
    setStage("idle");
    setParsed(null);
    setResult(null);
    setFileName("");
    setProgress({ done: 0, total: 0 });
  };

  return (
    <div className="space-y-4">
      {stage === "idle" && (
        <Card>
          <CardHeader>
            <CardTitle>MARG Sales History Importer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Drop a MARG <strong>Bill Wise Sales Statement</strong> export
              (REPORT_7.XLS). We'll parse every invoice, match items to your
              product master and post legacy sales orders to the selected
              company.
            </p>
            <label
              htmlFor="marg-sales-file"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-muted/40"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="font-medium">Click to upload REPORT_7.XLS</span>
              <span className="text-xs text-muted-foreground">.xls / .xlsx</span>
              <input
                id="marg-sales-file"
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
        <Card>
          <CardContent className="flex items-center gap-3 py-10">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Parsing {fileName}…</span>
          </CardContent>
        </Card>
      )}

      {stage === "preview" && parsed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{fileName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Bills" value={parsed.stats.totalBills} />
              <Stat label="Items" value={parsed.stats.totalItems} />
              <Stat label="Customers" value={parsed.stats.distinctCustomers} />
              <Stat label="Products" value={parsed.stats.distinctProducts} />
            </div>
            {parsed.stats.dateRange && (
              <div className="text-sm text-muted-foreground">
                Date range: <strong>{parsed.stats.dateRange.from}</strong> →{" "}
                <strong>{parsed.stats.dateRange.to}</strong>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Target company</label>
              {isSuperAdmin ? (
                <Select value={targetCompanyId} onValueChange={setTargetCompanyId}>
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="Choose company…" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-sm text-muted-foreground">Will import into your active company.</div>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={skipDup} onCheckedChange={(v) => setSkipDup(!!v)} />
              Skip invoices whose number already exists in this company
            </label>

            <div className="border rounded-md overflow-auto max-h-[40vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">Bill #</th>
                    <th className="p-2">Date</th>
                    <th className="p-2">Customer</th>
                    <th className="p-2">Mode</th>
                    <th className="p-2 text-right">Items</th>
                    <th className="p-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.bills.slice(0, 50).map((b) => (
                    <tr key={b.invoice_number} className="border-t">
                      <td className="p-2 font-mono">{b.invoice_number}</td>
                      <td className="p-2">{b.bill_date}</td>
                      <td className="p-2">{b.customer_name}{b.customer_phone ? ` · ${b.customer_phone}` : ""}</td>
                      <td className="p-2 capitalize">{b.payment_mode}</td>
                      <td className="p-2 text-right">{b.items.length}</td>
                      <td className="p-2 text-right">{b.bill_value.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.bills.length > 50 && (
                <div className="p-2 text-xs text-center text-muted-foreground border-t">
                  Showing first 50 of {parsed.bills.length.toLocaleString()}.
                </div>
              )}
            </div>

            {parsed.warnings.length > 0 && (
              <Alert>
                <AlertDescription className="text-xs">
                  {parsed.warnings.length} parser warning(s). First few:
                  <ul className="list-disc pl-4 mt-1">
                    {parsed.warnings.slice(0, 3).map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={handleImport} disabled={!targetCompanyId || parsed.bills.length === 0}>
                Import {parsed.bills.length.toLocaleString()} bills
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
                Importing {progress.done.toLocaleString()} / {progress.total.toLocaleString()} bills…
              </span>
            </div>
            <div className="w-full h-2 bg-muted rounded">
              <div
                className="h-2 bg-primary rounded transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
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
              <Stat label="Bills inserted" value={result.billsInserted} tone="success" />
              <Stat label="Items inserted" value={result.itemsInserted} tone="success" />
              <Stat label="Skipped (dupes)" value={result.billsSkippedDuplicate} />
              <Stat label="Failed bills" value={result.billsFailed} tone={result.billsFailed ? "error" : "muted"} />
              <Stat label="Customers added" value={result.customersCreated} />
              <Stat label="Items skipped (no product)" value={result.itemsSkippedNoProduct} tone={result.itemsSkippedNoProduct ? "error" : "muted"} />
              <Stat label="Distinct unmatched" value={result.unmatchedProducts.length} />
            </div>

            {result.unmatchedProducts.length > 0 && (
              <Button variant="outline" onClick={downloadUnmatched}>
                <Download className="w-4 h-4 mr-1" /> Download unmatched products CSV
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

function Stat({
  label, value, tone = "muted",
}: { label: string; value: number; tone?: "success" | "error" | "muted" }) {
  const color = tone === "success" ? "text-green-600" : tone === "error" ? "text-destructive" : "text-foreground";
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}
