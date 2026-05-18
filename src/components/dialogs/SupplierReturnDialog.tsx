import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RotateCcw } from "lucide-react";
import { format } from "date-fns";

export interface SupplierReturnBatch {
  id: string;
  batch_number: string;
  quantity: number;
  expiry_date: string | null;
  purchase_price: number;
  mrp: number;
  product_id: string;
  product_name: string;
  manufacturer?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batch: SupplierReturnBatch | null;
  onSuccess?: () => void;
}

const REASONS = ["Expired", "Near Expiry", "Damaged", "Excess Stock", "Quality Issue", "Wrong Product", "Other"];

export function SupplierReturnDialog({ open, onOpenChange, batch, onSuccess }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId } = useBusiness();
  const queryClient = useQueryClient();

  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState<string>("Expired");
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [debitNoteNumber, setDebitNoteNumber] = useState<string>("");

  const qtyRef = useRef<HTMLInputElement>(null);

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-active", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (open && batch) {
      setQuantity(String(batch.quantity));
      const expired = batch.expiry_date && new Date(batch.expiry_date) < new Date();
      setReason(expired ? "Expired" : "Damaged");
      setSupplierId(batch.supplier_id || "");
      setSupplierName(batch.supplier_name || "");
      setNotes("");
      setDebitNoteNumber(`DN-${Date.now()}`);
      setTimeout(() => {
        qtyRef.current?.focus();
        qtyRef.current?.select();
      }, 80);
    }
  }, [open, batch]);

  // Ctrl+Enter submit
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!mutation.isPending) mutation.mutate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quantity, reason, supplierId, supplierName, notes, debitNoteNumber, batch]);

  const handleSupplierChange = (id: string) => {
    setSupplierId(id);
    const s = suppliers?.find((x) => x.id === id);
    if (s) setSupplierName(s.name);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!batch) throw new Error("No batch selected");
      const qty = parseInt(quantity, 10);
      if (!qty || qty <= 0 || qty > batch.quantity) {
        throw new Error(`Enter a valid quantity (1 - ${batch.quantity})`);
      }
      const finalSupplierName = supplierName.trim() || "Unknown Supplier";
      const finalSupplierId = supplierId || null;
      const finalDnNumber = debitNoteNumber.trim() || `DN-${Date.now()}`;
      const totalValue = qty * Number(batch.purchase_price);

      const { createDebitNoteLocal } = await import("@/offline/purchases/createDebitNoteLocal");
      const dn = await createDebitNoteLocal({
        companyId: companyId!,
        userId: user?.id || null,
        deductStock: true,
        header: {
          debit_note_number: finalDnNumber,
          original_order_id: null,
          original_order_number: `BATCH-${batch.batch_number}`,
          supplier_id: finalSupplierId,
          supplier_name: finalSupplierName,
          reason,
          notes:
            notes ||
            `Return of batch ${batch.batch_number}${
              batch.expiry_date ? ` (expiry ${format(new Date(batch.expiry_date), "MMM yyyy")})` : ""
            }`,
          total_amount: totalValue,
          gst_amount: 0,
          status: "issued",
        },
        items: [
          {
            product_id: batch.product_id,
            batch_id: batch.id,
            product_name: batch.product_name,
            batch_number: batch.batch_number,
            quantity: qty,
            unit_price: Number(batch.purchase_price),
            gst_percentage: 0,
            discount_percentage: 0,
            total_price: totalValue,
          },
        ],
      });

      return { dn, qty };
    },
    onSuccess: ({ qty }) => {
      toast({
        title: "Return Processed",
        description: `Returned ${qty} units to ${supplierName || "supplier"}. Debit note ${debitNoteNumber} created.`,
      });
      queryClient.invalidateQueries({ queryKey: ["debit-notes"] });
      queryClient.invalidateQueries({ queryKey: ["expiry-items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast({ title: "Return failed", description: e.message, variant: "destructive" });
    },
  });

  if (!batch) return null;
  const qtyNum = parseInt(quantity, 10) || 0;
  const totalValue = qtyNum * Number(batch.purchase_price);
  const expired = batch.expiry_date && new Date(batch.expiry_date) < new Date();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" /> Return Batch to Supplier
          </DialogTitle>
          <DialogDescription>
            Auto-creates a debit note and reduces stock. Press <kbd className="px-1 border rounded text-xs">Ctrl+Enter</kbd> to confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="font-medium">{batch.product_name}</div>
            {batch.manufacturer && <div className="text-xs text-muted-foreground">{batch.manufacturer}</div>}
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <span><strong>Batch:</strong> <span className="font-mono">{batch.batch_number}</span></span>
              <span><strong>Available:</strong> {batch.quantity}</span>
              {batch.expiry_date && (
                <span>
                  <strong>Expiry:</strong> {format(new Date(batch.expiry_date), "MMM yyyy")}
                  {expired && <Badge variant="destructive" className="ml-1">Expired</Badge>}
                </span>
              )}
              <span><strong>Cost ₹:</strong> {Number(batch.purchase_price).toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ret-qty">Return Quantity *</Label>
              <Input
                id="ret-qty"
                ref={qtyRef}
                type="number"
                min={1}
                max={batch.quantity}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ret-reason">Reason *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="ret-reason"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ret-dn">Debit Note # *</Label>
              <Input id="ret-dn" value={debitNoteNumber} onChange={(e) => setDebitNoteNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ret-supplier">Supplier</Label>
              <Select value={supplierId} onValueChange={handleSupplierChange}>
                <SelectTrigger id="ret-supplier">
                  <SelectValue placeholder={supplierName || "Choose supplier..."} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="ret-notes">Notes (optional)</Label>
            <Textarea id="ret-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any extra detail to record on the debit note..." />
          </div>

          <div className="flex justify-between items-center bg-muted/40 p-2 rounded text-sm">
            <span className="text-muted-foreground">Estimated debit value:</span>
            <span className="font-mono font-semibold">₹{totalValue.toFixed(2)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !quantity || !reason}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
            Confirm Return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
