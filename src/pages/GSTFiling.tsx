import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileSpreadsheet, FileJson, FileText, Printer, AlertTriangle, ReceiptText, FileDown, TrendingUp, ShoppingCart, BarChart3 } from "lucide-react";
import { monthlyPeriod, quarterlyPeriod, currentFinancialYearStart } from "@/services/gst/period";
import { buildGSTR1, buildGSTR3B, buildPurchaseRegister, buildHSNSummary } from "@/services/gst/builders";
import {
  exportGSTR1CSV, exportGSTR1Excel, exportGSTR1JSON, exportGSTR1PDF,
  exportGSTR3BCSV, exportGSTR3BExcel, exportGSTR3BJSON, exportGSTR3BPDF,
  exportPurchaseRegisterCSV, exportPurchaseRegisterExcel, exportPurchaseRegisterPDF,
  exportHSNCSV, exportHSNExcel, exportHSNPDF,
} from "@/services/gst/exporters";
import { stateName } from "@/services/gst/stateCodes";
import { useNavigate } from "react-router-dom";
import type { GSTPeriod, CompanyGstInfo } from "@/services/gst/types";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function GSTFiling() {
  const { companyId, gstInclusive } = useBusiness();
  const navigate = useNavigate();
  const [periodType, setPeriodType] = useState<"monthly" | "quarterly">("monthly");
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [fyStart, setFyStart] = useState<number>(currentFinancialYearStart());
  const [quarter, setQuarter] = useState<number>(Math.floor(now.getMonth() / 3) + 1);

  const period: GSTPeriod = useMemo(
    () => periodType === "monthly" ? monthlyPeriod(year, month) : quarterlyPeriod(fyStart, quarter),
    [periodType, year, month, fyStart, quarter]
  );

  const { data: company } = useQuery({
    queryKey: ["gst-company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("name, legal_name, gst_number, state_code, state_name, address").eq("id", companyId!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const companyInfo: CompanyGstInfo | null = useMemo(() => {
    if (!company) return null;
    const stateCode = company.state_code || (company.gst_number ? company.gst_number.substring(0, 2) : "");
    return {
      gstin: company.gst_number || "",
      legal_name: company.legal_name || company.name || "",
      state_code: stateCode || "",
      state_name: company.state_name || stateName(stateCode),
    };
  }, [company]);

  const ready = !!companyId && !!companyInfo && !!companyInfo.gstin;

  const opts = ready ? { companyId: companyId!, period, company: companyInfo!, gstInclusive } : null;

  const { data: gstr1, isLoading: l1 } = useQuery({
    queryKey: ["gstr1", companyId, period.from, period.to, gstInclusive],
    queryFn: () => buildGSTR1(opts!),
    enabled: !!opts,
  });
  const { data: gstr3b, isLoading: l3 } = useQuery({
    queryKey: ["gstr3b", companyId, period.from, period.to, gstInclusive],
    queryFn: () => buildGSTR3B(opts!),
    enabled: !!opts,
  });
  const { data: pr, isLoading: lp } = useQuery({
    queryKey: ["purchase-register", companyId, period.from, period.to, gstInclusive],
    queryFn: () => buildPurchaseRegister(opts!),
    enabled: !!opts,
  });
  const { data: hsn, isLoading: lh } = useQuery({
    queryKey: ["hsn-summary", companyId, period.from, period.to, gstInclusive],
    queryFn: () => buildHSNSummary(opts!),
    enabled: !!opts,
  });

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
  const fyYears = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() - 2];

  return (
    <div className="space-y-4">
      <PageHeader
        title="GST Filing"
        description="Filing-ready GSTR-1, GSTR-3B, Purchase Register and HSN Summary"
      />

      {!ready && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>GST setup required</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>Add your company GSTIN and state code in Settings before generating filing reports.</p>
            <Button size="sm" variant="outline" onClick={() => navigate("/settings")}>Open Settings</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Period selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Filing Period</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Type</label>
            <Select value={periodType} onValueChange={(v: "monthly" | "quarterly") => setPeriodType(v)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly (QRMP)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodType === "monthly" ? (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Month</label>
                <Select value={String(month)} onValueChange={(v) => setMonth(+v)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Year</label>
                <Select value={String(year)} onValueChange={(v) => setYear(+v)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Quarter</label>
                <Select value={String(quarter)} onValueChange={(v) => setQuarter(+v)}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Q1 (Apr–Jun)</SelectItem>
                    <SelectItem value="2">Q2 (Jul–Sep)</SelectItem>
                    <SelectItem value="3">Q3 (Oct–Dec)</SelectItem>
                    <SelectItem value="4">Q4 (Jan–Mar)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Financial Year</label>
                <Select value={String(fyStart)} onValueChange={(v) => setFyStart(+v)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>{fyYears.map((y) => <SelectItem key={y} value={String(y)}>FY {y}-{String(y + 1).slice(-2)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="ml-auto text-right">
            <div className="text-xs text-muted-foreground">Selected Period</div>
            <div className="font-mono font-semibold text-lg">{period.label}</div>
            <div className="text-xs text-muted-foreground">{period.from} → {period.to}</div>
          </div>
        </CardContent>
      </Card>

      {ready && companyInfo && (
        <Card className="bg-muted/30">
          <CardContent className="py-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div><span className="text-muted-foreground">GSTIN:</span> <span className="font-mono font-semibold">{companyInfo.gstin}</span></div>
            <div><span className="text-muted-foreground">Legal Name:</span> <strong>{companyInfo.legal_name}</strong></div>
            <div><span className="text-muted-foreground">State:</span> {companyInfo.state_code} — {companyInfo.state_name}</div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="gstr1">
        <TabsList>
          <TabsTrigger value="gstr1" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" />GSTR-1</TabsTrigger>
          <TabsTrigger value="gstr3b" className="gap-1.5"><FileText className="h-3.5 w-3.5" />GSTR-3B</TabsTrigger>
          <TabsTrigger value="purchase" className="gap-1.5"><ShoppingCart className="h-3.5 w-3.5" />Purchase Register</TabsTrigger>
          <TabsTrigger value="hsn" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />HSN Summary</TabsTrigger>
        </TabsList>

        {/* ──────────── GSTR-1 ──────────── */}
        <TabsContent value="gstr1" className="space-y-4 mt-4">
          <ExportBar
            loading={l1}
            onCSV={() => gstr1 && exportGSTR1CSV(gstr1)}
            onExcel={() => gstr1 && exportGSTR1Excel(gstr1)}
            onJSON={() => gstr1 && exportGSTR1JSON(gstr1)}
            onPDF={() => gstr1 && exportGSTR1PDF(gstr1)}
          />
          {l1 ? <LoadingCard label="Building GSTR-1..." /> : gstr1 && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatTile label="Total Invoices" value={String(gstr1.totals.invoice_count)} />
                <StatTile label="Taxable Value" value={`₹${gstr1.totals.taxable.toFixed(2)}`} />
                <StatTile label="IGST" value={`₹${gstr1.totals.igst.toFixed(2)}`} />
                <StatTile label="CGST+SGST" value={`₹${(gstr1.totals.cgst + gstr1.totals.sgst).toFixed(2)}`} />
                <StatTile label="Invoice Value" value={`₹${gstr1.totals.invoice_value.toFixed(2)}`} highlight />
              </div>

              <SectionCard title={`B2B — Registered Customers (${gstr1.b2b.length})`}>
                <Table>
                  <TableHeader><TableRow><TableHead>GSTIN</TableHead><TableHead>Receiver</TableHead><TableHead>Invoice #</TableHead><TableHead>Date</TableHead><TableHead>POS</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">Tax</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {gstr1.b2b.slice(0, 50).map((inv, i) => {
                      const tx = inv.items.reduce((s, it) => s + it.taxable, 0);
                      const tax = inv.items.reduce((s, it) => s + it.igst + it.cgst + it.sgst, 0);
                      return <TableRow key={i}><TableCell className="font-mono text-xs">{inv.party_gstin}</TableCell><TableCell>{inv.party_name}</TableCell><TableCell className="font-mono">{inv.doc_no}</TableCell><TableCell>{inv.doc_date}</TableCell><TableCell>{inv.pos}</TableCell><TableCell className="text-right font-mono">₹{tx.toFixed(2)}</TableCell><TableCell className="text-right font-mono">₹{tax.toFixed(2)}</TableCell><TableCell className="text-right font-mono">₹{inv.doc_value.toFixed(2)}</TableCell></TableRow>;
                    })}
                    {gstr1.b2b.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No B2B invoices in this period</TableCell></TableRow>}
                  </TableBody>
                </Table>
                {gstr1.b2b.length > 50 && <p className="text-xs text-muted-foreground px-3 py-2">Showing first 50 of {gstr1.b2b.length} — export for full list.</p>}
              </SectionCard>

              <SectionCard title={`B2CS — Consumer (Rate-wise summary)`}>
                <Table>
                  <TableHeader><TableRow><TableHead>POS</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">IGST</TableHead><TableHead className="text-right">CGST</TableHead><TableHead className="text-right">SGST</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {gstr1.b2cs.map((b, i) => <TableRow key={i}><TableCell>{b.pos}</TableCell><TableCell><Badge variant="secondary">{b.is_interstate ? "Inter" : "Intra"}</Badge></TableCell><TableCell className="text-right">{b.rate}%</TableCell><TableCell className="text-right font-mono">₹{b.taxable.toFixed(2)}</TableCell><TableCell className="text-right font-mono">₹{b.igst.toFixed(2)}</TableCell><TableCell className="text-right font-mono">₹{b.cgst.toFixed(2)}</TableCell><TableCell className="text-right font-mono">₹{b.sgst.toFixed(2)}</TableCell></TableRow>)}
                    {gstr1.b2cs.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No B2C supplies</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </SectionCard>

              <SectionCard title={`HSN Summary (Table 12) — ${gstr1.hsn.length} rows`}>
                <Table>
                  <TableHeader><TableRow><TableHead>HSN</TableHead><TableHead>Description</TableHead><TableHead>UQC</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">Tax</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {gstr1.hsn.slice(0, 100).map((h, i) => <TableRow key={i}><TableCell className="font-mono">{h.hsn}</TableCell><TableCell className="max-w-xs truncate">{h.description}</TableCell><TableCell>{h.uqc}</TableCell><TableCell className="text-right">{h.qty}</TableCell><TableCell className="text-right">{h.rate}%</TableCell><TableCell className="text-right font-mono">₹{h.taxable.toFixed(2)}</TableCell><TableCell className="text-right font-mono">₹{(h.igst + h.cgst + h.sgst).toFixed(2)}</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </SectionCard>
            </div>
          )}
        </TabsContent>

        {/* ──────────── GSTR-3B ──────────── */}
        <TabsContent value="gstr3b" className="space-y-4 mt-4">
          <ExportBar
            loading={l3}
            onCSV={() => gstr3b && exportGSTR3BCSV(gstr3b)}
            onExcel={() => gstr3b && exportGSTR3BExcel(gstr3b)}
            onJSON={() => gstr3b && exportGSTR3BJSON(gstr3b)}
            onPDF={() => gstr3b && exportGSTR3BPDF(gstr3b)}
          />
          {l3 ? <LoadingCard label="Building GSTR-3B..." /> : gstr3b && (
            <div className="grid gap-4">
              <SectionCard title="3.1 Outward supplies and inward supplies (reverse charge)">
                <Table>
                  <TableHeader><TableRow><TableHead>Nature</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">IGST</TableHead><TableHead className="text-right">CGST</TableHead><TableHead className="text-right">SGST</TableHead><TableHead className="text-right">Cess</TableHead></TableRow></TableHeader>
                  <TableBody>
                    <TableRow><TableCell>(a) Outward taxable (other than zero/nil/exempt)</TableCell>
                      <TableCell className="text-right font-mono">₹{gstr3b.outward.taxable.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">₹{gstr3b.outward.igst.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">₹{gstr3b.outward.cgst.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">₹{gstr3b.outward.sgst.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">₹{gstr3b.outward.cess.toFixed(2)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </SectionCard>
              <SectionCard title="4. Eligible Input Tax Credit">
                <Table>
                  <TableHeader><TableRow><TableHead>Details</TableHead><TableHead className="text-right">IGST</TableHead><TableHead className="text-right">CGST</TableHead><TableHead className="text-right">SGST</TableHead><TableHead className="text-right">Cess</TableHead></TableRow></TableHeader>
                  <TableBody>
                    <TableRow><TableCell>(A)(5) All other ITC</TableCell>
                      <TableCell className="text-right font-mono">₹{gstr3b.itc.igst.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">₹{gstr3b.itc.cgst.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">₹{gstr3b.itc.sgst.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">₹{gstr3b.itc.cess.toFixed(2)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </SectionCard>
              <SectionCard title="6.1 Payment of Tax (computed)">
                <Table>
                  <TableHeader><TableRow><TableHead>Tax</TableHead><TableHead className="text-right">Payable</TableHead><TableHead className="text-right">Through ITC</TableHead><TableHead className="text-right">In Cash</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(["igst","cgst","sgst"] as const).map((k) => (
                      <TableRow key={k}>
                        <TableCell className="uppercase font-semibold">{k}</TableCell>
                        <TableCell className="text-right font-mono">₹{gstr3b.outward[k].toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">₹{Math.min(gstr3b.outward[k], gstr3b.itc[k]).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold text-destructive">₹{gstr3b.net_payable[k].toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SectionCard>
            </div>
          )}
        </TabsContent>

        {/* ──────────── Purchase Register ──────────── */}
        <TabsContent value="purchase" className="space-y-4 mt-4">
          <ExportBar
            loading={lp}
            onCSV={() => pr && exportPurchaseRegisterCSV(pr)}
            onExcel={() => pr && exportPurchaseRegisterExcel(pr)}
            onPDF={() => pr && exportPurchaseRegisterPDF(pr)}
          />
          {lp ? <LoadingCard label="Building Purchase Register..." /> : pr && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatTile label="Invoices" value={String(pr.totals.invoice_count)} />
                <StatTile label="Taxable Value" value={`₹${pr.totals.taxable.toFixed(2)}`} />
                <StatTile label="IGST (ITC)" value={`₹${pr.totals.igst.toFixed(2)}`} />
                <StatTile label="CGST+SGST (ITC)" value={`₹${(pr.totals.cgst + pr.totals.sgst).toFixed(2)}`} />
                <StatTile label="Total Value" value={`₹${pr.totals.invoice_value.toFixed(2)}`} highlight />
              </div>
              <SectionCard title="Rate-wise ITC">
                <Table>
                  <TableHeader><TableRow><TableHead>Rate</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">IGST</TableHead><TableHead className="text-right">CGST</TableHead><TableHead className="text-right">SGST</TableHead><TableHead className="text-right">Invoices</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {pr.byRate.map((b, i) => <TableRow key={i}><TableCell>{b.rate}%</TableCell><TableCell className="text-right font-mono">₹{b.taxable.toFixed(2)}</TableCell><TableCell className="text-right font-mono">₹{b.igst.toFixed(2)}</TableCell><TableCell className="text-right font-mono">₹{b.cgst.toFixed(2)}</TableCell><TableCell className="text-right font-mono">₹{b.sgst.toFixed(2)}</TableCell><TableCell className="text-right">{b.count}</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </SectionCard>
              <SectionCard title={`Invoices (${pr.invoices.length})`}>
                <Table>
                  <TableHeader><TableRow><TableHead>Supplier GSTIN</TableHead><TableHead>Supplier</TableHead><TableHead>Invoice #</TableHead><TableHead>Date</TableHead><TableHead>POS</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {pr.invoices.slice(0, 50).map((inv, i) => <TableRow key={i}><TableCell className="font-mono text-xs">{inv.party_gstin || "—"}</TableCell><TableCell>{inv.party_name}</TableCell><TableCell className="font-mono">{inv.doc_no}</TableCell><TableCell>{inv.doc_date}</TableCell><TableCell>{inv.pos}</TableCell><TableCell className="text-right font-mono">₹{inv.doc_value.toFixed(2)}</TableCell></TableRow>)}
                  </TableBody>
                </Table>
                {pr.invoices.length > 50 && <p className="text-xs text-muted-foreground px-3 py-2">Showing first 50 of {pr.invoices.length} — export for full list.</p>}
              </SectionCard>
            </div>
          )}
        </TabsContent>

        {/* ──────────── HSN Summary ──────────── */}
        <TabsContent value="hsn" className="space-y-4 mt-4">
          <ExportBar
            loading={lh}
            onCSV={() => hsn && exportHSNCSV(hsn)}
            onExcel={() => hsn && exportHSNExcel(hsn)}
            onPDF={() => hsn && exportHSNPDF(hsn)}
          />
          {lh ? <LoadingCard label="Building HSN Summary..." /> : hsn && (
            <div className="grid gap-4">
              <SectionCard title={`Outward HSN — ${hsn.outward.length} rows`}>
                <Table>
                  <TableHeader><TableRow><TableHead>HSN</TableHead><TableHead>Description</TableHead><TableHead>UQC</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">Total Tax</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {hsn.outward.slice(0, 100).map((h, i) => <TableRow key={i}><TableCell className="font-mono">{h.hsn}</TableCell><TableCell className="max-w-xs truncate">{h.description}</TableCell><TableCell>{h.uqc}</TableCell><TableCell className="text-right">{h.qty}</TableCell><TableCell className="text-right">{h.rate}%</TableCell><TableCell className="text-right font-mono">₹{h.taxable.toFixed(2)}</TableCell><TableCell className="text-right font-mono">₹{(h.igst + h.cgst + h.sgst).toFixed(2)}</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </SectionCard>
              <SectionCard title={`Inward HSN — ${hsn.inward.length} rows`}>
                <Table>
                  <TableHeader><TableRow><TableHead>HSN</TableHead><TableHead>Description</TableHead><TableHead>UQC</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Taxable</TableHead><TableHead className="text-right">Total Tax</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {hsn.inward.slice(0, 100).map((h, i) => <TableRow key={i}><TableCell className="font-mono">{h.hsn}</TableCell><TableCell className="max-w-xs truncate">{h.description}</TableCell><TableCell>{h.uqc}</TableCell><TableCell className="text-right">{h.qty}</TableCell><TableCell className="text-right">{h.rate}%</TableCell><TableCell className="text-right font-mono">₹{h.taxable.toFixed(2)}</TableCell><TableCell className="text-right font-mono">₹{(h.igst + h.cgst + h.sgst).toFixed(2)}</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </SectionCard>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExportBar({ loading, onCSV, onExcel, onJSON, onPDF }: { loading?: boolean; onCSV?: () => void; onExcel?: () => void; onJSON?: () => void; onPDF?: () => void }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-sm text-muted-foreground mr-2"><FileDown className="inline h-3.5 w-3.5 mr-1" />Export:</span>
      {onJSON && <Button size="sm" variant="outline" disabled={loading} onClick={onJSON}><FileJson className="h-3.5 w-3.5 mr-1.5" />GSTN JSON</Button>}
      {onExcel && <Button size="sm" variant="outline" disabled={loading} onClick={onExcel}><FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />Excel (Offline Utility)</Button>}
      {onCSV && <Button size="sm" variant="outline" disabled={loading} onClick={onCSV}><FileText className="h-3.5 w-3.5 mr-1.5" />CSV</Button>}
      {onPDF && <Button size="sm" variant="outline" disabled={loading} onClick={onPDF}><Printer className="h-3.5 w-3.5 mr-1.5" />PDF</Button>}
    </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return <Card><CardContent className="py-12 text-center text-muted-foreground">{label}</CardContent></Card>;
}

function StatTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold font-mono ${highlight ? "text-primary" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}
