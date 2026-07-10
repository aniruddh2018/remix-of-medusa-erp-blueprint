import { CalendarRange, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useBusiness } from "@/contexts/BusinessContext";

interface Props {
  /** If true, only the ACTIVE FY is allowed (stock import). */
  requireActive?: boolean;
}

/**
 * Small header shown in every MARG importer so the user always sees which
 * financial year the rows will land in, and blocks stock imports from being
 * pointed at a past/closed FY.
 */
export function FyImportBadge({ requireActive = false }: Props) {
  const { activeFinancialYear } = useBusiness();

  if (!activeFinancialYear) {
    return (
      <Alert>
        <AlertDescription className="text-xs flex items-center gap-2">
          <CalendarRange className="w-3.5 h-3.5" />
          No financial year selected — rows will be imported without a FY tag.
        </AlertDescription>
      </Alert>
    );
  }

  const isActive = activeFinancialYear.status === "active";

  if (requireActive && !isActive) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="text-xs flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          Stock import is only allowed in the <strong>current (active)</strong> financial year.
          Switch back to your active FY from the top-bar switcher.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-md border bg-muted/30">
      <CalendarRange className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">Importing into</span>
      <strong>{activeFinancialYear.name}</strong>
      <Badge variant={isActive ? "default" : "secondary"} className="capitalize text-[10px]">
        {activeFinancialYear.status}
      </Badge>
      <span className="text-muted-foreground">
        · {activeFinancialYear.start_date} → {activeFinancialYear.end_date}
      </span>
    </div>
  );
}
