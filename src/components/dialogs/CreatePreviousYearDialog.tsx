import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  createPreviousFinancialYear,
  fyNameFromStart,
  previewPreviousYearCounts,
} from "@/services/financialYearService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  onDone: () => void;
}

export function CreatePreviousYearDialog({ open, onOpenChange, companyId, onDone }: Props) {
  const [startDate, setStartDate] = useState("2024-04-01");
  const [endDate, setEndDate] = useState("2025-03-31");
  const [name, setName] = useState("FY 2024-25");
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(fyNameFromStart(startDate));
  }, [startDate]);

  useEffect(() => {
    if (!open) { setCounts(null); return; }
    let cancel = false;
    void previewPreviousYearCounts(companyId, startDate, endDate).then((c) => {
      if (!cancel) setCounts(c);
    }).catch(() => {});
    return () => { cancel = true; };
  }, [open, companyId, startDate, endDate]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await createPreviousFinancialYear({ companyId, name, startDate, endDate });
      toast({
        title: "Previous year created",
        description: `${name} — ${(res.sales_orders_tagged ?? 0)} sales, ${(res.purchase_orders_tagged ?? 0)} purchases, ${(res.payments_tagged ?? 0)} payments tagged.`,
      });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast({
        title: "Failed to create previous year",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create previous financial year</DialogTitle>
          <DialogDescription>
            All untagged transactions dated within this window will be reassigned to the new archived year.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Start date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>End date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        {counts && (
          <div className="rounded-md border p-3 text-sm space-y-1">
            <p className="font-medium">Rows that will be tagged ({total} total):</p>
            <ul className="text-muted-foreground grid grid-cols-2 gap-x-4">
              <li>Sales orders: {counts.sales_orders}</li>
              <li>Purchase orders: {counts.purchase_orders}</li>
              <li>Payments: {counts.payments}</li>
              <li>Journal vouchers: {counts.journal_vouchers}</li>
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
