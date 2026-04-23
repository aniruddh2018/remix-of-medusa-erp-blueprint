import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ConfigurableFormField } from "@/components/ConfigurableFormField";
import { useFormConfig, useBusinessRules, evaluateAllRules } from "@/hooks/useFormConfig";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from "lucide-react";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Product = Tables<"products">;

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (productId: string) => void;
  /** When provided, the form opens in edit mode for this product. */
  editingProduct?: Product | null;
}

// Pharma-only product fields hidden for non-pharma businesses
const PHARMA_ONLY_FIELDS = new Set([
  "generic_name",
  "composition",
  "strength",
  "drug_schedule",
  "hsn_code",
]);

// Numeric product columns — empty strings must become null/0 before insert
const NUMERIC_KEYS = new Set([
  "mrp", "purchase_price", "sale_price", "gst_percentage",
  "min_stock_level", "max_stock_level", "reorder_level",
]);

// Enum-typed product columns and their fallback when blank
const ENUM_DEFAULTS: Record<string, string> = {
  drug_schedule: "none",
};

export function ProductFormDialog({ open, onOpenChange, onSuccess, editingProduct }: ProductFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { companyId, config: businessConfig } = useBusiness();
  const { fields: rawFields, sections, uiOverrides, layout } = useFormConfig("products");
  const rules = useBusinessRules("products");
  const [formData, setFormData] = useState<Record<string, any>>({});

  // Tailor field set + unit options to the active business type
  const fields = useMemo(() => {
    const isPharma = businessConfig.hasGenericName || businessConfig.hasComposition || businessConfig.hasDrugSchedule;
    return rawFields
      .filter((f) => {
        if (!isPharma && PHARMA_ONLY_FIELDS.has(f.key)) {
          // hsn_code is still useful for general trading (GST-bearing items) — keep it there
          if (f.key === "hsn_code") return true;
          return false;
        }
        if (f.key === "generic_name" && !businessConfig.hasGenericName) return false;
        if (f.key === "composition" && !businessConfig.hasComposition) return false;
        if (f.key === "strength" && !businessConfig.hasStrength) return false;
        if (f.key === "drug_schedule" && !businessConfig.hasDrugSchedule) return false;
        return true;
      })
      .map((f) => {
        if (f.key === "unit" && businessConfig.units?.length) {
          return { ...f, options: businessConfig.units, defaultValue: f.defaultValue ?? businessConfig.units[0]?.value };
        }
        return f;
      });
  }, [rawFields, businessConfig]);

  useEffect(() => {
    if (!open) return;
    if (editingProduct) {
      const data: Record<string, any> = {};
      fields.forEach((f) => {
        data[f.key] = (editingProduct as any)[f.key] ?? f.defaultValue ?? "";
      });
      setFormData(data);
    } else {
      const data: Record<string, any> = {};
      fields.forEach((f) => {
        data[f.key] = f.defaultValue ?? (f.type === "switch" ? true : "");
      });
      setFormData(data);
    }
  }, [open, fields, editingProduct]);

  const ruleResult = evaluateAllRules(rules, formData);

  useEffect(() => {
    if (Object.keys(ruleResult.autoValues).length > 0) {
      setFormData((prev) => ({ ...prev, ...ruleResult.autoValues }));
    }
  }, [JSON.stringify(ruleResult.autoValues)]);

  const handleChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const invalidateProductQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["products-active"] });
    queryClient.invalidateQueries({ queryKey: ["products-for-sale"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const { data: product, error } = await supabase
        .from("products")
        .insert({ ...data, company_id: companyId } as TablesInsert<"products">)
        .select()
        .single();
      if (error) throw error;
      return product;
    },
    onSuccess: (product) => {
      invalidateProductQueries();
      toast({ title: uiOverrides.successMessage || "Product created successfully" });
      onOpenChange(false);
      onSuccess?.(product.id);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const { data: product, error } = await supabase
        .from("products")
        .update(data as TablesUpdate<"products">)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return product;
    },
    onSuccess: (product) => {
      invalidateProductQueries();
      toast({ title: uiOverrides.successMessage || "Product updated successfully" });
      onOpenChange(false);
      onSuccess?.(product.id);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (ruleResult.blockSubmit) {
      toast({ title: "Cannot submit", description: ruleResult.blockMessages.join(", "), variant: "destructive" });
      return;
    }

    for (const field of fields) {
      const isRequired = field.required || ruleResult.requiredFields.has(field.key);
      const isOptional = ruleResult.optionalFields.has(field.key);
      if (isRequired && !isOptional && !formData[field.key] && formData[field.key] !== false && formData[field.key] !== 0) {
        toast({ title: `Please enter ${field.label}`, variant: "destructive" });
        return;
      }
    }

    const submitData = { ...formData };
    ruleResult.hiddenFields.forEach((key) => delete submitData[key]);

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const visibleFields = fields.filter((f) => !ruleResult.hiddenFields.has(f.key));

  const gridClass = layout.columns === 3
    ? "grid-cols-1 md:grid-cols-3"
    : layout.columns === 1
    ? "grid-cols-1"
    : "grid-cols-1 md:grid-cols-2";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {uiOverrides.formTitle || (editingProduct ? "Edit Product" : "Add New Product")}
          </DialogTitle>
          {(uiOverrides.formDescription || editingProduct) && (
            <DialogDescription>
              {uiOverrides.formDescription || "Update product information"}
            </DialogDescription>
          )}
        </DialogHeader>

        {ruleResult.alerts.length > 0 && (
          <div className="space-y-2">
            {ruleResult.alerts.map((msg, i) => (
              <Alert key={i} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{msg}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" data-enter-nav>
          {sections.length > 0 ? (
            sections.map((section) => {
              const sectionFields = visibleFields.filter(
                (f) => f.section === section.key || (!f.section && section.order === 1)
              );
              if (sectionFields.length === 0) return null;
              return (
                <div key={section.key}>
                  {sections.length > 1 && (
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">{section.label}</h3>
                  )}
                  <div className={`grid ${gridClass} gap-4`}>
                    {sectionFields.map((field) => (
                      <div key={field.key} className={field.width === "full" ? "col-span-full" : ""}>
                        <ConfigurableFormField
                          field={field}
                          value={formData[field.key]}
                          onChange={handleChange}
                          disabled={isSubmitting}
                          overrideRequired={
                            ruleResult.requiredFields.has(field.key)
                              ? true
                              : ruleResult.optionalFields.has(field.key)
                              ? false
                              : undefined
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className={`grid ${gridClass} gap-4`}>
              {visibleFields.map((field) => (
                <div key={field.key} className={field.width === "full" ? "col-span-full" : ""}>
                  <ConfigurableFormField
                    field={field}
                    value={formData[field.key]}
                    onChange={handleChange}
                    disabled={isSubmitting}
                  />
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {uiOverrides.cancelButtonText || "Cancel"}
            </Button>
            <Button type="submit" disabled={isSubmitting || ruleResult.blockSubmit} data-enter-nav-include="true">
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {uiOverrides.submitButtonText || (editingProduct ? "Update Product" : "Add Product")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
