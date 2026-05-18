import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { offlineDb } from "@/offline/db";
import { useBusiness } from "@/contexts/BusinessContext";
import { useActiveProducts } from "@/offline/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/PageHeader";
import { BrainCircuit, Loader2, AlertTriangle, Printer, FileDown } from "lucide-react";
import {
  analyseDemand,
  buildHistory,
  type DemandAnalysis,
} from "@/features/demand/demandEngine";

const DEFAULT_LEAD_TIME = 7;
const HISTORY_DAYS = 30;

export default function DemandIntelligence() {
  const { companyId } = useBusiness();
  const navigate = useNavigate();
  const products = useActiveProducts<any>(companyId);
  const [leadTime, setLeadTime] = useState(DEFAULT_LEAD_TIME);
  const [edits, setEdits] = useState<Record<string, number>>({});

  // Pull sales items from the past 30 days (joined with sales_orders for date).
  const sales = useLiveQuery(async () => {
    if (!companyId) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const orders = await offlineDb.sales_orders
      .where("company_id")
      .equals(companyId)
      .filter((o: any) => !o.deleted && (o.sale_date || "") >= cutoffStr)
      .toArray();
    const orderMap = new Map(orders.map((o: any) => [o.id, o.sale_date]));
    const items = await offlineDb.sales_order_items
      .where("company_id")
      .equals(companyId)
      .filter((it: any) => !it.deleted && orderMap.has(it.sales_order_id))
      .toArray();
    return items.map((it: any) => ({
      product_id: it.product_id,
      quantity: Number(it.quantity) || 0,
      sale_date: orderMap.get(it.sales_order_id) as string,
    }));
  }, [companyId]);

  const batches = useLiveQuery(async () => {
    if (!companyId) return [];
    return offlineDb.inventory_batches
      .where("company_id")
      .equals(companyId)
      .filter((b: any) => !b.deleted)
      .toArray();
  }, [companyId]);

  const suppliers = useLiveQuery(async () => {
    if (!companyId) return [];
    return offlineDb.suppliers
      .where("company_id")
      .equals(companyId)
      .filter((s: any) => !s.deleted)
      .toArray();
  }, [companyId]);

  const loading = !products || !sales || !batches || !suppliers;

  const analyses = useMemo<DemandAnalysis[]>(() => {
    if (loading) return [];
    const stockByProduct = new Map<string, number>();
    const supplierByProduct = new Map<string, string | null>();
    const latestBatchDate = new Map<string, string>();
    for (const b of batches as any[]) {
      stockByProduct.set(b.product_id, (stockByProduct.get(b.product_id) || 0) + (Number(b.quantity) || 0));
      const prev = latestBatchDate.get(b.product_id);
      const cur = b.received_date || b.created_at || "";
      if (b.supplier_id && (!prev || cur > prev)) {
        latestBatchDate.set(b.product_id, cur);
        supplierByProduct.set(b.product_id, b.supplier_id);
      }
    }
    const supplierMap = new Map((suppliers as any[]).map((s: any) => [s.id, s.name]));
    const salesByProduct = new Map<string, { dates: string[]; qtys: number[] }>();
    for (const s of sales as any[]) {
      const cur = salesByProduct.get(s.product_id) || { dates: [], qtys: [] };
      cur.dates.push(s.sale_date);
      cur.qtys.push(s.quantity);
      salesByProduct.set(s.product_id, cur);
    }

    return (products as any[]).map((p: any) => {
      const sd = salesByProduct.get(p.id) || { dates: [], qtys: [] };
      const history = buildHistory(sd.dates, sd.qtys, HISTORY_DAYS);
      const supplierId = supplierByProduct.get(p.id) || null;
      return analyseDemand({
        productId: p.id,
        productName: p.name,
        manufacturer: p.manufacturer,
        reorderLevel: Number(p.reorder_level) || 0,
        currentStock: stockByProduct.get(p.id) || 0,
        supplierId,
        supplierName: supplierId ? (supplierMap.get(supplierId) as string) || null : null,
        history,
        leadTimeDays: leadTime,
      });
    });
  }, [loading, products, sales, batches, suppliers, leadTime]);

  const spikes = analyses.filter((a) => a.state === "SPIKE");
  const reorderNeeded = analyses.filter((a) => a.suggestedQty > 0);

  const getQty = (a: DemandAnalysis) => edits[a.productId] ?? a.suggestedQty;

  const grouped = useMemo(() => {
    const map = new Map<string, { supplierName: string; rows: DemandAnalysis[] }>();
    for (const a of reorderNeeded) {
      if (getQty(a) <= 0) continue;
      const key = a.supplierId || "_unassigned";
      const cur = map.get(key) || { supplierName: a.supplierName || "Unassigned", rows: [] };
      cur.rows.push(a);
      map.set(key, cur);
    }
    return Array.from(map.entries());
  }, [reorderNeeded, edits]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Demand Intelligence"
        description="ARIMA-powered demand forecasting & auto-reorder suggestions"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Lead time (days):</span>
            <Input
              type="number"
              value={leadTime}
              onChange={(e) => setLeadTime(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 h-9"
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Products</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{analyses.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-destructive">Spike Alerts</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{spikes.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Reorder Suggestions</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{reorderNeeded.length}</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="suggestions">Order Suggestions ({reorderNeeded.length})</TabsTrigger>
          <TabsTrigger value="po">PO Preview ({grouped.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Avg 7d</TableHead>
                    <TableHead className="text-right">Avg 30d</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Engine</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyses.map((a) => (
                    <TableRow key={a.productId} className={a.state === "SPIKE" ? "bg-destructive/5" : ""}>
                      <TableCell className="font-medium">{a.productName}</TableCell>
                      <TableCell className="text-right font-mono">{a.currentStock}</TableCell>
                      <TableCell className="text-right font-mono">{a.avg7.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{a.avg30.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={a.state === "SPIKE" ? "destructive" : a.state === "DROP" ? "secondary" : "outline"}>
                          {a.state === "SPIKE" && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {a.state}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.reason}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{a.method}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suggestions">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Forecast ({leadTime}d)</TableHead>
                    <TableHead className="text-right">Safety</TableHead>
                    <TableHead className="text-right">Suggested</TableHead>
                    <TableHead className="text-right">Order Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reorderNeeded.map((a) => (
                    <TableRow key={a.productId}>
                      <TableCell className="font-medium">{a.productName}</TableCell>
                      <TableCell className="text-sm">{a.supplierName || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{a.currentStock}</TableCell>
                      <TableCell className="text-right font-mono">{a.forecastTotal}</TableCell>
                      <TableCell className="text-right font-mono">{a.safetyStock}</TableCell>
                      <TableCell className="text-right font-mono">{a.suggestedQty}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={getQty(a)}
                          onChange={(e) => setEdits((p) => ({ ...p, [a.productId]: Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="w-24 h-8 text-right font-mono ml-auto"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {reorderNeeded.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No reorders needed right now.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="po">
          <div className="flex justify-end mb-3 gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print / PDF</Button>
            <Button size="sm" onClick={() => navigate("/purchase-orders")}><FileDown className="h-4 w-4 mr-1" />Go to Purchase Orders</Button>
          </div>
          <div className="space-y-4">
            {grouped.map(([key, g]) => (
              <Card key={key}>
                <CardHeader className="pb-3"><CardTitle className="text-base">Supplier: {g.supplierName}</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Manufacturer</TableHead>
                        <TableHead className="text-right">Order Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.rows.map((r) => (
                        <TableRow key={r.productId}>
                          <TableCell className="font-medium">{r.productName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.manufacturer || "—"}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{getQty(r)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
            {grouped.length === 0 && (
              <Card><CardContent className="text-center text-muted-foreground py-8">No purchase orders to generate.</CardContent></Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
