import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Boxes, Loader2, TrendingUp, TrendingDown, Minus, History, Layers } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { ProductHistoryDialog } from "@/components/dialogs/ProductHistoryDialog";
import { BatchViewerDialog } from "@/components/dialogs/BatchViewerDialog";

interface InventoryItem {
  id: string;
  product_id: string;
  batch_number: string;
  quantity: number;
  loose_quantity: number;
  pack_size: number | null;
  expiry_date: string;
  manufacturing_date: string | null;
  purchase_price: number;
  mrp: number;
  received_date: string;
  product: {
    id: string;
    name: string;
    manufacturer: string;
    reorder_level: number;
    base_unit: string | null;
    unit: string;
  };
  supplier: {
    name: string;
  } | null;
}

interface AggregatedProduct {
  product_id: string;
  product_name: string;
  manufacturer: string;
  total_base_quantity: number;   // total in BASE units across all batches (intelligent aggregation)
  reorder_level: number;
  base_unit: string;
  pack_summary: string;          // human readable per-batch packing summary
  batches: InventoryItem[];
}

export default function Inventory() {
  const { companyId, activeFinancialYearId } = useBusiness();
  const { toast } = useToast();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"aggregated" | "batches">("aggregated");
  const [historyProduct, setHistoryProduct] = useState<{ id: string; name: string } | null>(null);
  const [batchProduct, setBatchProduct] = useState<AggregatedProduct | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcut({ key: "/", callback: () => { searchRef.current?.focus(); searchRef.current?.select(); } });

  const fetchInventory = async () => {
    if (!companyId) return;
    try {
      let q = supabase
        .from("inventory_batches")
        .select(`
          *,
          product:products(id, name, manufacturer, reorder_level, base_unit, unit),
          supplier:suppliers(name)
        `)
        .eq("company_id", companyId);
      if (activeFinancialYearId) q = q.eq("financial_year_id", activeFinancialYearId);
      const { data, error } = await q.order("expiry_date", { ascending: true });

      if (error) throw error;
      setInventory(data as InventoryItem[] || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [companyId, activeFinancialYearId]);

  // Aggregate intelligently: convert each batch's sealed packs (using ITS OWN pack_size)
  // to base units, then add loose. Batches with different pack_size stay independent.
  const baseUnitsFor = (b: InventoryItem) =>
    b.quantity * (b.pack_size && b.pack_size > 0 ? b.pack_size : 1) + (b.loose_quantity || 0);

  const aggregatedProducts: AggregatedProduct[] = inventory.reduce((acc, item) => {
    const existing = acc.find((p) => p.product_id === item.product_id);
    const baseUnit = item.product.base_unit || item.product.unit || "pcs";
    if (existing) {
      existing.total_base_quantity += baseUnitsFor(item);
      existing.batches.push(item);
    } else {
      acc.push({
        product_id: item.product_id,
        product_name: item.product.name,
        manufacturer: item.product.manufacturer,
        total_base_quantity: baseUnitsFor(item),
        reorder_level: item.product.reorder_level,
        base_unit: baseUnit,
        pack_summary: "",
        batches: [item],
      });
    }
    return acc;
  }, [] as AggregatedProduct[]);

  // Build pack summary per product, e.g. "10/pack ×3, 15/pack ×1, loose ×2"
  aggregatedProducts.forEach((p) => {
    const counts = new Map<string, number>();
    p.batches.forEach((b) => {
      const key = b.pack_size && b.pack_size > 1 ? `${b.pack_size}/pack` : "loose";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    p.pack_summary = Array.from(counts.entries()).map(([k, v]) => `${k} ×${v}`).join(", ");
  });

  const filteredProducts = aggregatedProducts.filter(
    (p) =>
      p.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.manufacturer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStockStatus = (quantity: number, reorderLevel: number) => {
    if (quantity === 0) {
      return { label: "Out of Stock", color: "bg-destructive text-destructive-foreground", icon: TrendingDown };
    } else if (quantity < reorderLevel) {
      return { label: "Low Stock", color: "bg-warning text-warning-foreground", icon: TrendingDown };
    } else if (quantity > reorderLevel * 3) {
      return { label: "Overstocked", color: "bg-info text-info-foreground", icon: TrendingUp };
    }
    return { label: "Normal", color: "bg-success text-success-foreground", icon: Minus };
  };

  const stats = {
    totalProducts: aggregatedProducts.length,
    lowStock: aggregatedProducts.filter((p) => p.total_base_quantity < p.reorder_level && p.total_base_quantity > 0).length,
    outOfStock: aggregatedProducts.filter((p) => p.total_base_quantity === 0).length,
    totalBatches: inventory.length,
  };

  return (
    <div className="page-container">
      <PageHeader 
        title="Inventory" 
        description="Track stock levels and batch information"
        breadcrumbs={[{ label: "Inventory" }]}
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Boxes className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Products</p>
                <p className="text-2xl font-bold">{stats.totalProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-warning/10">
                <TrendingDown className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Low Stock</p>
                <p className="text-2xl font-bold">{stats.lowStock}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-destructive/10">
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Out of Stock</p>
                <p className="text-2xl font-bold">{stats.outOfStock}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-info/10">
                <Boxes className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Batches</p>
                <p className="text-2xl font-bold">{stats.totalBatches}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Search inventory..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8">
              <Boxes className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No inventory items found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Manufacturer</TableHead>
                    <TableHead className="text-right">Total Stock</TableHead>
                    <TableHead>Packing</TableHead>
                    <TableHead className="text-right">Reorder Level</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Batches</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => {
                    const status = getStockStatus(product.total_base_quantity, product.reorder_level);
                    return (
                      <TableRow key={product.product_id} tabIndex={0} data-kb-row
                        className="table-hover-row focus:bg-accent cursor-pointer group"
                        onClick={() => setHistoryProduct({ id: product.product_id, name: product.product_name })}
                        onKeyDown={(e) => {
                          const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-kb-row]"));
                          const pos = rows.indexOf(e.currentTarget);
                          if (e.key === "ArrowDown") { e.preventDefault(); rows[pos + 1]?.focus(); }
                          else if (e.key === "ArrowUp") { e.preventDefault(); rows[pos - 1]?.focus(); }
                          else if (e.key === "Enter") { e.preventDefault(); setHistoryProduct({ id: product.product_id, name: product.product_name }); }
                        }}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <History className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                            {product.product_name}
                          </div>
                        </TableCell>
                        <TableCell>{product.manufacturer}</TableCell>
                        <TableCell className="text-right font-mono">
                          {product.total_base_quantity} <span className="text-xs text-muted-foreground">{product.base_unit}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{product.pack_summary || "—"}</TableCell>
                        <TableCell className="text-right font-mono">{product.reorder_level}</TableCell>
                        <TableCell>
                          <Badge className={status.color}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{product.batches.length}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); setBatchProduct(product); }}
                          >
                            <Layers className="h-3 w-3 mr-1" /> View Batches
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ProductHistoryDialog
        open={!!historyProduct}
        onOpenChange={(open) => !open && setHistoryProduct(null)}
        productId={historyProduct?.id || null}
        productName={historyProduct?.name || ""}
      />

      <BatchViewerDialog
        open={!!batchProduct}
        onOpenChange={(open) => !open && setBatchProduct(null)}
        productName={batchProduct?.product_name || ""}
        productId={batchProduct?.product_id}
        batches={(batchProduct?.batches || []).map((b: any) => ({ ...b, product_id: batchProduct?.product_id }))}
        onChanged={() => fetchInventory()}
      />
    </div>
  );
}
