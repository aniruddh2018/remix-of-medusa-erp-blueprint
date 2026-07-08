import { useEffect, useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/PageHeader";
import { Archive, CalendarClock, Plus } from "lucide-react";
import {
  type FinancialYear,
  getActiveFinancialYear,
  listFinancialYears,
} from "@/services/financialYearService";
import { CreatePreviousYearDialog } from "@/components/dialogs/CreatePreviousYearDialog";
import { CloseYearDialog } from "@/components/dialogs/CloseYearDialog";

export default function FinancialYearManagement() {
  const { companyId } = useBusiness();
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [active, setActive] = useState<FinancialYear | null>(null);
  const [loading, setLoading] = useState(true);
  const [openPrev, setOpenPrev] = useState(false);
  const [openClose, setOpenClose] = useState(false);

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [all, act] = await Promise.all([
        listFinancialYears(companyId),
        getActiveFinancialYear(companyId),
      ]);
      setYears(all);
      setActive(act);
    } catch (e) {
      toast({
        title: "Failed to load financial years",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const statusVariant = (s: FinancialYear["status"]) =>
    s === "active" ? "default" : s === "closed" ? "secondary" : "outline";

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Financial Year"
        description="Manage year-end closure, carry forward balances and stock, and archive historical transactions."
      />

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setOpenPrev(true)} disabled={!companyId}>
          <Archive className="h-4 w-4 mr-2" />
          Create previous year
        </Button>
        <Button onClick={() => setOpenClose(true)} disabled={!companyId || !active}>
          <CalendarClock className="h-4 w-4 mr-2" />
          Close current & open new year
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" /> Financial Years
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : years.length === 0 ? (
            <p className="text-sm text-muted-foreground">No financial years yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Closed at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {years.map((y) => (
                  <TableRow key={y.id}>
                    <TableCell className="font-medium">{y.name}</TableCell>
                    <TableCell>{y.start_date}</TableCell>
                    <TableCell>{y.end_date}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(y.status)}>{y.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {y.closed_at ? new Date(y.closed_at).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {companyId && (
        <>
          <CreatePreviousYearDialog
            open={openPrev}
            onOpenChange={setOpenPrev}
            companyId={companyId}
            onDone={reload}
          />
          <CloseYearDialog
            open={openClose}
            onOpenChange={setOpenClose}
            companyId={companyId}
            currentYear={active}
            onDone={reload}
          />
        </>
      )}
    </div>
  );
}
