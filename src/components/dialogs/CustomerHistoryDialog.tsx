import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, Receipt, Package } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type SalesOrder = Tables<"sales_orders">;

export interface RepeatItem {
  product_id: string;
  quantity: number;
  free_quantity: number;
  unit_price: number;
  discount_percentage: number;
}

interface CustomerHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  customerName: string;
  companyId: string | null;
  /** Add a single line back to the cart using FEFO batch allocation */
  onRepeatItem: (item: RepeatItem) => void;
}

export function CustomerHistoryDialog({
  open, onOpenChange, customerId, customerName, companyId, onRepeatItem
}: CustomerHistoryDialogProps) {
  const { toast } = useToast();
  const [limit, setLimit] = useState(10);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["customer-history", customerId, customerName, companyId, limit],
    queryFn: async () => {
      let q = supabase
        .from("sales_orders")
        .select("*")
        .eq("company_id", companyId!)
        .order("sale_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (customerId) {
        q = q.or(`customer_id.eq.${customerId},ledger_id.eq.${customerId}`);
      } else if (customerName) {
        q = q.eq("customer_name", customerName);
      } else {
        return [];
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as SalesOrder[];
    },
    enabled: open && !!companyId && (!!customerId || !!customerName),
  });

  const { data: items } = useQuery({
    queryKey: ["customer-history-items", expandedOrderId],
    queryFn: async () => {
      if (!expandedOrderId) return [];
      const { data, error } = await supabase
        .from("sales_order_items")
        .select("*, products(name, strength)")
        .eq("sales_order_id", expandedOrderId);
      if (error) throw error;
      return data as Array<Tables<"sales_order_items"> & { products: { name: string; strength: string | null } | null }>;
    },
    enabled: !!expandedOrderId,
  });

  const grouped = useMemo(() => orders ?? [], [orders]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Purchase history — {customerName || "Customer"}
          </DialogTitle>
          <DialogDescription>
            Click an invoice to expand and repeat individual items with auto-FEFO batch selection.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading history...
            </div>
          ) : grouped.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
              No past purchases found for this customer.
            </div>
          ) : (
            <div className="space-y-2">
              {grouped.map(order => {
                const isExpanded = expandedOrderId === order.id;
                return (
                  <div key={order.id} className="rounded-md border">
                    <button
                      type="button"
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant="outline" className="font-mono text-xs">{order.invoice_number}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(order.sale_date), "dd MMM yyyy")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={order.payment_status === "paid" ? "secondary" : "outline"} className="text-[10px]">
                          {order.payment_status}
                        </Badge>
                        <span className="font-mono text-sm font-semibold">₹{Number(order.total_amount).toFixed(2)}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t bg-muted/30 p-2 space-y-1">
                        {!items ? (
                          <div className="text-xs text-muted-foreground py-2 px-2">Loading items...</div>
                        ) : items.length === 0 ? (
                          <div className="text-xs text-muted-foreground py-2 px-2">No items.</div>
                        ) : (
                          items.map(it => {
                            const productName = it.products
                              ? `${it.products.name}${it.products.strength ? " " + it.products.strength : ""}`
                              : "Unknown product";
                            return (
                              <div key={it.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-background border text-sm">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium">{productName}</div>
                                  <div className="text-[11px] text-muted-foreground">
                                    Qty {it.quantity}{(it.free_quantity || 0) > 0 ? ` + ${it.free_quantity} free` : ""} · ₹{Number(it.unit_price).toFixed(2)}
                                    {Number(it.discount_percentage) > 0 ? ` · ${it.discount_percentage}% off` : ""}
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 gap-1 shrink-0"
                                  onClick={() => {
                                    onRepeatItem({
                                      product_id: it.product_id,
                                      quantity: it.quantity,
                                      free_quantity: it.free_quantity || 0,
                                      unit_price: Number(it.unit_price),
                                      discount_percentage: Number(it.discount_percentage),
                                    });
                                    toast({ title: "Added", description: `${productName} added with FEFO batch.` });
                                  }}
                                >
                                  <RefreshCw className="h-3 w-3" /> Repeat
                                </Button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {grouped.length >= limit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setLimit(l => l + 20)}
                >
                  Load more
                </Button>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
