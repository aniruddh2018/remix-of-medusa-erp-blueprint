import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clearConversionCache,
  describeBaseConversion,
  listSellableUnits,
  resolveConversion,
  validateConversionRows,
  type ConversionRow,
} from "@/services/unitConversion";
import { useToast } from "@/hooks/use-toast";

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
   * Called when the unit changes. Receives both the new unit AND the conversion
   * factor (base units per 1 sold/purchased unit). Identity → 1.
   */
  onChange: (unit: string, factor: number) => void;
  /** Live quantity (in the selected unit) used for the "= X base units" helper. */
  quantity?: number;
  disabled?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
}

export interface UnitSelectorHandle {
  focus: () => void;
}

/**
 * Unified unit selector used in Sales, Counter Sales, and Purchase flows.
 * Lists every unit the user can transact this product in (base + product +
 * batch conversions), exposes an "Add New Unit" inline dialog, and emits the
 * resolved conversion factor so callers can recompute rate / projected stock.
 */
export const UnitSelector = forwardRef<UnitSelectorHandle, UnitSelectorProps>(function UnitSelector({
  companyId,
  productId,
  baseUnit,
  batchId,
  value,
  onChange,
  quantity = 1,
  disabled,
  onKeyDown,
}, ref) {
  const { toast } = useToast();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fallbackBase = (baseUnit || "pcs").toLowerCase();
  const [createOpen, setCreateOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitFactor, setNewUnitFactor] = useState<number>(1);
  const [referenceUnit, setReferenceUnit] = useState(fallbackBase);
  const [savingUnit, setSavingUnit] = useState(false);

  const { data: units } = useQuery({
    queryKey: ["sellable-units", companyId, productId, batchId, fallbackBase],
    queryFn: async () => {
      if (!productId || !companyId) return [fallbackBase];
      return listSellableUnits({ companyId, productId, baseUnit: fallbackBase, batchId });
    },
    enabled: !!productId && !!companyId,
    staleTime: 60000,
  });

  const options = useMemo(() => units ?? [fallbackBase], [units, fallbackBase]);

  const { data: helperText } = useQuery({
    queryKey: ["unit-helper", companyId, productId, batchId, value, fallbackBase, quantity],
    queryFn: () => describeBaseConversion({
      companyId,
      productId,
      batchId,
      unit: value || fallbackBase,
      baseUnit: fallbackBase,
      qty: quantity,
    }),
    enabled: !!companyId && !!productId && !!value && quantity > 0,
    staleTime: 30000,
  });

  useImperativeHandle(ref, () => ({
    focus: () => {
      triggerRef.current?.focus();
    },
  }));

  // Resolve conversion to BASE units and emit (unit, factor).
  const emit = async (unit: string) => {
    const u = unit.toLowerCase();
    if (!productId || !companyId || u === fallbackBase) {
      onChange(u, 1);
      return;
    }
    try {
      const conv = await resolveConversion({
        companyId,
        productId,
        batchId: batchId ?? null,
        fromUnit: u,
        toUnit: fallbackBase,
      });
      onChange(u, conv.toBase(1));
    } catch (error: any) {
      onChange(u, 1);
      toast({
        title: "Unit conversion missing",
        description: error?.message || `Define how ${u} converts to ${fallbackBase} first.`,
        variant: "destructive",
      });
    }
  };

  // If the selected value is no longer in the list (product changed), snap to base.
  useEffect(() => {
    if (!options.includes(value.toLowerCase())) {
      onChange(fallbackBase, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  useEffect(() => {
    setReferenceUnit(fallbackBase);
  }, [fallbackBase, productId]);

  const handleCreateUnit = async () => {
    if (!companyId || !productId) return;
    setSavingUnit(true);
    try {
      const unitCode = newUnitName.trim().toLowerCase().replace(/\s+/g, "_");
      if (!unitCode) throw new Error("Unit name is required.");
      if (!Number.isFinite(newUnitFactor) || newUnitFactor <= 0) throw new Error("Conversion must be greater than zero.");
      if (unitCode === referenceUnit.toLowerCase()) throw new Error("New unit cannot reference itself.");

      const { data: existingRows, error: fetchError } = await supabase
        .from("product_conversions")
        .select("from_unit, to_unit, conversion_factor")
        .eq("product_id", productId)
        .eq("is_active", true);
      if (fetchError) throw fetchError;

      const nextRow: ConversionRow = {
        from_unit: unitCode,
        to_unit: referenceUnit.toLowerCase(),
        conversion_factor: newUnitFactor,
      };
      const validation = validateConversionRows([...(existingRows ?? []), nextRow], fallbackBase);
      if (!validation.ok) throw new Error(validation.errors[0]);

      const { error: unitError } = await supabase.from("unit_master").upsert({
        company_id: companyId,
        unit_name: newUnitName.trim(),
        unit_code: unitCode,
        unit_type: "discrete",
        is_system: false,
        is_active: true,
      }, { onConflict: "company_id,unit_code" });
      if (unitError) throw unitError;

      const { error: conversionError } = await supabase.from("product_conversions").upsert({
        company_id: companyId,
        product_id: productId,
        from_unit: unitCode,
        to_unit: referenceUnit.toLowerCase(),
        conversion_factor: newUnitFactor,
        is_active: true,
      }, { onConflict: "product_id,from_unit,to_unit" });
      if (conversionError) throw conversionError;

      clearConversionCache();
      await emit(unitCode);
      setCreateOpen(false);
      setNewUnitName("");
      setNewUnitFactor(1);
      toast({ title: "Unit added", description: `1 ${unitCode} = ${newUnitFactor} ${referenceUnit}` });
    } catch (error: any) {
      toast({ title: "Unit not saved", description: error.message, variant: "destructive" });
    } finally {
      setSavingUnit(false);
    }
  };

  return (
    <div className="space-y-1">
      <Select
        value={value.toLowerCase()}
        onValueChange={(v) => {
          if (v === "__add_unit__") {
            setCreateOpen(true);
            return;
          }
          void emit(v);
        }}
        disabled={disabled}
      >
        <SelectTrigger
          ref={triggerRef}
          className={`h-9 w-24 text-xs ${options.length > 1 ? "border-primary/40 bg-primary/5" : "bg-muted/40 text-muted-foreground"}`}
          data-field-value={value.toLowerCase()}
          onKeyDown={onKeyDown}
          title="Choose the transaction unit. Stock is always converted and stored in the base unit."
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((u) => (
            <SelectItem key={u} value={u} className="text-xs capitalize">
              {u}
            </SelectItem>
          ))}
          {productId && companyId && (
            <SelectItem value="__add_unit__" className="text-xs text-primary">
              + Add New Unit
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {helperText && (
        <p className="text-[10px] text-muted-foreground leading-none whitespace-nowrap">{helperText}</p>
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Unit</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Unit name</Label>
              <Input value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} placeholder="Jar, Pack, Bundle" />
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <div className="space-y-1">
                <Label>1 new unit equals</Label>
                <Input
                  type="number"
                  min={0.000001}
                  step="any"
                  value={newUnitFactor}
                  onChange={(e) => setNewUnitFactor(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label>Unit</Label>
                <Select value={referenceUnit} onValueChange={setReferenceUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {options.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="button" onClick={() => void handleCreateUnit()} disabled={savingUnit || !newUnitName.trim()}>
              Save Unit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

UnitSelector.displayName = "UnitSelector";
