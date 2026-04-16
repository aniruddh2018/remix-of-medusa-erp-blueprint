import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useEnterNavigation } from "@/hooks/useEnterNavigation";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Banknote, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { getPaymentSummary } from "@/utils/transactionUx";

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
  const { user, isAdmin, isPharmacist } = useAuth();
  const { companyId } = useBusiness();
  const queryClient = useQueryClient();

  const handleEnterNav = useEnterNavigation();
  const amountRef = useRef<HTMLInputElement>(null);
  const focusTrapRef = useFocusTrap(open, amountRef);

  const { balance } = getPaymentSummary(totalAmount, paidAmount);
  const maxAllowedAmount = Math.max(0, Number(balance.toFixed(2)));

  const [amount, setAmount] = useState<number>(balance > 0 ? parseFloat(balance.toFixed(2)) : 0);
  const [method, setMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [chequeNumber, setChequeNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [notes, setNotes] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const isOverPayment = amount > maxAllowedAmount;

  // Fetch existing payments for this reference
  const { data: existingPayments } = useQuery({
    queryKey: ["payments-for-ref", referenceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("reference_id", referenceId)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open && !!referenceId,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (amount > maxAllowedAmount) {
        throw new Error(`Amount exceeds balance due (max ₹${maxAllowedAmount.toFixed(2)}).`);
      }
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
      queryClient.invalidateQueries({ queryKey: ["all-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-sales"] });
      queryClient.invalidateQueries({ queryKey: ["payments-purchase"] });
      queryClient.invalidateQueries({ queryKey: ["payments-for-ref", referenceId] });
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

  const deleteMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.from("payments").delete().eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Payment deleted" });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["all-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-sales"] });
      queryClient.invalidateQueries({ queryKey: ["payments-purchase"] });
      queryClient.invalidateQueries({ queryKey: ["payments-for-ref", referenceId] });
      setDeleteConfirmId(null);
    },
    onError: (e: any) => {
      toast({ title: "Failed to delete payment", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={focusTrapRef} className="max-w-lg max-h-[90vh] overflow-y-auto" data-enter-nav onKeyDown={handleEnterNav}>
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

          {/* Existing payments list */}
          {existingPayments && existingPayments.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Payment History</Label>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Method</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      {(isAdmin || isPharmacist) && <TableHead className="text-xs w-10"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {existingPayments.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{format(new Date(p.payment_date), "dd/MM/yy")}</TableCell>
                        <TableCell className="text-xs capitalize">{p.payment_method}</TableCell>
                        <TableCell className="text-xs text-right font-mono text-green-600">₹{Number(p.amount).toFixed(2)}</TableCell>
                        {(isAdmin || isPharmacist) && (
                          <TableCell className="text-xs">
                            {deleteConfirmId === p.id ? (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-6 text-[10px] px-2"
                                  disabled={deleteMutation.isPending}
                                  onClick={() => deleteMutation.mutate(p.id)}
                                >
                                  {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => setDeleteConfirmId(null)}
                                >
                                  No
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteConfirmId(p.id)}
                                title="Delete payment"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label>Amount (₹) *</Label>
              <Input
                ref={amountRef}
                type="number"
                min={0}
                max={maxAllowedAmount || undefined}
                step={0.01}
                value={amount || ""}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                autoFocus
                data-field-required="true"
              />
              <p className={`text-xs ${isOverPayment ? "text-destructive" : "text-muted-foreground"}`}>
                Max allowed: ₹{maxAllowedAmount.toFixed(2)}
                {isOverPayment ? " (entered amount is higher than outstanding balance)" : ""}
              </p>
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
            disabled={!amount || amount <= 0 || mutation.isPending || isOverPayment}
            data-enter-nav-include="true"
          >
            <Banknote className="h-4 w-4 mr-2" />
            {mutation.isPending ? "Saving..." : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
