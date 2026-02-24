import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface CustomerOutstandingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  customerName: string;
}

export function CustomerOutstandingDialog({ open, onOpenChange, customerId, customerName }: CustomerOutstandingDialogProps) {
  const navigate = useNavigate();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["customer-invoices", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const { data: sales } = await supabase
        .from("sales_orders")
        .select("id, invoice_number, sale_date, total_amount, status, payment_method")
        .eq("customer_id", customerId)
        .in("status", ["confirmed", "delivered", "pending", "shipped"])
        .order("sale_date", { ascending: false });

      const { data: payments } = await supabase
        .from("payments")
        .select("reference_id, amount")
        .eq("party_type", "customer")
        .eq("payment_type", "received");

      const paymentsByRef: Record<string, number> = {};
      payments?.forEach(p => {
        paymentsByRef[p.reference_id] = (paymentsByRef[p.reference_id] || 0) + Number(p.amount);
      });

      return (sales || []).map(s => ({
        ...s,
        paid: paymentsByRef[s.id] || 0,
        outstanding: Number(s.total_amount) - (paymentsByRef[s.id] || 0),
      }));
    },
    enabled: !!customerId && open,
  });

  const totalOutstanding = invoices?.reduce((sum, inv) => sum + Math.max(0, inv.outstanding), 0) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customerName} — Invoice History</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : invoices?.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No invoices found</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices?.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                    <TableCell className="text-sm">{format(new Date(inv.sale_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-right font-mono">₹{Number(inv.total_amount).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-success">₹{inv.paid.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {inv.outstanding > 0 ? (
                        <Badge className="bg-destructive text-destructive-foreground font-mono">₹{inv.outstanding.toLocaleString()}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Paid</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "confirmed" ? "default" : "secondary"}>{inv.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                        onOpenChange(false);
                        navigate("/sales");
                      }}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-between items-center pt-3 border-t font-semibold">
              <span>Total Outstanding</span>
              <span className="text-destructive">₹{totalOutstanding.toLocaleString()}</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
