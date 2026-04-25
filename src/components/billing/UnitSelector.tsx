import { useEffect, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveConversion } from "@/services/unitConversion";

interface UnitSelectorProps {
  companyId: string | null | undefined;
  productId: string | null;
  /** Product's base unit (tablet, ml, pcs). Always selectable. */
  baseUnit: string | null | undefined;
  /** Optional batch — if set, batch-specific conversions are also offered. */
  batchId?: string | null;
  /** Currently selected unit. */
  value: string;
  /**
   * Called when unit changes. Receives both the new unit AND the conversion
   * factor (base units per 1 sold unit). Caller can use the factor to
   * recompute rate, projected stock, etc.
   */
  onChange: (unit: string, factor: number) => void;
  disabled?: boolean;
}

/**
 * Lists every unit the user can sell this product in:
 *   base unit  +  product_conversions.from/to  +  batch_conversions.from/to
 *
 * The dropdown is ALWAYS rendered for a selected product; if no extra units
 * exist it just shows the base unit (no conversion happens).
 */
export function UnitSelector({
  companyId,
  productId,
  baseUnit,
  batchId,
  value,
  onChange,
  disabled,
}: UnitSelectorProps) {
  const fallbackBase = (baseUnit || "pcs").toLowerCase();

  const { data: units } = useQuery({
    queryKey: ["sellable-units", companyId, productId, batchId, fallbackBase],
    queryFn: async () => {
      if (!productId) return [fallbackBase];
      const set = new Set<string>([fallbackBase]);

      const [{ data: prodRows }, batchRowsRes] = await Promise.all([
        supabase
          .from("product_conversions")
          .select("from_unit, to_unit")
          .eq("product_id", productId)
          .eq("is_active", true),
        batchId
          ? supabase
              .from("batch_conversions")
              .select("from_unit, to_unit")
              .eq("batch_id", batchId)
          : Promise.resolve({ data: [] as Array<{ from_unit: string; to_unit: string }> }),
      ]);

      prodRows?.forEach((r) => {
        if (r.from_unit) set.add(r.from_unit.toLowerCase());
        if (r.to_unit) set.add(r.to_unit.toLowerCase());
      });
      (batchRowsRes.data as Array<{ from_unit: string; to_unit: string }> | null)?.forEach((r) => {
        if (r.from_unit) set.add(r.from_unit.toLowerCase());
        if (r.to_unit) set.add(r.to_unit.toLowerCase());
      });
      return Array.from(set);
    },
    enabled: !!productId,
    staleTime: 60000,
  });

  const options = useMemo(() => units ?? [fallbackBase], [units, fallbackBase]);

  // If the selected value is no longer in the list (product changed), snap to base.
  useEffect(() => {
    if (!options.includes(value.toLowerCase())) {
      onChange(fallbackBase);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // Single-unit products: render a passive label-style trigger with a hint
  // so users know where to add pack conversions.
  if (options.length <= 1) {
    return (
      <div
        className="h-9 px-2 inline-flex items-center text-xs rounded-md border bg-muted/40 text-muted-foreground capitalize cursor-help"
        title="Add pack conversions on this product (Products → edit → Pack Conversions) or set Pack Size when receiving inventory to enable Strip/Box selling."
      >
        {fallbackBase}
      </div>
    );
  }

  return (
    <Select value={value.toLowerCase()} onValueChange={(v) => onChange(v)} disabled={disabled}>
      <SelectTrigger
        className="h-9 w-24 text-xs border-primary/40 bg-primary/5"
        data-enter-nav-skip="true"
        tabIndex={-1}
        title="Choose the unit you're selling in (e.g. Strip, Box). Stock auto-converts to base units."
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((u) => (
          <SelectItem key={u} value={u} className="text-xs capitalize">
            {u}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
