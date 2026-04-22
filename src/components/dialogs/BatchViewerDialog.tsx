import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { SupplierReturnDialog, type SupplierReturnBatch } from "@/components/dialogs/SupplierReturnDialog";

interface Batch {
  id: string;
  batch_number: string;
  quantity: number;
  expiry_date: string | null;
  manufacturing_date: string | null;
  purchase_price: number;
  mrp: number;
  received_date: string;
  product_id?: string;
  supplier_id?: string | null;
  supplier?: { name: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  productId?: string;
  batches: Batch[];
  onChanged?: () => void;
}

export function BatchViewerDialog({ open, onOpenChange, productName, productId, batches, onChanged }: Props) {
  const today = new Date();
  const [returnTarget, setReturnTarget] = useState<SupplierReturnBatch | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>All Batches — {productName}</DialogTitle>
          </DialogHeader>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No batches available.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Purchase ₹</TableHead>
                  <TableHead className="text-right">MRP ₹</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => {
                  const daysToExpiry = b.expiry_date ? differenceInDays(new Date(b.expiry_date), today) : null;
                  const expired = daysToExpiry !== null && daysToExpiry < 0;
                  const nearExpiry = daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 60;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.batch_number}</TableCell>
                      <TableCell>{b.supplier?.name || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{b.quantity}</TableCell>
                      <TableCell className="text-right font-mono">{Number(b.purchase_price).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{Number(b.mrp).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">{format(new Date(b.received_date), "dd/MM/yy")}</TableCell>
                      <TableCell className="text-xs">{b.expiry_date ? format(new Date(b.expiry_date), "dd/MM/yy") : "—"}</TableCell>
                      <TableCell>
                        {expired ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : nearExpiry ? (
                          <Badge className="bg-warning text-warning-foreground">Near Expiry</Badge>
                        ) : (
                          <Badge variant="secondary">OK</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={b.quantity <= 0}
                          onClick={() => setReturnTarget({
                            id: b.id,
                            batch_number: b.batch_number,
                            quantity: b.quantity,
                            expiry_date: b.expiry_date,
                            purchase_price: b.purchase_price,
                            mrp: b.mrp,
                            product_id: b.product_id || productId || "",
                            product_name: productName,
                            supplier_id: b.supplier_id,
                            supplier_name: b.supplier?.name,
                          })}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Return
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <SupplierReturnDialog
        open={!!returnTarget}
        onOpenChange={(o) => !o && setReturnTarget(null)}
        batch={returnTarget}
        onSuccess={() => { onChanged?.(); }}
      />
    </>
  );
}
