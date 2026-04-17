import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface ProductHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  productName: string;
}

export function ProductHistoryDialog({ open, onOpenChange, productId, productName }: ProductHistoryDialogProps) {
  const { data: salesHistory, isLoading: salesLoading } = useQuery({
    queryKey: ["product-sales-history", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data } = await supabase
        .from("sales_order_items")
        .select(`
          quantity, free_quantity, unit_price, total_price, created_at,
          sales_orders(invoice_number, sale_date, customer_name)
        `)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!productId && open,
  });

  const { data: purchaseHistory, isLoading: purchaseLoading } = useQuery({
    queryKey: ["product-purchase-history", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data } = await supabase
        .from("purchase_order_items")
        .select(`
          quantity, free_quantity, unit_price, total_price, created_at,
          purchase_orders(order_number, order_date, suppliers(name))
        `)
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!productId && open,
  });

  const isLoading = salesLoading || purchaseLoading;

  const totalSold = salesHistory?.reduce((s, i) => s + (i.quantity || 0) + (i.free_quantity || 0), 0) || 0;
  const totalPurchased = purchaseHistory?.reduce((s, i) => s + (i.quantity || 0) + (i.free_quantity || 0), 0) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{productName} — Transaction History</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <TrendingDown className="h-5 w-5 text-primary" />
            <div>
              <p className="text-lg font-bold">{totalPurchased}</p>
              <p className="text-xs text-muted-foreground">Total Purchased</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <TrendingUp className="h-5 w-5 text-success" />
            <div>
              <p className="text-lg font-bold">{totalSold}</p>
              <p className="text-xs text-muted-foreground">Total Sold</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="sales">
            <TabsList className="w-full">
              <TabsTrigger value="sales" className="flex-1">
                Sales ({salesHistory?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="purchases" className="flex-1">
                Purchases ({purchaseHistory?.length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sales">
              {salesHistory?.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">No sales history</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesHistory?.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{(item.sales_orders as any)?.invoice_number}</TableCell>
                        <TableCell className="text-sm">
                          {(item.sales_orders as any)?.sale_date
                            ? format(new Date((item.sales_orders as any).sale_date), "dd/MM/yyyy")
                            : "-"}
                        </TableCell>
                        <TableCell className="text-sm">{(item.sales_orders as any)?.customer_name}</TableCell>
                        <TableCell className="text-right">
                          {item.quantity}
                          {item.free_quantity ? <span className="text-xs text-success ml-1">+{item.free_quantity} free</span> : null}
                        </TableCell>
                        <TableCell className="text-right font-mono">₹{Number(item.unit_price).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">₹{Number(item.total_price).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="purchases">
              {purchaseHistory?.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">No purchase history</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseHistory?.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{(item.purchase_orders as any)?.order_number}</TableCell>
                        <TableCell className="text-sm">
                          {(item.purchase_orders as any)?.order_date
                            ? format(new Date((item.purchase_orders as any).order_date), "dd/MM/yyyy")
                            : "-"}
                        </TableCell>
                        <TableCell className="text-sm">{(item.purchase_orders as any)?.suppliers?.name}</TableCell>
                        <TableCell className="text-right">
                          {item.quantity}
                          {item.free_quantity ? <span className="text-xs text-success ml-1">+{item.free_quantity} free</span> : null}
                        </TableCell>
                        <TableCell className="text-right font-mono">₹{Number(item.unit_price).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">₹{Number(item.total_price).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
