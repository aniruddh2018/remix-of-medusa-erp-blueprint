import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_FIELDS, DEFAULT_SECTIONS } from "@/config/defaultFormConfigs";
import type {
  FormConfig,
  FormFieldConfig,
  FormSectionConfig,
  UIOverrides,
  LayoutConfig,
  ModuleKey,
  BusinessRule,
  RuleCondition,
} from "@/types/formConfig";

// ---- Fetch form config ----

export function useFormConfig(module: ModuleKey) {
  const { companyId } = useBusiness();

  const { data: savedConfig, isLoading } = useQuery({
    queryKey: ["form-config", companyId, module],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("form_configs")
        .select("*")
        .eq("company_id", companyId)
        .eq("module", module)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const fields: FormFieldConfig[] = useMemo(() => {
    const raw = savedConfig?.fields
      ? (savedConfig.fields as unknown as FormFieldConfig[])
      : DEFAULT_FIELDS[module] ?? [];
    return [...raw].sort((a, b) => a.order - b.order);
  }, [savedConfig?.fields, module]);

  const visibleFields = useMemo(() => fields.filter((f) => f.visible), [fields]);

  const sections: FormSectionConfig[] = useMemo(() => {
    const raw = savedConfig?.sections
      ? (savedConfig.sections as unknown as FormSectionConfig[])
      : DEFAULT_SECTIONS[module] ?? [];
    return [...raw].sort((a, b) => a.order - b.order);
  }, [savedConfig?.sections, module]);

  const uiOverrides: UIOverrides = useMemo(() =>
    savedConfig?.ui_overrides
      ? (savedConfig.ui_overrides as unknown as UIOverrides)
      : {},
    [savedConfig?.ui_overrides]);

  const layout: LayoutConfig = useMemo(() =>
    savedConfig?.layout
      ? (savedConfig.layout as unknown as LayoutConfig)
      : { columns: 2 },
    [savedConfig?.layout]);

  return {
    fields: visibleFields,
    allFields: fields,
    sections,
    uiOverrides,
    layout,
    isLoading,
    hasCustomConfig: !!savedConfig,
    configVersion: savedConfig?.config_version ?? 0,
    configId: savedConfig?.id,
  };
}

// ---- Save form config ----

export function useSaveFormConfig() {
  const { companyId } = useBusiness();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      module,
      fields,
      sections,
      uiOverrides,
      layout,
    }: {
      module: ModuleKey;
      fields: FormFieldConfig[];
      sections: FormSectionConfig[];
      uiOverrides: UIOverrides;
      layout: LayoutConfig;
    }) => {
      if (!companyId) throw new Error("No company");

      // Check existing
      const { data: existing } = await supabase
        .from("form_configs")
        .select("id, config_version")
        .eq("company_id", companyId)
        .eq("module", module)
        .maybeSingle();

      const nextVersion = (existing?.config_version ?? 0) + 1;

      // Save history
      if (existing) {
        const { data: current } = await supabase
          .from("form_configs")
          .select("*")
          .eq("id", existing.id)
          .single();
        if (current) {
          await supabase.from("config_history").insert({
            company_id: companyId,
            module,
            config_type: "form_config",
            config_snapshot: current as any,
            version: current.config_version,
            change_description: `Version ${current.config_version} snapshot`,
          });
        }
      }

      const payload = {
        company_id: companyId,
        module,
        fields: fields as any,
        sections: sections as any,
        ui_overrides: uiOverrides as any,
        layout: layout as any,
        config_version: nextVersion,
        is_active: true,
      };

      if (existing) {
        const { error } = await supabase
          .from("form_configs")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("form_configs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form-config"] });
    },
  });
}

// ---- Business rules ----

export function useBusinessRules(module: ModuleKey) {
  const { companyId } = useBusiness();

  const { data: rules = [] } = useQuery({
    queryKey: ["business-rules", companyId, module],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("business_rules")
        .select("*")
        .eq("company_id", companyId)
        .eq("module", module)
        .eq("is_active", true)
        .order("priority", { ascending: true });
      if (error) throw error;
      return data as unknown as BusinessRule[];
    },
    enabled: !!companyId,
  });

  return rules;
}

