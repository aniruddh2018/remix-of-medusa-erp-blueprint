import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useOverdueInvoices } from "@/hooks/useOverdueInvoices";
import { format, differenceInDays } from "date-fns";

export function OverdueInvoicesCard() {
  const navigate = useNavigate();
  const { data: overdue, isLoading } = useOverdueInvoices();

  if (isLoading || !overdue || overdue.length === 0) return null;

  const totalDue = overdue.reduce((s, o) => s + (Number(o.total_amount) - Number(o.amount_paid || 0)), 0);

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Overdue Credit Invoices
          </span>
          <Badge variant="destructive">{overdue.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Total outstanding: <span className="font-semibold text-destructive font-mono">₹{totalDue.toFixed(2)}</span>
        </p>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {overdue.slice(0, 8).map((inv) => {
            const days = differenceInDays(new Date(), new Date(inv.due_date));
            const balance = Number(inv.total_amount) - Number(inv.amount_paid || 0);
            return (
              <button
                key={inv.id}
                onClick={() => navigate("/sales")}
                className="w-full flex items-center justify-between gap-2 rounded-md bg-background p-2 text-left text-xs hover:bg-muted transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{inv.customer_name}</div>
                  <div className="text-muted-foreground">{inv.invoice_number} • Due {format(new Date(inv.due_date), "dd MMM")}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-semibold text-destructive">₹{balance.toFixed(0)}</div>
                  <div className="text-[10px] text-muted-foreground">{days}d overdue</div>
                </div>
              </button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/sales")}>
          View All <ArrowUpRight className="h-3 w-3 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
