import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileSignature, XCircle, Truck, FlaskConical, CheckCircle2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";
import { generateIrn, cancelIrn, generateEwayBill, cancelEwayBill } from "@/services/gst/einvoice";

type SalesOrder = Tables<"sales_orders">;

interface EInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: SalesOrder;
}

const CANCEL_REASONS = [
  { value: "duplicate", label: "Duplicate entry" },
  { value: "data_entry_mistake", label: "Data entry mistake" },
  { value: "order_cancelled", label: "Order cancelled" },
  { value: "other", label: "Other" },
];

export function EInvoiceDialog({ open, onOpenChange, order }: EInvoiceDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [sellerPincode, setSellerPincode] = useState("");
  const [buyerPincode, setBuyerPincode] = useState("");
  const [cancelReason, setCancelReason] = useState("order_cancelled");
  const [cancelRemarks, setCancelRemarks] = useState("");

  const [transporterId, setTransporterId] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [transportMode, setTransportMode] = useState<"1" | "2" | "3" | "4">("1");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["sales-orders"] });

  const generateMutation = useMutation({
    mutationFn: () => generateIrn(order.id, {
      ...(sellerPincode ? { sellerPincode } : {}),
      ...(buyerPincode ? { buyerPincode } : {}),
    }),
    onSuccess: (r) => {
      toast({ title: r.mock ? "Test e-Invoice generated" : "e-Invoice generated", description: r.mock ? "No live NIC credentials configured — this is a mock IRN for testing." : `IRN: ${r.Irn}` });
      invalidate();
    },
    onError: (e: Error) => toast({ title: "e-Invoice generation failed", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelIrn(order.id, cancelReason, cancelRemarks),
    onSuccess: () => { toast({ title: "e-Invoice cancelled" }); invalidate(); },
    onError: (e: Error) => toast({ title: "Cancel failed", description: e.message, variant: "destructive" }),
  });

  const ewbMutation = useMutation({
    mutationFn: () => generateEwayBill(order.id, {
      transporterId: transporterId || undefined,
      transporterName: transporterName || undefined,
      vehicleNumber: vehicleNumber || undefined,
      distanceKm: distanceKm ? Number(distanceKm) : undefined,
      transportMode,
    }),
    onSuccess: (r) => {
      toast({ title: r.mock ? "Test e-Way Bill generated" : "e-Way Bill generated", description: r.mock ? "Mock e-Way Bill (test mode)." : `EWB: ${r.EwbNo}` });
      invalidate();
    },
    onError: (e: Error) => toast({ title: "e-Way Bill generation failed", description: e.message, variant: "destructive" }),
  });

  const ewbCancelMutation = useMutation({
    mutationFn: () => cancelEwayBill(order.id, cancelReason, cancelRemarks),
    onSuccess: () => { toast({ title: "e-Way Bill cancelled" }); invalidate(); },
    onError: (e: Error) => toast({ title: "Cancel failed", description: e.message, variant: "destructive" }),
  });

  const canCancelIrn = order.einvoice_status === "generated" && order.einvoice_generated_at
    && (Date.now() - new Date(order.einvoice_generated_at).getTime()) < 24 * 3600 * 1000;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5" />GST e-Invoice — {order.invoice_number}</DialogTitle>
          <DialogDescription>Generate an IRN + signed QR code via the GST e-Invoice (NIC) API, and an e-Way Bill for transport.</DialogDescription>
        </DialogHeader>

        {!order.customer_gstin && order.einvoice_status === "not_generated" && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No customer GSTIN</AlertTitle>
            <AlertDescription>e-Invoicing applies to B2B (registered) sales only. Add the customer's GSTIN to this invoice first.</AlertDescription>
          </Alert>
        )}

        {/* ── e-Invoice / IRN ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">e-Invoice (IRN)</h4>
            <StatusBadge status={order.einvoice_status} isMock={order.einvoice_is_mock} />
          </div>

          {order.einvoice_status === "generated" && (
            <div className="grid grid-cols-[1fr_auto] gap-4 items-start bg-muted/30 rounded-md p-3">
              <div className="space-y-1 text-sm">
                <div><span className="text-muted-foreground">IRN:</span> <span className="font-mono text-xs break-all">{order.einvoice_irn}</span></div>
                <div><span className="text-muted-foreground">Ack No:</span> <span className="font-mono text-xs">{order.einvoice_ack_no}</span></div>
                {order.einvoice_ack_date && <div><span className="text-muted-foreground">Ack Date:</span> {format(new Date(order.einvoice_ack_date), "dd MMM yyyy HH:mm")}</div>}
                {order.einvoice_is_mock && <div className="flex items-center gap-1 text-amber-600 text-xs"><FlaskConical className="h-3 w-3" />Test-mode IRN — not a real GST filing</div>}
              </div>
              {order.einvoice_signed_qr_code && (
                <div className="bg-white p-1.5 rounded"><QRCodeSVG value={order.einvoice_signed_qr_code} size={96} level="M" /></div>
              )}
            </div>
          )}

          {order.einvoice_status !== "generated" && order.einvoice_status !== "cancelled" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="seller-pin" className="text-xs">Seller pincode</Label>
                  <Input id="seller-pin" value={sellerPincode} onChange={(e) => setSellerPincode(e.target.value)} placeholder="From company profile" maxLength={6} />
                </div>
                <div>
                  <Label htmlFor="buyer-pin" className="text-xs">Buyer pincode</Label>
                  <Input id="buyer-pin" value={buyerPincode} onChange={(e) => setBuyerPincode(e.target.value)} placeholder="From customer profile" maxLength={6} />
                </div>
              </div>
              {order.einvoice_error && <p className="text-xs text-destructive">{order.einvoice_error}</p>}
              <Button
                size="sm" className="w-full" disabled={generateMutation.isPending || !order.customer_gstin}
                onClick={() => generateMutation.mutate()}
              >
                {generateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSignature className="h-4 w-4 mr-2" />}
                Generate e-Invoice (IRN)
              </Button>
            </>
          )}

          {order.einvoice_status === "generated" && (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <Select value={cancelReason} onValueChange={setCancelReason}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{CANCEL_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
                <Input placeholder="Remarks (optional)" className="h-8 text-xs" value={cancelRemarks} onChange={(e) => setCancelRemarks(e.target.value)} />
              </div>
              <Button
                size="sm" variant="destructive" className="w-full" disabled={!canCancelIrn || cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                {cancelMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                Cancel e-Invoice
              </Button>
              {!canCancelIrn && <p className="text-xs text-muted-foreground text-center">e-Invoices can only be cancelled within 24 hours of generation, per GST rules.</p>}
            </div>
          )}
        </div>

        <Separator />

        {/* ── e-Way Bill ───────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><Truck className="h-4 w-4" />e-Way Bill</h4>
            <StatusBadge status={order.eway_status} isMock={order.eway_is_mock} />
          </div>

          {order.einvoice_status !== "generated" ? (
            <p className="text-xs text-muted-foreground">Generate the e-Invoice (IRN) first — the e-Way Bill is linked to it.</p>
          ) : order.eway_status === "generated" ? (
            <div className="space-y-1 text-sm bg-muted/30 rounded-md p-3">
              <div><span className="text-muted-foreground">e-Way Bill No:</span> <span className="font-mono">{order.eway_bill_no}</span></div>
              {order.eway_valid_till && <div><span className="text-muted-foreground">Valid Till:</span> {format(new Date(order.eway_valid_till), "dd MMM yyyy HH:mm")}</div>}
              {order.eway_is_mock && <div className="flex items-center gap-1 text-amber-600 text-xs"><FlaskConical className="h-3 w-3" />Test-mode e-Way Bill</div>}
              <Button size="sm" variant="destructive" className="w-full mt-2" disabled={ewbCancelMutation.isPending} onClick={() => ewbCancelMutation.mutate()}>
                {ewbCancelMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                Cancel e-Way Bill
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Vehicle number" className="h-8 text-xs" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} />
                <Input placeholder="Distance (km)" type="number" className="h-8 text-xs" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
                <Input placeholder="Transporter ID (GSTIN, optional)" className="h-8 text-xs" value={transporterId} onChange={(e) => setTransporterId(e.target.value)} />
                <Input placeholder="Transporter name (optional)" className="h-8 text-xs" value={transporterName} onChange={(e) => setTransporterName(e.target.value)} />
                <Select value={transportMode} onValueChange={(v: "1" | "2" | "3" | "4") => setTransportMode(v)}>
                  <SelectTrigger className="h-8 text-xs col-span-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Road</SelectItem>
                    <SelectItem value="2">Rail</SelectItem>
                    <SelectItem value="3">Air</SelectItem>
                    <SelectItem value="4">Ship</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {order.eway_error && <p className="text-xs text-destructive">{order.eway_error}</p>}
              <Button size="sm" className="w-full" disabled={ewbMutation.isPending || (!vehicleNumber && !transporterId)} onClick={() => ewbMutation.mutate()}>
                {ewbMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Truck className="h-4 w-4 mr-2" />}
                Generate e-Way Bill
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status, isMock }: { status: string; isMock?: boolean }) {
  if (status === "generated") return <Badge className="gap-1 bg-green-600 hover:bg-green-600"><CheckCircle2 className="h-3 w-3" />{isMock ? "Test Mode" : "Generated"}</Badge>;
  if (status === "cancelled") return <Badge variant="secondary" className="gap-1"><XCircle className="h-3 w-3" />Cancelled</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Failed</Badge>;
  if (status === "pending") return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Pending</Badge>;
  return <Badge variant="outline">Not Generated</Badge>;
}
