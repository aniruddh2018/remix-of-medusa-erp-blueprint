import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { useUnloadGuard } from "@/hooks/useUnloadGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Loader2, CheckCircle2, AlertTriangle, Download, FileSpreadsheet } from "lucide-react";
import { parseMargPurchaseFile, splitPurchaseBills, type PurchaseParseResult } from "@/services/margPurchaseParse";
import { purchaseUnmatchedToCsv } from "@/services/margPurchaseImport";
import {
  runMargImport,
  resetMargImport,
  getMargImportState,
  subscribeMargImport,
  type RunnerState,
} from "@/services/margImportRunner";
import { FyImportBadge } from "@/components/data-import/FyImportBadge";

type Stage = "idle" | "parsing_original" | "upload_invoices" | "parsing_invoices" | "preview_split";

function useMargImportRunner() {
  const [state, setState] = useState<RunnerState>(getMargImportState);
  useEffect(() => {
    return subscribeMargImport(setState);
  }, []);
  return state;
}

export function MargPurchaseImport() {
  const { isSuperAdmin } = useAuth();
  const { companyId: activeCompanyId, activeFinancialYearId } = useBusiness();
  const { toast } = useToast();
  const runner = useMargImportRunner();
  const prevPhaseRef = useRef(runner.phase);

  const [stage, setStage] = useState<Stage>("idle");
  useUnloadGuard(runner.phase === "importing");
  const [originalFileName, setOriginalFileName] = useState("");
  const [invoicesFileName, setInvoicesFileName] = useState("");
  const [parsedOriginal, setParsedOriginal] = useState<PurchaseParseResult | null>(null);
  const [parsedInvoices, setParsedInvoices] = useState<PurchaseParseResult | null>(null);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [targetCompanyId, setTargetCompanyId] = useState<string>("");
  const [skipDup, setSkipDup] = useState(true);
  const [seedInv, setSeedInv] = useState(true);

  const splitPreview = useMemo(() => {
    if (!parsedOriginal || !parsedInvoices) return null;
    return splitPurchaseBills(parsedOriginal.bills, parsedInvoices.bills);
  }, [parsedOriginal, parsedInvoices]);

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

  // Toast when import transitions from importing → done/error while this component is mounted.
  useEffect(() => {
    const prev = prevPhaseRef.current;
    const curr = runner.phase;
    if (prev === "importing" && curr === "done" && runner.result) {
      toast({
        title: "Import finished",
        description: `${runner.result.billsInserted} bills · ${runner.result.itemsInserted} items · ${runner.result.batchesCreated} batches`,
      });
    }
    if (prev === "importing" && curr === "error" && runner.error) {
      toast({
        title: "Import failed",
        description: runner.error,
        variant: "destructive",
      });
    }
    prevPhaseRef.current = curr;
  }, [runner.phase, runner.result, runner.error, toast]);

  const handleOriginalFile = useCallback(async (file: File) => {
    setStage("parsing_original"); setOriginalFileName(file.name);
    try {
      const res = await parseMargPurchaseFile(file);
      setParsedOriginal(res); setStage("upload_invoices");
      toast({
        title: "Original parsed",
        description: `${res.stats.totalBills.toLocaleString()} bills · ${res.stats.totalItems.toLocaleString()} items`,
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

  const handleInvoicesFile = useCallback(async (file: File) => {
    setStage("parsing_invoices"); setInvoicesFileName(file.name);
    try {
      const res = await parseMargPurchaseFile(file);
      setParsedInvoices(res); setStage("preview_split");
      toast({
        title: "Invoices parsed",
        description: `${res.stats.totalBills.toLocaleString()} bills · ${res.stats.totalItems.toLocaleString()} items`,
      });
    } catch (err) {
      toast({
        title: "Parse failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
      setStage("upload_invoices");
    }
  }, [toast]);

  const handleImport = useCallback(async () => {
    if (!splitPreview || !targetCompanyId) {
      toast({ title: "Missing data or target company", variant: "destructive" }); return;
    }
    if (splitPreview.invoices.length === 0 && splitPreview.challans.length === 0) {
      toast({ title: "Nothing to import", description: "All bills were filtered out.", variant: "destructive" });
      return;
    }
    try {
      await runMargImport(
        parsedOriginal!.bills,
        parsedInvoices!.bills,
        {
          companyId: targetCompanyId,
          financialYearId: activeFinancialYearId,
          skipDuplicateBills: skipDup,
          seedInventory: seedInv,
        },
      );
    } catch (e) {
      toast({ title: "Import blocked", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  }, [splitPreview, targetCompanyId, parsedOriginal, parsedInvoices, activeFinancialYearId, skipDup, seedInv, toast]);

  const downloadUnmatched = () => {
    if (!runner.result) return;
    const csv = purchaseUnmatchedToCsv(runner.result.unmatchedProducts);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = "marg_purchase_unmatched_products.csv";
    a.click(); URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStage("idle");
    setParsedOriginal(null); setParsedInvoices(null);
    setOriginalFileName(""); setInvoicesFileName("");
    resetMargImport();
  };

  const renderFileUpload = (id: string, label: string, sub: string, handler: (f: File) => void) => (
    <label
      htmlFor={id}
      className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-muted/40"
    >
      <Upload className="w-8 h-8 text-muted-foreground" />
      <span className="font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
      <input
        id={id}
        type="file"
        accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handler(f); }}
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <FyImportBadge />

      {/* ── Runner-driven states (survive navigation) ── */}
      {runner.phase === "importing" && (
        <Card>
          <CardContent className="space-y-3 py-10">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>
                Importing {runner.label} — {runner.done.toLocaleString()} / {runner.total.toLocaleString()} bills…
              </span>
            </div>
            <div className="w-full h-2 bg-muted rounded">
              <div className="h-2 bg-primary rounded transition-all"
                style={{ width: `${runner.total ? (runner.done / runner.total) * 100 : 0}%` }} />
            </div>
          </CardContent>
        </Card>
      )}

      {runner.phase === "done" && runner.result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" /> Import finished
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Bills inserted" value={runner.result.billsInserted} tone="success" />
              <Stat label="Items inserted" value={runner.result.itemsInserted} tone="success" />
              <Stat label="Batches created" value={runner.result.batchesCreated} tone="success" />
              <Stat label="Batches updated" value={runner.result.batchesUpdated} />
              <Stat label="Skipped (dupes)" value={runner.result.billsSkippedDuplicate} />
              <Stat label="Failed bills" value={runner.result.billsFailed} tone={runner.result.billsFailed ? "error" : "muted"} />
              <Stat label="Suppliers added" value={runner.result.suppliersCreated} />
              <Stat label="Items skipped (no product)" value={runner.result.itemsSkippedNoProduct} tone={runner.result.itemsSkippedNoProduct ? "error" : "muted"} />
            </div>

            {runner.result.unmatchedProducts.length > 0 && (
              <Button variant="outline" onClick={downloadUnmatched}>
                <Download className="w-4 h-4 mr-1" /> Download unmatched products CSV
              </Button>
            )}

            {runner.result.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <div className="font-medium mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> First errors:
                  </div>
                  <ul className="text-xs list-disc pl-4 space-y-0.5">
                    {runner.result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <Button onClick={reset}>Import another file</Button>
          </CardContent>
        </Card>
      )}

      {runner.phase === "error" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Import failed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert variant="destructive">
              <AlertDescription>{runner.error}</AlertDescription>
            </Alert>
            <Button onClick={reset}>Try again</Button>
          </CardContent>
        </Card>
      )}

      {/* ── Local states (only when runner is idle) ── */}
      {runner.phase === "idle" && stage === "idle" && (
        <Card>
          <CardHeader><CardTitle>MARG Purchase History Importer</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This importer helps you separate <strong>invoices</strong> and <strong>challans</strong> from a MARG purchase export.
            </p>
            <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
              <li>Upload the <strong>original purchase statement</strong> (contains both invoices and challans).</li>
              <li>Upload the <strong>invoices-only</strong> export (the same bills that were invoiced).</li>
              <li>We&apos;ll subtract the invoices and leave you with two clean sets — imported as proper types.</li>
            </ol>
            {renderFileUpload("marg-purchase-original", "Upload original purchase statement", ".xls / .xlsx", handleOriginalFile)}
          </CardContent>
        </Card>
      )}

      {runner.phase === "idle" && stage === "parsing_original" && (
        <Card><CardContent className="flex items-center gap-3 py-10">
          <Loader2 className="w-5 h-5 animate-spin" /><span>Parsing original file {originalFileName}…</span>
        </CardContent></Card>
      )}

      {runner.phase === "idle" && stage === "upload_invoices" && parsedOriginal && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-green-600" />
              Original parsed: {originalFileName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Bills" value={parsedOriginal.stats.totalBills} />
              <Stat label="Items" value={parsedOriginal.stats.totalItems} />
              <Stat label="Suppliers" value={parsedOriginal.stats.distinctSuppliers} />
              <Stat label="Products" value={parsedOriginal.stats.distinctProducts} />
            </div>
            {parsedOriginal.stats.dateRange && (
              <div className="text-sm text-muted-foreground">
                Date range: <strong>{parsedOriginal.stats.dateRange.from}</strong> →{" "}
                <strong>{parsedOriginal.stats.dateRange.to}</strong>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Now upload the <strong>invoices-only</strong> file so we can subtract invoices from the original and identify challans.
            </p>
            {renderFileUpload("marg-purchase-invoices", "Upload invoices-only file", ".xls / .xlsx", handleInvoicesFile)}
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {runner.phase === "idle" && stage === "parsing_invoices" && (
        <Card><CardContent className="flex items-center gap-3 py-10">
          <Loader2 className="w-5 h-5 animate-spin" /><span>Parsing invoices file {invoicesFileName}…</span>
        </CardContent></Card>
      )}

      {runner.phase === "idle" && stage === "preview_split" && splitPreview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Split Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Original bills" value={splitPreview.stats.totalOriginalBills} />
              <Stat label="Original items" value={splitPreview.stats.totalOriginalItems} />
              <Stat label="Invoice bills" value={splitPreview.stats.invoiceBills} tone="success" />
              <Stat label="Challan bills" value={splitPreview.stats.challanBills} tone="success" />
            </div>

            {splitPreview.stats.unmatchedInvoiceBillsCount > 0 && (
              <Alert>
                <AlertDescription className="text-xs">
                  {splitPreview.stats.unmatchedInvoiceBillsCount} invoice-only bill(s) ({splitPreview.stats.unmatchedInvoiceItems} items) were <strong>not found</strong> in the original file — they will be skipped.
                </AlertDescription>
              </Alert>
            )}

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

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={skipDup} onCheckedChange={(v) => setSkipDup(!!v)} />
                Skip bills whose number already exists in this company
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={seedInv} onCheckedChange={(v) => setSeedInv(!!v)} />
                Seed inventory batches (creates / increments stock quantities from this file)
              </label>
            </div>

            <div className="border rounded-md overflow-auto max-h-[40vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">Bill #</th><th className="p-2">Date</th>
                    <th className="p-2">Supplier</th>
                    <th className="p-2 text-right">Items</th>
                    <th className="p-2">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {splitPreview.invoices.slice(0, 30).map((b) => (
                    <tr key={`inv-${b.bill_no}`} className="border-t">
                      <td className="p-2 font-mono">{b.bill_no}</td>
                      <td className="p-2">{b.bill_date}</td>
                      <td className="p-2">{b.supplier_name}</td>
                      <td className="p-2 text-right">{b.items.length}</td>
                      <td className="p-2"><span className="text-green-600 font-medium">Invoice</span></td>
                    </tr>
                  ))}
                  {splitPreview.challans.slice(0, 30).map((b) => (
                    <tr key={`chal-${b.bill_no}`} className="border-t">
                      <td className="p-2 font-mono">{b.bill_no}</td>
                      <td className="p-2">{b.bill_date}</td>
                      <td className="p-2">{b.supplier_name}</td>
                      <td className="p-2 text-right">{b.items.length}</td>
                      <td className="p-2"><span className="text-amber-600 font-medium">Challan</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(splitPreview.invoices.length + splitPreview.challans.length) > 60 && (
                <div className="p-2 text-xs text-center text-muted-foreground border-t">
                  Showing first 30 invoices and 30 challans of {(splitPreview.invoices.length + splitPreview.challans.length).toLocaleString()}.
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={handleImport} disabled={!targetCompanyId || (splitPreview.invoices.length + splitPreview.challans.length) === 0}>
                Import {splitPreview.invoices.length.toLocaleString()} invoices + {splitPreview.challans.length.toLocaleString()} challans
              </Button>
            </div>
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
