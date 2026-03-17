// ---- Field & Section types ----

export type FieldType =
  | "text"
  | "number"
  | "email"
  | "tel"
  | "date"
  | "textarea"
  | "select"
  | "switch"
  | "checkbox"
  | "file"
  | "computed";

export interface FieldOption {
  label: string;
  value: string;
}

export interface FormFieldConfig {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  visible: boolean;
  order: number;
  section?: string;
  defaultValue?: string | number | boolean;
  options?: FieldOption[]; // for select / checkbox
  computeFormula?: string; // e.g. "quantity * unit_price"
  width?: "full" | "half" | "third";
  min?: number;
  max?: number;
  pattern?: string;
}

export interface FormSectionConfig {
  key: string;
  label: string;
  order: number;
  collapsible: boolean;
  defaultOpen: boolean;
}

export interface UIOverrides {
  submitButtonText?: string;
  cancelButtonText?: string;
  formTitle?: string;
  formDescription?: string;
  successMessage?: string;
}

export interface LayoutConfig {
  columns: 1 | 2 | 3;
}

export interface FormConfig {
  id?: string;
  company_id: string;
  module: ModuleKey;
  config_version: number;
  fields: FormFieldConfig[];
  sections: FormSectionConfig[];
  ui_overrides: UIOverrides;
  layout: LayoutConfig;
  is_active: boolean;
}

// ---- Business Rules ----

export type RuleOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "greater_equal"
  | "less_equal"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "starts_with"
  | "ends_with";

export type RuleLogic = "AND" | "OR";

export interface RuleCondition {
  field: string;
  operator: RuleOperator;
  value: string | number | boolean;
  logicOperator?: RuleLogic; // relation to next condition
}

export type RuleActionType =
  | "show_field"
  | "hide_field"
  | "set_required"
  | "set_optional"
  | "set_value"
  | "show_alert"
  | "block_submit"
  | "apply_discount"
  | "require_approval";

export interface RuleAction {
  type: RuleActionType;
  target?: string; // field key
  value?: string | number | boolean;
  message?: string;
}

export type RuleType =
  | "validation"
  | "visibility"
  | "auto_fill"
  | "auto_calculate"
  | "approval"
  | "alert";

export interface BusinessRule {
  id?: string;
  company_id: string;
  module: ModuleKey;
  name: string;
  description?: string;
  rule_type: RuleType;
  conditions: RuleCondition[];
  actions: RuleAction[];
  priority: number;
  is_active: boolean;
}

// ---- Module keys ----

export type ModuleKey =
  | "sales"
  | "purchase_orders"
  | "products"
  | "suppliers"
  | "customers"
  | "counter_sale";

export const MODULE_LABELS: Record<ModuleKey, string> = {
  sales: "Sales / Invoicing",
  purchase_orders: "Purchase Orders",
  products: "Products",
  suppliers: "Suppliers",
  customers: "Customers",
  counter_sale: "Counter Sale",
};
