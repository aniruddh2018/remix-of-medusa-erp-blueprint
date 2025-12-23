import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText } from "lucide-react";
import { format } from "date-fns";

interface LinkedChallan {
  id: string;
  order_number: string;
  challan_number: string | null;
  order_date: string;
  total_amount: number;
  status: string;
}

interface LinkedChallansDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
}

export function LinkedChallansDialog({
  open,
  onOpenChange,
  invoiceId,
}: LinkedChallansDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [challans, setChallans] = useState<LinkedChallan[]>([]);

  useEffect(() => {
    if (open && invoiceId) {
      fetchLinkedChallans();
    }
  }, [open, invoiceId]);

  const fetchLinkedChallans = async () => {
    if (!invoiceId) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, order_number, challan_number, order_date, total_amount, status")
        .eq("converted_from_challan_id", invoiceId);

      if (error) throw error;
      setChallans((data || []) as LinkedChallan[]);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Linked Challans
          </DialogTitle>
          <DialogDescription>
            Challans that were merged into this invoice
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : challans.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No linked challans found for this invoice
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Challan #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {challans.map((challan) => (
                <TableRow key={challan.id}>
                  <TableCell className="font-medium">{challan.order_number}</TableCell>
                  <TableCell>{challan.challan_number || "-"}</TableCell>
                  <TableCell>{format(new Date(challan.order_date), "dd/MM/yyyy")}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{challan.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ₹{Number(challan.total_amount).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