export function useSaveBusinessRule() {
  const { companyId } = useBusiness();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: Omit<BusinessRule, "company_id">) => {
      if (!companyId) throw new Error("No company");
      const payload = { ...rule, company_id: companyId } as any;

      if (rule.id) {
        const { error } = await supabase
          .from("business_rules")
          .update(payload)
          .eq("id", rule.id);
        if (error) throw error;
      } else {
        delete payload.id;
        const { error } = await supabase.from("business_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-rules"] });
    },
  });
}

export function useDeleteBusinessRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("business_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-rules"] });
    },
  });
}

// ---- Rule evaluation engine ----

export function evaluateCondition(
  condition: RuleCondition,
  formValues: Record<string, any>
): boolean {
  const fieldValue = formValues[condition.field];
  const compareValue = condition.value;

  switch (condition.operator) {
    case "equals":
      return String(fieldValue) === String(compareValue);
    case "not_equals":
      return String(fieldValue) !== String(compareValue);
    case "greater_than":
      return Number(fieldValue) > Number(compareValue);
    case "less_than":
      return Number(fieldValue) < Number(compareValue);
    case "greater_equal":
      return Number(fieldValue) >= Number(compareValue);
    case "less_equal":
      return Number(fieldValue) <= Number(compareValue);
    case "contains":
      return String(fieldValue ?? "").toLowerCase().includes(String(compareValue).toLowerCase());
    case "not_contains":
      return !String(fieldValue ?? "").toLowerCase().includes(String(compareValue).toLowerCase());
    case "is_empty":
      return !fieldValue || String(fieldValue).trim() === "";
    case "is_not_empty":
      return !!fieldValue && String(fieldValue).trim() !== "";
    case "starts_with":
      return String(fieldValue ?? "").toLowerCase().startsWith(String(compareValue).toLowerCase());
    case "ends_with":
      return String(fieldValue ?? "").toLowerCase().endsWith(String(compareValue).toLowerCase());
    default:
      return false;
  }
}

export function evaluateRuleConditions(
  conditions: RuleCondition[],
  formValues: Record<string, any>
): boolean {
  if (conditions.length === 0) return true;

  let result = evaluateCondition(conditions[0], formValues);
  for (let i = 1; i < conditions.length; i++) {
    const logic = conditions[i - 1].logicOperator ?? "AND";
    const next = evaluateCondition(conditions[i], formValues);
    result = logic === "AND" ? result && next : result || next;
  }
  return result;
}

export interface RuleEvalResult {
  hiddenFields: Set<string>;
  requiredFields: Set<string>;
  optionalFields: Set<string>;
  autoValues: Record<string, any>;
  alerts: string[];
  blockSubmit: boolean;
  blockMessages: string[];
}

export function evaluateAllRules(
  rules: BusinessRule[],
  formValues: Record<string, any>
): RuleEvalResult {
  const result: RuleEvalResult = {
    hiddenFields: new Set(),
    requiredFields: new Set(),
    optionalFields: new Set(),
    autoValues: {},
    alerts: [],
    blockSubmit: false,
    blockMessages: [],
  };

  for (const rule of rules) {
    if (!rule.is_active) continue;
    const conditionsMet = evaluateRuleConditions(rule.conditions, formValues);
    if (!conditionsMet) continue;

    for (const action of rule.actions) {
      switch (action.type) {
        case "show_field":
          if (action.target) result.hiddenFields.delete(action.target);
          break;
        case "hide_field":
          if (action.target) result.hiddenFields.add(action.target);
          break;
        case "set_required":
          if (action.target) result.requiredFields.add(action.target);
          break;
        case "set_optional":
          if (action.target) result.optionalFields.add(action.target);
          break;
        case "set_value":
          if (action.target) result.autoValues[action.target] = action.value;
          break;
        case "show_alert":
          if (action.message) result.alerts.push(action.message);
          break;
        case "block_submit":
          result.blockSubmit = true;
          if (action.message) result.blockMessages.push(action.message);
          break;
      }
    }
  }
  return result;
}
