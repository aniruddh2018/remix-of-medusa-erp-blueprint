import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Package } from "lucide-react";

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  products: {
    name: string;
    strength: string | null;
    mrp: number;
  };
}

interface BatchDetail {
  product_id: string;
  product_name: string;
  quantity: number;
  batch_number: string;
  expiry_date: string;
  manufacturing_date: string;
  purchase_price: number;
  mrp: number;
}

interface ReceiveInventoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  supplierId: string | null;
  onSuccess: () => void;
}

export function ReceiveInventoryDialog({
  open,
  onOpenChange,
  orderId,
  supplierId,
  onSuccess,
}: ReceiveInventoryDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [batchDetails, setBatchDetails] = useState<BatchDetail[]>([]);

  useEffect(() => {
    if (open && orderId) {
      fetchOrderItems();
    }
  }, [open, orderId]);

  const fetchOrderItems = async () => {
    if (!orderId) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("purchase_order_items")
        .select(`
          id,
          product_id,
          quantity,
          unit_price,
          products (name, strength, mrp)
        `)
        .eq("purchase_order_id", orderId);

      if (error) throw error;

      const items = (data || []) as unknown as OrderItem[];
      setOrderItems(items);

      // Initialize batch details with defaults
      const defaultExpiry = new Date();
      defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 2);
      const today = new Date().toISOString().split("T")[0];

      const initialBatches: BatchDetail[] = items.map((item) => ({
        product_id: item.product_id,
        product_name: `${item.products.name}${item.products.strength ? ` ${item.products.strength}` : ""}`,
        quantity: item.quantity,
        batch_number: "", // Empty = let system decide (merge or create)
        expiry_date: defaultExpiry.toISOString().split("T")[0],
        manufacturing_date: today,
        purchase_price: Number(item.unit_price),
        mrp: Number(item.products.mrp) || Number(item.unit_price) * 1.2,
      }));

      setBatchDetails(initialBatches);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const updateBatchDetail = (index: number, field: keyof BatchDetail, value: string | number) => {
    const updated = [...batchDetails];
    (updated[index] as any)[field] = value;
    setBatchDetails(updated);
  };

  const handleReceive = async () => {
    if (batchDetails.length === 0) return;
    setSaving(true);

    try {
      // Use smart batch creation/merge RPC
      const batchPayload = batchDetails.map((batch) => ({
        product_id: batch.product_id,
        batch_number: batch.batch_number,
        quantity: batch.quantity,
        purchase_price: batch.purchase_price,
        mrp: batch.mrp,
        expiry_date: batch.expiry_date,
        manufacturing_date: batch.manufacturing_date || null,
        supplier_id: supplierId,
        company_id: null, // Will be set by RLS context
      }));

      // Fetch company_id from the order
      const { data: orderData } = await supabase
        .from("purchase_orders")
        .select("company_id")
        .eq("id", orderId!)
        .single();

      const companyId = orderData?.company_id;
      const enrichedPayload = batchPayload.map(b => ({ ...b, company_id: companyId }));

      const { data: result, error: rpcError } = await supabase.rpc("receive_purchase_batches", {
        _batches: enrichedPayload,
        _purchase_order_id: orderId,
      });

      if (rpcError) throw rpcError;

      const actions = (result as any[]) || [];
      const merged = actions.filter((a: any) => a.action?.includes('merged')).length;
      const created = actions.filter((a: any) => a.action?.includes('created')).length;

      toast({
        title: "Inventory Received",
        description: `${created} batch(es) created, ${merged} merged into existing.`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Receive Inventory
          </DialogTitle>
          <DialogDescription>
            Customize batch details for each product before receiving into inventory
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : batchDetails.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No items to receive
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Batch Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Batch Number</TableHead>
                        <TableHead>Mfg Date</TableHead>
                        <TableHead>Expiry Date</TableHead>
                        <TableHead>Purchase Price</TableHead>
                        <TableHead>MRP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batchDetails.map((batch, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium min-w-[200px]">
                            {batch.product_name}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              value={batch.quantity}
                              onChange={(e) =>
                                updateBatchDetail(index, "quantity", e.target.value === '' ? 0 : parseInt(e.target.value) || 0)
                              }
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={batch.batch_number}
                              onChange={(e) =>
                                updateBatchDetail(index, "batch_number", e.target.value)
                              }
                              className="w-36"
                              placeholder="Batch number"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={batch.manufacturing_date}
                              onChange={(e) =>
                                updateBatchDetail(index, "manufacturing_date", e.target.value)
                              }
                              className="w-36"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={batch.expiry_date}
                              onChange={(e) =>
                                updateBatchDetail(index, "expiry_date", e.target.value)
                              }
                              className="w-36"
                              required
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={batch.purchase_price}
                              onChange={(e) =>
                                updateBatchDetail(index, "purchase_price", parseFloat(e.target.value) || 0)
                              }
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={batch.mrp}
                              onChange={(e) =>
                                updateBatchDetail(index, "mrp", parseFloat(e.target.value) || 0)
                              }
                              className="w-24"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <p className="text-sm text-muted-foreground">
              * Each batch can have different MRP and purchase price. Batch numbers should be unique.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleReceive}
            disabled={batchDetails.length === 0 || saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Receive {batchDetails.length} Batch(es)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
