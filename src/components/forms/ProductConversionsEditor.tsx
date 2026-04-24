/**
 * Product-level conversion editor.
 * Shown inside ProductFormDialog as a separate sub-section.
 *
 * Stores rows as (from_unit, to_unit, conversion_factor) — integer factor only.
 * The smallest unit the product can be split into is the "base unit" set on the
 * product itself; rows here describe how to convert FROM larger units TO it.
 *
 * Example for a tablet product (base = tablet):
 *   strip → tablet  | 10
 *   box   → strip   | 10   (multi-step: Box → Strip → Tablet resolves automatically)
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { clearConversionCache } from "@/services/unitConversion";

interface Conversion {
  id?: string;
  from_unit: string;
  to_unit: string;
  conversion_factor: number;
}

interface UnitOption {
  unit_code: string;
  unit_name: string;
}

interface Props {
  productId: string;
  companyId: string;
  baseUnit: string;
}

export function ProductConversionsEditor({ productId, companyId, baseUnit }: Props) {
  const { toast } = useToast();
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [rows, setRows] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: u }, { data: c }] = await Promise.all([
        supabase
          .from("unit_master")
          .select("unit_code, unit_name")
          .or(`is_system.eq.true,company_id.eq.${companyId}`)
          .eq("is_active", true)
          .order("unit_name"),
        supabase
          .from("product_conversions")
          .select("id, from_unit, to_unit, conversion_factor")
          .eq("product_id", productId)
          .eq("is_active", true)
          .order("created_at"),
      ]);
      if (cancelled) return;
      setUnits((u as UnitOption[]) ?? []);
      setRows((c as Conversion[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, companyId]);

  const addRow = () =>
    setRows((r) => [
      ...r,
      { from_unit: "", to_unit: baseUnit, conversion_factor: 10 },
    ]);

  const removeRow = async (idx: number) => {
    const row = rows[idx];
    if (row.id) {
      const { error } = await supabase.from("product_conversions").delete().eq("id", row.id);
      if (error) {
        toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
        return;
      }
    }
    setRows((r) => r.filter((_, i) => i !== idx));
    clearConversionCache();
  };

  const updateRow = (idx: number, patch: Partial<Conversion>) => {
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // Validate: integer factors > 0, no duplicates, no self-mapping
      const seen = new Set<string>();
      for (const r of rows) {
        if (!r.from_unit || !r.to_unit) throw new Error("Both From and To units are required.");
        if (r.from_unit.toLowerCase() === r.to_unit.toLowerCase()) throw new Error("From and To must differ.");
        if (!Number.isInteger(r.conversion_factor) || r.conversion_factor <= 0) {
          throw new Error("Conversion factor must be a positive integer.");
        }
        const key = `${r.from_unit.toLowerCase()}->${r.to_unit.toLowerCase()}`;
        if (seen.has(key)) throw new Error(`Duplicate conversion: ${key}`);
        seen.add(key);
      }
      // Upsert each row (idempotent on the unique constraint)
      const payload = rows.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        company_id: companyId,
        product_id: productId,
        from_unit: r.from_unit.toLowerCase(),
        to_unit: r.to_unit.toLowerCase(),
        conversion_factor: r.conversion_factor,
        is_active: true,
      }));
      const { error } = await supabase
        .from("product_conversions")
        .upsert(payload, { onConflict: "product_id,from_unit,to_unit" });
      if (error) throw error;
      clearConversionCache();
      toast({ title: "Conversions saved" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading conversions…
      </div>
    );
  }

  return (
    <div className="space-y-3 border rounded-md p-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Pack Conversions</h4>
          <p className="text-xs text-muted-foreground">
            Base unit: <span className="font-mono">{baseUnit}</span> · e.g. 1 Box = 10 Strips, 1 Strip = 10 Tablets
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No pack conversions defined. Stock will be tracked in <span className="font-mono">{baseUnit}</span> only.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4">
                <Label className="text-xs">From</Label>
                <Select value={row.from_unit} onValueChange={(v) => updateRow(idx, { from_unit: v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="e.g. strip" /></SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.unit_code} value={u.unit_code}>
                        {u.unit_name} ({u.unit_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 text-center text-xs text-muted-foreground pb-2">=</div>
              <div className="col-span-2">
                <Label className="text-xs">Factor</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={row.conversion_factor}
                  onChange={(e) => updateRow(idx, { conversion_factor: parseInt(e.target.value, 10) || 0 })}
                  className="h-8"
                />
              </div>
              <div className="col-span-4">
                <Label className="text-xs">To</Label>
                <Select value={row.to_unit} onValueChange={(v) => updateRow(idx, { to_unit: v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="e.g. tablet" /></SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.unit_code} value={u.unit_code}>
                        {u.unit_name} ({u.unit_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => removeRow(idx)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button type="button" size="sm" onClick={saveAll} disabled={saving || rows.length === 0}>
          {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Save Conversions
        </Button>
      </div>
    </div>
  );
}
