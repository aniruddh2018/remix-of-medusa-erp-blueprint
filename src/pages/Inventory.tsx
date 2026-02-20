import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Search, Boxes, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format } from "date-fns";

interface InventoryItem {
  id: string;
  product_id: string;
  batch_number: string;
  quantity: number;
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
  };
  supplier: {
    name: string;
  } | null;
}

interface AggregatedProduct {
  product_id: string;
  product_name: string;
  manufacturer: string;
  total_quantity: number;
  reorder_level: number;
  batches: InventoryItem[];
}

export default function Inventory() {
  const { toast } = useToast();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"aggregated" | "batches">("aggregated");

  const fetchInventory = async () => {
    try {
      const { data, error } = await supabase
        .from("inventory_batches")
        .select(`
          *,
          product:products(id, name, manufacturer, reorder_level),
          supplier:suppliers(name)
        `)
        .order("expiry_date", { ascending: true });

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
  }, []);

  const aggregatedProducts: AggregatedProduct[] = inventory.reduce((acc, item) => {
    const existing = acc.find((p) => p.product_id === item.product_id);
    if (existing) {
      existing.total_quantity += item.quantity;
      existing.batches.push(item);
    } else {
      acc.push({
        product_id: item.product_id,
        product_name: item.product.name,
        manufacturer: item.product.manufacturer,
        total_quantity: item.quantity,
        reorder_level: item.product.reorder_level,
        batches: [item],
      });
    }
    return acc;
  }, [] as AggregatedProduct[]);

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
    lowStock: aggregatedProducts.filter((p) => p.total_quantity < p.reorder_level && p.total_quantity > 0).length,
    outOfStock: aggregatedProducts.filter((p) => p.total_quantity === 0).length,
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
                    <TableHead className="text-right">Reorder Level</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Batches</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => {
                    const status = getStockStatus(product.total_quantity, product.reorder_level);
                    return (
                      <TableRow key={product.product_id} className="table-hover-row">
                        <TableCell className="font-medium">{product.product_name}</TableCell>
                        <TableCell>{product.manufacturer}</TableCell>
                        <TableCell className="text-right font-mono">{product.total_quantity}</TableCell>
                        <TableCell className="text-right font-mono">{product.reorder_level}</TableCell>
                        <TableCell>
                          <Badge className={status.color}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{product.batches.length}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
