import { CalendarRange } from "lucide-react";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface FinancialYearSwitcherProps {
  className?: string;
}

export function FinancialYearSwitcher({ className }: FinancialYearSwitcherProps) {
  const { financialYears, activeFinancialYearId, setActiveFinancialYearId } = useBusiness();

  if (financialYears.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <CalendarRange className="h-4 w-4 text-muted-foreground" />
      <Select
        value={activeFinancialYearId ?? undefined}
        onValueChange={(v) => setActiveFinancialYearId(v)}
      >
        <SelectTrigger className="h-9 w-[180px]">
          <SelectValue placeholder="Select FY" />
        </SelectTrigger>
        <SelectContent>
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
