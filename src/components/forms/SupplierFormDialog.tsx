import { useState, useEffect } from "react";
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

type Supplier = Tables<"suppliers">;

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSupplier?: Supplier | null;
  onSuccess?: (supplierId: string) => void;
}

export function SupplierFormDialog({
  open,
  onOpenChange,
  editingSupplier,
  onSuccess,
}: SupplierFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { companyId } = useBusiness();
  const { fields, sections, uiOverrides, layout } = useFormConfig("suppliers");
  const rules = useBusinessRules("suppliers");
  const [formData, setFormData] = useState<Record<string, any>>({});

  useEffect(() => {
    if (editingSupplier) {
      const data: Record<string, any> = {};
      fields.forEach((f) => {
        data[f.key] = (editingSupplier as any)[f.key] ?? f.defaultValue ?? "";
      });
      setFormData(data);
    } else if (open) {
      const data: Record<string, any> = {};
      fields.forEach((f) => {
        data[f.key] = f.defaultValue ?? (f.type === "switch" ? true : "");
      });
      setFormData(data);
    }
  }, [editingSupplier, open, fields]);

  // Evaluate rules
  const ruleResult = evaluateAllRules(rules, formData);

  // Apply auto values from rules
  useEffect(() => {
    if (Object.keys(ruleResult.autoValues).length > 0) {
      setFormData((prev) => ({ ...prev, ...ruleResult.autoValues }));
    }
  }, [JSON.stringify(ruleResult.autoValues)]);

  const handleChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const { data: supplier, error } = await supabase
        .from("suppliers")
        .insert({ ...data, company_id: companyId } as TablesInsert<"suppliers">)
        .select()
        .single();
      if (error) throw error;
      return supplier;
    },
    onSuccess: (supplier) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-active"] });
      toast({ title: uiOverrides.successMessage || "Supplier created successfully" });
      onOpenChange(false);
      onSuccess?.(supplier.id);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const { data: supplier, error } = await supabase
        .from("suppliers")
        .update(data as TablesUpdate<"suppliers">)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return supplier;
    },
    onSuccess: (supplier) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-active"] });
      toast({ title: uiOverrides.successMessage || "Supplier updated successfully" });
      onOpenChange(false);
      onSuccess?.(supplier.id);
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

    // Validate required fields
    for (const field of fields) {
      const isRequired = field.required || ruleResult.requiredFields.has(field.key);
      const isOptional = ruleResult.optionalFields.has(field.key);
      if (isRequired && !isOptional && !formData[field.key] && formData[field.key] !== false) {
        toast({ title: `Please enter ${field.label}`, variant: "destructive" });
        return;
      }
    }

    const submitData = { ...formData };
    // Remove hidden fields
    ruleResult.hiddenFields.forEach((key) => delete submitData[key]);

    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier.id, data: submitData });
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
            {uiOverrides.formTitle || (editingSupplier ? "Edit Supplier" : "Add New Supplier")}
          </DialogTitle>
          <DialogDescription>
            {uiOverrides.formDescription || (editingSupplier ? "Update supplier information" : "Add a new supplier to your directory")}
          </DialogDescription>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          {sections.length > 0 ? (
            sections.map((section) => {
              const sectionFields = visibleFields.filter((f) => f.section === section.key || (!f.section && section.order === 1));
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
            <Button type="submit" disabled={isSubmitting || ruleResult.blockSubmit}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {uiOverrides.submitButtonText || (editingSupplier ? "Update Supplier" : "Add Supplier")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
