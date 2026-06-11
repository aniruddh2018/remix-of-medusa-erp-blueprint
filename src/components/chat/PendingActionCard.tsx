import { useState } from "react";
import { Check, X, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type PendingActionStatus = "pending" | "executed" | "rejected" | "failed";

export interface PendingActionCardProps {
  pendingActionId: string;
  tool: string;
  preview: any;
  initialStatus?: PendingActionStatus;
  onResolved?: (status: PendingActionStatus, output?: any) => void;
  canMutate: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  upsert_customer: "Customer",
  upsert_supplier: "Supplier",
  upsert_doctor: "Doctor",
  create_product: "Product",
  record_payment: "Payment",
};

function INR(n: number) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Row({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-3 py-1 text-sm border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{String(value)}</span>
    </div>
  );
}

function PreviewBody({ tool, preview }: { tool: string; preview: any }) {
  if (!preview) return <p className="text-sm text-muted-foreground">No preview available.</p>;

  if (preview.kind === "create_customer" || preview.kind === "create_supplier" || preview.kind === "create_doctor") {
    const d = preview.new;
    return (
      <div>
        <Badge variant="secondary" className="mb-2">Create new</Badge>
        <Row label="Name" value={d.name} />
        <Row label="Phone" value={d.phone} />
        <Row label="Contact" value={d.contact_person} />
        <Row label="Email" value={d.email} />
        <Row label="GSTIN" value={d.gst_number} />
        <Row label="Address" value={d.address} />
        <Row label="Reg. No." value={d.registration_number} />
        <Row label="Speciality" value={d.speciality} />
        <Row label="Drug Lic." value={d.drug_license_number} />
        {preview.possible_duplicates?.length ? (
          <div className="mt-3 p-2 rounded bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
              <AlertTriangle className="h-3.5 w-3.5" /> {preview.possible_duplicates.length} possible duplicate(s)
            </div>
            <ul className="text-xs space-y-0.5">
              {preview.possible_duplicates.slice(0, 3).map((d: any) => (
                <li key={d.id}>• {d.name}{d.phone ? ` (${d.phone})` : ""}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  if (preview.kind === "update_customer" || preview.kind === "update_supplier" || preview.kind === "update_doctor") {
    const before = preview.before || {};
    const after = preview.after || {};
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(k => k !== "id");
    return (
      <div>
        <Badge variant="secondary" className="mb-2">Update existing</Badge>
        {keys.map(k => {
          const a = (before as any)[k];
          const b = (after as any)[k];
          if (a === b || (a == null && b == null)) return null;
          return (
            <div key={k} className="py-1 text-sm border-b border-border/40 last:border-0">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="flex gap-2 items-center text-sm">
                <span className="line-through text-muted-foreground">{a ?? "—"}</span>
                <span>→</span>
                <span className="font-medium">{b ?? "—"}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (preview.kind === "create_product") {
    const d = preview.new;
    return (
      <div>
        <Badge variant="secondary" className="mb-2">Create product</Badge>
        <Row label="Name" value={d.name} />
        <Row label="Manufacturer" value={d.manufacturer} />
        <Row label="MRP" value={INR(d.mrp)} />
        <Row label="Purchase" value={INR(d.purchase_price)} />
        <Row label="GST %" value={d.gst_percentage} />
        <Row label="HSN" value={d.hsn_code} />
        <Row label="Unit" value={d.unit} />
        <Row label="Category" value={d.category} />
        <Row label="Strength" value={d.strength} />
        {preview.possible_duplicates?.length ? (
          <div className="mt-3 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 inline mr-1" /> {preview.possible_duplicates.length} similar product(s) already exist.
          </div>
        ) : null}
      </div>
    );
  }

  if (preview.kind === "record_payment") {
    const p = preview.payment;
    const r = preview.reference;
    return (
      <div>
        <Badge variant="secondary" className="mb-2">
          {p.payment_type === "received" ? "Receive payment" : "Make payment"}
        </Badge>
        <Row label="From / To" value={`${p.party_name} (${p.party_type})`} />
        <Row label="Against" value={p.reference_number} />
        <Row label="Amount" value={INR(p.amount)} />
        <Row label="Method" value={p.payment_method} />
        <Row label="Date" value={p.payment_date} />
        {p.cheque_number && <Row label="Cheque" value={p.cheque_number} />}
        {p.bank_name && <Row label="Bank" value={p.bank_name} />}
        {p.notes && <Row label="Notes" value={p.notes} />}
        {r && (
          <div className="mt-3 p-2 rounded bg-muted/50 border border-border/50 text-xs space-y-0.5">
            <div className="flex justify-between"><span>Invoice total</span><span>{INR(r.total)}</span></div>
            <div className="flex justify-between"><span>Already paid</span><span>{INR(r.paid)}</span></div>
            <div className="flex justify-between"><span>Balance now</span><span>{INR(r.balance)}</span></div>
            <div className="flex justify-between font-medium text-foreground">
              <span>Balance after</span>
              <span className={r.new_balance < -0.01 ? "text-amber-600" : ""}>{INR(r.new_balance)}</span>
            </div>
            {r.overpay && (
              <div className="text-amber-700 dark:text-amber-400 flex items-center gap-1 pt-1">
                <AlertTriangle className="h-3 w-3" /> Overpayment — exceeds current balance.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return <pre className="text-xs bg-muted/40 p-2 rounded overflow-auto max-h-60">{JSON.stringify(preview, null, 2)}</pre>;
}

export function PendingActionCard({
  pendingActionId, tool, preview,
  initialStatus = "pending", onResolved, canMutate,
}: PendingActionCardProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<PendingActionStatus>(initialStatus);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const isResolved = status !== "pending";

  const act = async (kind: "approve" | "reject") => {
    setBusy(kind);
    try {
      const { data, error } = await supabase.functions.invoke("action-agent", {
        body: { action: kind, pending_action_id: pendingActionId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const newStatus: PendingActionStatus =
        kind === "reject" ? "rejected" : (data?.status === "executed" ? "executed" : "failed");
      setStatus(newStatus);
      onResolved?.(newStatus, data?.output);
      toast({
        title: kind === "approve"
          ? (newStatus === "executed" ? "Action approved & executed" : "Action failed")
          : "Action cancelled",
        description: newStatus === "failed" ? (data?.error || "Database error") : undefined,
        variant: newStatus === "failed" ? "destructive" : "default",
      });
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const label = TOOL_LABELS[tool] || tool;

  return (
    <Card className={`my-2 border-l-4 ${
      status === "executed" ? "border-l-emerald-500" :
      status === "rejected" || status === "failed" ? "border-l-rose-500" :
      "border-l-primary"
    }`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Confirm {label}
          </div>
          {status === "executed" && <Badge variant="default" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">Done</Badge>}
          {status === "rejected" && <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>}
          {status === "failed" && <Badge variant="destructive">Failed</Badge>}
          {status === "pending" && <Badge variant="outline">Awaiting approval</Badge>}
        </div>

        <PreviewBody tool={tool} preview={preview} />

        {!isResolved && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm" className="flex-1" disabled={!canMutate || !!busy}
              onClick={() => act("approve")}
            >
              {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirm
            </Button>
            <Button
              size="sm" variant="outline" className="flex-1" disabled={!!busy}
              onClick={() => act("reject")}
            >
              {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Cancel
            </Button>
          </div>
        )}
        {!canMutate && !isResolved && (
          <p className="text-xs text-muted-foreground">You need admin or pharmacist role to approve.</p>
        )}
      </CardContent>
    </Card>
  );
}
