import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, differenceInDays } from "date-fns";

interface Batch {
  id: string;
  batch_number: string;
  quantity: number;
  expiry_date: string | null;
  manufacturing_date: string | null;
  purchase_price: number;
  mrp: number;
  received_date: string;
  supplier?: { name: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  batches: Batch[];
}

export function BatchViewerDialog({ open, onOpenChange, productName, batches }: Props) {
  const today = new Date();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Purchase ₹</TableHead>
                <TableHead className="text-right">MRP ₹</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => {
                const daysToExpiry = b.expiry_date
                  ? differenceInDays(new Date(b.expiry_date), today)
                  : null;
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
                    <TableCell className="text-xs">
                      {b.expiry_date ? format(new Date(b.expiry_date), "dd/MM/yy") : "—"}
                    </TableCell>
                    <TableCell>
                      {expired ? (
                        <Badge variant="destructive">Expired</Badge>
                      ) : nearExpiry ? (
                        <Badge className="bg-warning text-warning-foreground">Near Expiry</Badge>
                      ) : (
                        <Badge variant="secondary">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
