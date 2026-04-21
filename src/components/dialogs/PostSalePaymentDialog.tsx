import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Banknote, Plus, Trash2, Loader2, CalendarClock } from "lucide-react";
import { format, addDays } from "date-fns";
import { useEnterNavigation } from "@/hooks/useEnterNavigation";

type PaymentStatus = "paid" | "partial" | "credit";
type SplitMethod = "cash" | "upi" | "bank_transfer" | "cheque" | "card" | "other";

interface Split {
  id: string;
  method: SplitMethod;
  amount: number;
  cheque_number?: string;
  bank_name?: string;
}

export interface PostSalePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesOrderId: string;
  invoiceNumber: string;
  customerName: string;
  totalAmount: number;
  defaultPaymentMethod?: SplitMethod;
  onCompleted?: () => void;
}

const newSplit = (method: SplitMethod, amount: number): Split => ({
  id: crypto.randomUUID(),
  method,
  amount,
});

export function PostSalePaymentDialog({
  open,
  onOpenChange,
  salesOrderId,
  invoiceNumber,
  customerName,
  totalAmount,
  defaultPaymentMethod = "cash",
  onCompleted,
}: PostSalePaymentDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId } = useBusiness();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<PaymentStatus>("paid");
  const [splits, setSplits] = useState<Split[]>([]);
  const [creditPeriod, setCreditPeriod] = useState<number>(15);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [notes, setNotes] = useState("");

  // Reset on open
  useEffect(() => {
    if (open) {
      setStatus("paid");
      setSplits([newSplit(defaultPaymentMethod, parseFloat(totalAmount.toFixed(2)))]);
      setCreditPeriod(15);
      setReminderEnabled(true);
      setNotes("");
    }
  }, [open, totalAmount, defaultPaymentMethod]);

  // When status changes, adjust splits
  useEffect(() => {
    if (status === "paid") {
      // Default to single split = total
      setSplits((prev) => {
        const sum = prev.reduce((s, x) => s + (x.amount || 0), 0);
        if (Math.abs(sum - totalAmount) < 0.01) return prev;
        return [{ ...(prev[0] ?? newSplit(defaultPaymentMethod, 0)), amount: parseFloat(totalAmount.toFixed(2)) }];
      });
    } else if (status === "credit") {
      setSplits([]);
    } else if (status === "partial") {
      setSplits((prev) => (prev.length ? prev : [newSplit(defaultPaymentMethod, parseFloat((totalAmount / 2).toFixed(2)))]));
    }
  }, [status, totalAmount, defaultPaymentMethod]);

  const totalPaid = useMemo(() => splits.reduce((s, x) => s + (Number(x.amount) || 0), 0), [splits]);
  const balance = Math.max(0, totalAmount - totalPaid);
  const dueDate = useMemo(() => (status === "credit" || (status === "partial" && balance > 0)) ? addDays(new Date(), creditPeriod) : null, [status, balance, creditPeriod]);

  const addSplit = () => setSplits((p) => [...p, newSplit("cash", parseFloat(balance.toFixed(2)))]);
  const removeSplit = (id: string) => setSplits((p) => p.filter((s) => s.id !== id));
  const updateSplit = (id: string, patch: Partial<Split>) => setSplits((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const mutation = useMutation({
    mutationFn: async () => {
      // Validate
      if (status === "paid" && Math.abs(totalPaid - totalAmount) > 0.01) {
        throw new Error("Paid amount must equal invoice total. Switch to Partial if amount is less.");
      }
      if (status === "partial" && (totalPaid <= 0 || totalPaid >= totalAmount)) {
        throw new Error("Partial amount must be greater than 0 and less than the total.");
      }
      if (status === "credit" && totalPaid > 0) {
        throw new Error("Credit invoices should have no upfront payment. Switch to Partial.");
      }

      // Insert payment splits (if any)
      if (splits.length > 0 && totalPaid > 0) {
        const rows = splits
          .filter((s) => Number(s.amount) > 0)
          .map((s) => ({
            payment_type: "received" as const,
            reference_type: "sales_order" as const,
            reference_id: salesOrderId,
            reference_number: invoiceNumber,
            party_name: customerName,
            party_type: "customer" as const,
            amount: Number(s.amount),
            payment_method: s.method,
            payment_date: format(new Date(), "yyyy-MM-dd"),
            cheque_number: s.cheque_number || null,
            bank_name: s.bank_name || null,
            notes: notes || null,
            created_by: user?.id,
            company_id: companyId,
          }));
        if (rows.length > 0) {
          const { error } = await supabase.from("payments").insert(rows);
          if (error) throw error;
        }
      }

      // Update sales_orders payment fields
      const updatePayload: {
        payment_status: PaymentStatus;
        amount_paid: number;
        credit_period_days: number | null;
        due_date: string | null;
        reminder_enabled: boolean;
      } = {
        payment_status: status,
        amount_paid: parseFloat(totalPaid.toFixed(2)),
        credit_period_days: status === "paid" ? null : creditPeriod,
        due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
        reminder_enabled: status === "paid" ? false : reminderEnabled,
      };

      const { error: upErr } = await supabase
        .from("sales_orders")
        .update(updatePayload)
        .eq("id", salesOrderId);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["payments-sales"] });
      queryClient.invalidateQueries({ queryKey: ["overdue-invoices"] });
      toast({ title: "Payment recorded", description: status === "credit" ? `Credit invoice — due ${dueDate ? format(dueDate, "dd MMM yyyy") : "later"}` : `Status: ${status}` });
      onOpenChange(false);
      onCompleted?.();
    },
    onError: (e: Error) => toast({ title: "Failed to record payment", description: e.message, variant: "destructive" }),
  });

  const enterNav = useEnterNavigation({ onLastField: () => mutation.mutate() });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Record Payment for {invoiceNumber}
          </DialogTitle>
          <DialogDescription>
            Customer: {customerName} • Total: ₹{totalAmount.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4" data-enter-nav onKeyDown={enterNav}>
          {/* Status selector */}
          <div className="grid grid-cols-3 gap-2">
            {(["paid", "partial", "credit"] as PaymentStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-lg border-2 p-3 text-sm font-medium capitalize transition-all ${
                  status === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {s === "paid" ? "Fully Paid" : s === "partial" ? "Partial" : "Credit"}
              </button>
            ))}
          </div>

          {/* Splits — visible for paid + partial */}
          {status !== "credit" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Payment Splits</Label>
                <Button type="button" size="sm" variant="outline" onClick={addSplit}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Split
                </Button>
              </div>
              <div className="space-y-2">
                {splits.map((s) => (
                  <div key={s.id} className="rounded-md border p-2 space-y-2">
                    <div className="grid grid-cols-[1fr_120px_auto] gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">Method</Label>
                        <Select value={s.method} onValueChange={(v) => updateSplit(s.id, { method: v as SplitMethod })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
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
                        <Label className="text-xs">Amount (₹)</Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={s.amount || ""}
                          onChange={(e) => updateSplit(s.id, { amount: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => removeSplit(s.id)}
                        disabled={splits.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {s.method === "cheque" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Cheque No."
                          value={s.cheque_number || ""}
                          onChange={(e) => updateSplit(s.id, { cheque_number: e.target.value })}
                        />
                        <Input
                          placeholder="Bank Name"
                          value={s.bank_name || ""}
                          onChange={(e) => updateSplit(s.id, { bank_name: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-muted-foreground">Paid: <span className="font-mono text-foreground">₹{totalPaid.toFixed(2)}</span></span>
                <span className="text-muted-foreground">
                  Balance: <span className={`font-mono ${balance > 0.01 ? "text-destructive" : "text-green-600"}`}>₹{balance.toFixed(2)}</span>
                </span>
              </div>
            </div>
          )}

          {/* Credit terms — visible for credit + partial (when there's a balance) */}
          {(status === "credit" || (status === "partial" && balance > 0.01)) && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="h-4 w-4 text-primary" />
                Credit Terms
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Credit Period (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={creditPeriod || ""}
                    onChange={(e) => setCreditPeriod(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Due Date</Label>
                  <Input value={dueDate ? format(dueDate, "dd MMM yyyy") : ""} disabled />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm cursor-pointer">Remind on due date</Label>
                <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any payment notes..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Skip
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-enter-nav-include="true">
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Banknote className="h-4 w-4 mr-2" />}
            Save Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
