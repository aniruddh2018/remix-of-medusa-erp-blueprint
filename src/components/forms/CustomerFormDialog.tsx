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
import { syncCustomerToLedger } from "@/services/ledgerBridge";

type Customer = Tables<"customers">;

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCustomer?: Customer | null;
  onSuccess?: (customerId: string) => void;
  /** Optional seed values when creating a new customer (e.g. typed name or phone) */
  initialData?: Partial<Record<string, any>>;
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  editingCustomer,
  onSuccess,
  initialData,
}: CustomerFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { companyId } = useBusiness();
  const { fields, sections, uiOverrides, layout } = useFormConfig("customers");
  const rules = useBusinessRules("customers");
  const [formData, setFormData] = useState<Record<string, any>>({});

  useEffect(() => {
    if (editingCustomer) {
      const data: Record<string, any> = {};
      fields.forEach((f) => {
        data[f.key] = (editingCustomer as any)[f.key] ?? f.defaultValue ?? "";
      });
      setFormData(data);
    } else if (open) {
      const data: Record<string, any> = {};
      fields.forEach((f) => {
        const seeded = initialData?.[f.key];
        data[f.key] = seeded !== undefined && seeded !== "" ? seeded : (f.defaultValue ?? "");
      });
      setFormData(data);
    }
  }, [editingCustomer, open, fields, initialData]);

  const ruleResult = evaluateAllRules(rules, formData);

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
      const { data: customer, error } = await supabase
        .from("customers")
        .insert({ ...data, company_id: companyId } as TablesInsert<"customers">)
        .select()
        .single();
      if (error) throw error;
      return customer;
    },
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      if (companyId) syncCustomerToLedger(customer, companyId).catch(() => {});
      toast({ title: uiOverrides.successMessage || "Customer added successfully" });
      onOpenChange(false);
      onSuccess?.(customer.id);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const { data: customer, error } = await supabase
        .from("customers")
        .update(data as TablesUpdate<"customers">)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return customer;
    },
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      if (companyId) syncCustomerToLedger(customer, companyId).catch(() => {});
      toast({ title: uiOverrides.successMessage || "Customer updated successfully" });
      onOpenChange(false);
      onSuccess?.(customer.id);
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
      if (isRequired && !isOptional && !formData[field.key] && formData[field.key] !== false) {
        toast({ title: `Please enter ${field.label}`, variant: "destructive" });
        return;
      }
    }

    const submitData = { ...formData };
    ruleResult.hiddenFields.forEach((key) => delete submitData[key]);

    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data: submitData });
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
            {uiOverrides.formTitle || (editingCustomer ? "Edit Customer" : "Add Customer")}
          </DialogTitle>
          <DialogDescription>
            {uiOverrides.formDescription || (editingCustomer ? "Update customer information" : "Add a new customer")}
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
              {uiOverrides.submitButtonText || (editingCustomer ? "Update" : "Add Customer")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
