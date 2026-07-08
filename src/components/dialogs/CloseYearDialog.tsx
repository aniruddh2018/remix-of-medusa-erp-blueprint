import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  closeAndOpenFinancialYear,
  fyNameFromStart,
  nextFyWindow,
  previewCloseCounts,
  type FinancialYear,
} from "@/services/financialYearService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  currentYear: FinancialYear | null;
  onDone: () => void;
}

export function CloseYearDialog({ open, onOpenChange, companyId, currentYear, onDone }: Props) {
  const nextDefault = currentYear
    ? nextFyWindow({ start_date: currentYear.start_date, end_date: currentYear.end_date })
    : { startDate: "2025-04-01", endDate: "2026-03-31" };

  const [startDate, setStartDate] = useState(nextDefault.startDate);
  const [endDate, setEndDate] = useState(nextDefault.endDate);
  const [name, setName] = useState(fyNameFromStart(nextDefault.startDate));
  const [counts, setCounts] = useState<{ ledger_balances: number; stock_batches: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setName(fyNameFromStart(startDate)); }, [startDate]);

  useEffect(() => {
    if (!open) { setCounts(null); return; }
    let cancel = false;
    void previewCloseCounts(companyId).then((c) => { if (!cancel) setCounts(c); }).catch(() => {});
    return () => { cancel = true; };
  }, [open, companyId]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await closeAndOpenFinancialYear({ companyId, name, startDate, endDate });
      toast({
        title: "New financial year opened",
        description: `${name} — ${res.ledger_balances_carried ?? 0} ledgers, ${res.batches_carried ?? 0} stock batches carried forward.`,
      });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast({
        title: "Failed to close year",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close current year & open new year</DialogTitle>
          <DialogDescription>
            {currentYear
              ? `Current active year: ${currentYear.name}. It will be marked closed.`
              : "No active year found. A new active year will be created."}
            {" "}Ledger closing balances and stock on hand carry forward. Invoice numbering resets.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>New start date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>New end date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>New year name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        {counts && (
          <div className="rounded-md border p-3 text-sm space-y-1">
            <p className="font-medium">Will carry forward:</p>
            <ul className="text-muted-foreground grid grid-cols-2 gap-x-4">
              <li>Ledger balances: {counts.ledger_balances}</li>
              <li>Stock batches with qty &gt; 0: {counts.stock_batches}</li>
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Closing…" : "Close & open new year"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
