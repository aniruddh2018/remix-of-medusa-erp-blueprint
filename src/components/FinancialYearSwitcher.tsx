import { CalendarRange } from "lucide-react";
import { useMemo } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fyNameFromStart } from "@/services/financialYearService";

interface FinancialYearSwitcherProps {
  className?: string;
}

const CURRENT_FY_SENTINEL = "__current_fy__";

function computeCurrentFyLabel(): string {
  const now = new Date();
  const y = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return fyNameFromStart(`${y}-04-01`);
}

export function FinancialYearSwitcher({ className }: FinancialYearSwitcherProps) {
  const { financialYears, activeFinancialYearId, setActiveFinancialYearId } = useBusiness();

  const hasActive = useMemo(
    () => financialYears.some((fy) => fy.status === "active"),
    [financialYears],
  );
  const currentLabel = useMemo(computeCurrentFyLabel, []);

  const selectValue = activeFinancialYearId ?? (hasActive ? undefined : CURRENT_FY_SENTINEL);

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <CalendarRange className="h-4 w-4 text-muted-foreground" />
      <Select
        value={selectValue}
        onValueChange={(v) =>
          setActiveFinancialYearId(v === CURRENT_FY_SENTINEL ? null : v)
        }
      >
        <SelectTrigger className="h-9 w-[200px]">
          <SelectValue placeholder="Select FY" />
        </SelectTrigger>
        <SelectContent>
          {!hasActive && (
            <SelectItem value={CURRENT_FY_SENTINEL}>
              <span className="flex items-center gap-2">
                <span>{currentLabel}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  current
                </Badge>
              </span>
            </SelectItem>
          )}
          {financialYears.map((fy) => (
            <SelectItem key={fy.id} value={fy.id}>
              <span className="flex items-center gap-2">
                <span>{fy.name}</span>
                {fy.status !== "active" && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                    {fy.status}
                  </Badge>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
