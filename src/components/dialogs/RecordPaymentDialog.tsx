import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Banknote } from "lucide-react";
import { format } from "date-fns";

export interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referenceType: "sales_order" | "purchase_order" | "credit_note" | "debit_note";
  referenceId: string;
  referenceNumber: string;
  partyName: string;
  partyType: "customer" | "supplier";
  totalAmount: number;
  paidAmount: number; // already paid
  paymentType: "received" | "made";
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  referenceType,
  referenceId,
  referenceNumber,
  partyName,
  partyType,
  totalAmount,
  paidAmount,
  paymentType,
}: RecordPaymentDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId } = useBusiness();
  const queryClient = useQueryClient();

  const balance = totalAmount - paidAmount;

  const [amount, setAmount] = useState<number>(balance > 0 ? parseFloat(balance.toFixed(2)) : 0);
  const [method, setMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("payments").insert({
        payment_type: paymentType,
        reference_type: referenceType,
        reference_id: referenceId,
        reference_number: referenceNumber,
        party_name: partyName,
        party_type: partyType,
        amount,
        payment_method: method,
        payment_date: paymentDate,
        cheque_number: chequeNumber || null,
        bank_name: bankName || null,
        notes: notes || null,
        created_by: user?.id,
        company_id: companyId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Payment recorded successfully" });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      onOpenChange(false);
      setAmount(balance > 0 ? parseFloat(balance.toFixed(2)) : 0);
      setMethod("cash");
      setChequeNumber("");
      setBankName("");
      setNotes("");
    },
    onError: (e: any) => {
      toast({ title: "Failed to record payment", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Record {paymentType === "received" ? "Payment Received" : "Payment Made"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Reference info */}
          <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reference</span>
              <span className="font-medium">{referenceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{partyType === "customer" ? "Customer" : "Supplier"}</span>
              <span className="font-medium">{partyName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice Total</span>
              <span className="font-mono">₹{totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Already Paid</span>
              <span className="font-mono text-green-600">₹{paidAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-1 mt-1">
              <span>Balance Due</span>
              <span className={`font-mono ${balance > 0 ? "text-destructive" : "text-green-600"}`}>
                ₹{balance.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={amount || ""}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label>Payment Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>

            {method === "cheque" && (
              <>
                <div className="space-y-1">
                  <Label>Cheque No.</Label>
                  <Input
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                    placeholder="e.g. 001234"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Bank Name</Label>
                  <Input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. SBI"
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!amount || amount <= 0 || mutation.isPending}
          >
            <Banknote className="h-4 w-4 mr-2" />
            {mutation.isPending ? "Saving..." : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
