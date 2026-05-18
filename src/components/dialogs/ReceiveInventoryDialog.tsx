import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Package } from "lucide-react";
import { useEnterNavigation } from "@/hooks/useEnterNavigation";
import { clearConversionCache } from "@/services/unitConversion";

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  products: {
    name: string;
    strength: string | null;
    mrp: number;
    unit: string | null;
    base_unit: string | null;
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
  // Per-batch packing — each batch is treated independently
  pack_unit: string;       // e.g. "Strip"
  base_unit: string;       // e.g. "Tablet"
  pack_size: number;       // tablets per strip for THIS batch (e.g. 10 vs 15)
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
          products (name, strength, mrp, unit, base_unit)
        `)
        .eq("purchase_order_id", orderId);

      if (error) throw error;

      const items = (data || []) as unknown as OrderItem[];
      setOrderItems(items);

      const initialBatches: BatchDetail[] = items.map((item) => {
        const baseUnit = item.products.base_unit || item.products.unit || "pcs";
        // Default pack unit = product unit; if same as base => no pack hierarchy.
        const packUnit = item.products.unit || baseUnit;
        return {
          product_id: item.product_id,
          product_name: `${item.products.name}${item.products.strength ? ` ${item.products.strength}` : ""}`,
          quantity: item.quantity,
          batch_number: "",
          expiry_date: "",
          manufacturing_date: "",
          purchase_price: Number(item.unit_price),
          mrp: Number(item.products.mrp) || Number(item.unit_price) * 1.2,
          pack_unit: packUnit,
          base_unit: baseUnit,
          pack_size: 1, // user must override per batch (e.g. 10 tabs/strip vs 15)
        };
      });

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
      const { data: orderData } = await supabase
        .from("purchase_orders")
        .select("company_id")
        .eq("id", orderId!)
        .single();

      const companyId = orderData?.company_id;
      if (!companyId) throw new Error("Could not resolve company for this order.");

      const { receiveInventoryLocal } = await import("@/offline/inventory/receiveInventoryLocal");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;

      const { created, merged } = await receiveInventoryLocal({
        companyId,
        userId,
        purchaseOrderId: orderId,
        batches: batchDetails.map((batch) => ({
          product_id: batch.product_id,
          batch_number: batch.batch_number,
          quantity: batch.quantity,
          purchase_price: batch.purchase_price,
          mrp: batch.mrp,
          expiry_date: batch.expiry_date || null,
          manufacturing_date: batch.manufacturing_date || null,
          supplier_id: supplierId,
          company_id: companyId,
          pack_unit: batch.pack_unit,
          base_unit: batch.base_unit,
          pack_size: batch.pack_size > 0 ? batch.pack_size : 1,
        })),
      });

      clearConversionCache();

      toast({
        title: "Inventory Received",
        description: `${created} batch(es) with new packing, ${merged} merged/simple.`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const enterNav = useEnterNavigation({ onLastField: handleReceive });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Receive Inventory
          </DialogTitle>
          <DialogDescription>
            Set batch details and per-batch packing (e.g. 10 vs 15 tablets per strip). Each batch's packing is tracked independently.
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
          <div className="space-y-4" data-enter-nav onKeyDown={enterNav}>
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
                        <TableHead>Pack Unit</TableHead>
                        <TableHead>Base Unit</TableHead>
                        <TableHead>Pack Size</TableHead>
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
                              value={batch.pack_unit}
                              onChange={(e) => updateBatchDetail(index, "pack_unit", e.target.value)}
                              className="w-24"
                              placeholder="Strip"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={batch.base_unit}
                              onChange={(e) => updateBatchDetail(index, "base_unit", e.target.value)}
                              className="w-24"
                              placeholder="Tablet"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0.000001}
                              step="any"
                              value={batch.pack_size}
                              onChange={(e) =>
                                updateBatchDetail(index, "pack_size", e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)
                              }
                              className="w-20"
                              title="Base units per pack — e.g. 10 tablets per strip. Set per batch. Decimals allowed for measurable units (ml, g)."
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
              * Pack Size = base units inside one pack <em>for this batch</em>. e.g. Batch A: 10 tabs/strip, Batch B: 15 tabs/strip — they stay separate.
              Leave Pack Size = 1 for items sold loose only. Leave batch number empty to merge into MRP-based stock (no expiry).
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
            data-enter-nav-include="true"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Receive {batchDetails.length} Batch(es)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
