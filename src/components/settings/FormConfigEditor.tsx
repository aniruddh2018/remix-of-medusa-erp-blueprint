import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useFormConfig, useSaveFormConfig, useBusinessRules, useSaveBusinessRule, useDeleteBusinessRule } from "@/hooks/useFormConfig";
import { DEFAULT_FIELDS, DEFAULT_SECTIONS } from "@/config/defaultFormConfigs";
import type { FormFieldConfig, FormSectionConfig, UIOverrides, LayoutConfig, ModuleKey, BusinessRule, RuleCondition, RuleAction, RuleOperator, RuleActionType, FieldType } from "@/types/formConfig";
import { MODULE_LABELS } from "@/types/formConfig";
import { GripVertical, Plus, Trash2, Save, RotateCcw, ChevronDown, ChevronRight, Loader2, Settings2, Zap, Type, Eye, EyeOff, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const OPERATOR_LABELS: Record<RuleOperator, string> = {
  equals: "Equals",
  not_equals: "Not Equals",
  greater_than: "Greater Than",
  less_than: "Less Than",
  greater_equal: "≥",
  less_equal: "≤",
  contains: "Contains",
  not_contains: "Not Contains",
  is_empty: "Is Empty",
  is_not_empty: "Is Not Empty",
  starts_with: "Starts With",
  ends_with: "Ends With",
};

const ACTION_TYPE_LABELS: Record<RuleActionType, string> = {
  show_field: "Show Field",
  hide_field: "Hide Field",
  set_required: "Make Required",
  set_optional: "Make Optional",
  set_value: "Set Value",
  show_alert: "Show Alert",
  block_submit: "Block Submit",
  apply_discount: "Apply Discount",
  require_approval: "Require Approval",
};

const FIELD_TYPES: { label: string; value: FieldType }[] = [
  { label: "Text", value: "text" },
  { label: "Number", value: "number" },
  { label: "Email", value: "email" },
  { label: "Phone", value: "tel" },
  { label: "Date", value: "date" },
  { label: "Textarea", value: "textarea" },
  { label: "Dropdown", value: "select" },
  { label: "Toggle", value: "switch" },
  { label: "Checkbox", value: "checkbox" },
];

export function FormConfigEditor() {
  const [selectedModule, setSelectedModule] = useState<ModuleKey>("products");
  const [activeTab, setActiveTab] = useState("fields");
  const { toast } = useToast();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Form & Rules Configuration
        </CardTitle>
        <CardDescription>
          Customize fields, validation rules, and UI labels for each module. Changes apply company-wide.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Label>Module</Label>
          <Select value={selectedModule} onValueChange={(v) => setSelectedModule(v as ModuleKey)}>
            <SelectTrigger className="w-[250px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(MODULE_LABELS) as [ModuleKey, string][]).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="fields" className="gap-1"><Settings2 className="h-3.5 w-3.5" /> Fields</TabsTrigger>
            <TabsTrigger value="rules" className="gap-1"><Zap className="h-3.5 w-3.5" /> Rules</TabsTrigger>
            <TabsTrigger value="ui" className="gap-1"><Type className="h-3.5 w-3.5" /> UI Labels</TabsTrigger>
          </TabsList>

          <TabsContent value="fields">
            <FieldsEditor module={selectedModule} />
          </TabsContent>
          <TabsContent value="rules">
            <RulesEditor module={selectedModule} />
          </TabsContent>
          <TabsContent value="ui">
            <UIOverridesEditor module={selectedModule} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ---- Fields Editor ----

function FieldsEditor({ module }: { module: ModuleKey }) {
  const config = useFormConfig(module);
  const saveConfig = useSaveFormConfig();
  const { toast } = useToast();
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [sections, setSections] = useState<FormSectionConfig[]>([]);
  const [layout, setLayout] = useState<LayoutConfig>({ columns: 2 });
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [expandedField, setExpandedField] = useState<string | null>(null);

  useEffect(() => {
    if (!config.isLoading) {
      setFields(config.allFields.length > 0 ? config.allFields : DEFAULT_FIELDS[module] ?? []);
      setSections(config.sections.length > 0 ? config.sections : DEFAULT_SECTIONS[module] ?? []);
      setLayout(config.layout);
    }
  }, [config.isLoading, module]);

  const handleSave = () => {
    saveConfig.mutate(
      { module, fields, sections, uiOverrides: config.uiOverrides, layout },
      {
        onSuccess: () => toast({ title: "Form configuration saved" }),
        onError: (e) => toast({ title: "Error saving", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleReset = () => {
    setFields(DEFAULT_FIELDS[module] ?? []);
    setSections(DEFAULT_SECTIONS[module] ?? []);
    setLayout({ columns: 2 });
    setShowResetConfirm(false);
    toast({ title: "Reset to defaults", description: "Save to apply." });
  };

  const updateField = (key: string, updates: Partial<FormFieldConfig>) => {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...updates } : f)));
  };

  const addField = () => {
    const newKey = `custom_${Date.now()}`;
    setFields((prev) => [
      ...prev,
      {
        key: newKey,
        label: "New Field",
        type: "text",
        required: false,
        visible: true,
        order: prev.length + 1,
        width: "half",
      },
    ]);
    setExpandedField(newKey);
  };

  const removeField = (key: string) => {
    setFields((prev) => prev.filter((f) => f.key !== key));
  };

  const moveField = (key: string, direction: "up" | "down") => {
    setFields((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((f) => f.key === key);
      if ((direction === "up" && idx <= 0) || (direction === "down" && idx >= sorted.length - 1)) return prev;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      const tempOrder = sorted[idx].order;
      sorted[idx] = { ...sorted[idx], order: sorted[swapIdx].order };
      sorted[swapIdx] = { ...sorted[swapIdx], order: tempOrder };
      return sorted;
    });
  };

  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label>Columns</Label>
          <Select value={String(layout.columns)} onValueChange={(v) => setLayout({ columns: Number(v) as 1 | 2 | 3 })}>
            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowResetConfirm(true)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
          <Button size="sm" onClick={addField}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Field
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveConfig.isPending}>
            {saveConfig.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      <div className="border rounded-lg divide-y">
        {sortedFields.map((field) => (
          <Collapsible
            key={field.key}
            open={expandedField === field.key}
            onOpenChange={(open) => setExpandedField(open ? field.key : null)}
          >
            <div className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50">
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
              <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
                {expandedField === field.key ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="font-medium text-sm">{field.label}</span>
                <Badge variant="outline" className="text-xs">{field.type}</Badge>
                {field.required && <Badge variant="default" className="text-xs">Required</Badge>}
                {!field.visible && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <EyeOff className="h-3 w-3" /> Hidden
                  </Badge>
                )}
              </CollapsibleTrigger>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveField(field.key, "up")}>↑</Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveField(field.key, "down")}>↓</Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeField(field.key)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <CollapsibleContent>
              <div className="px-6 py-3 bg-muted/30 grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Key</Label>
                  <Input
                    value={field.key}
                    onChange={(e) => updateField(field.key, { key: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={field.label}
                    onChange={(e) => updateField(field.key, { label: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select value={field.type} onValueChange={(v) => updateField(field.key, { type: v as FieldType })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((ft) => (
                        <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Placeholder</Label>
                  <Input
                    value={field.placeholder ?? ""}
                    onChange={(e) => updateField(field.key, { placeholder: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Help Text</Label>
                  <Input
                    value={field.helpText ?? ""}
                    onChange={(e) => updateField(field.key, { helpText: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Width</Label>
                  <Select value={field.width ?? "half"} onValueChange={(v) => updateField(field.key, { width: v as "full" | "half" | "third" })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full</SelectItem>
                      <SelectItem value="half">Half</SelectItem>
                      <SelectItem value="third">Third</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 col-span-1">
                  <Switch
                    checked={field.required}
                    onCheckedChange={(v) => updateField(field.key, { required: v })}
                  />
                  <Label className="text-xs">Required</Label>
                </div>
                <div className="flex items-center gap-2 col-span-1">
                  <Switch
                    checked={field.visible}
                    onCheckedChange={(v) => updateField(field.key, { visible: v })}
                  />
                  <Label className="text-xs">Visible</Label>
                </div>
                {field.type === "number" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Min</Label>
                      <Input
                        type="number"
                        value={field.min ?? ""}
                        onChange={(e) => updateField(field.key, { min: e.target.value ? Number(e.target.value) : undefined })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Max</Label>
                      <Input
                        type="number"
                        value={field.max ?? ""}
                        onChange={(e) => updateField(field.key, { max: e.target.value ? Number(e.target.value) : undefined })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This will discard all custom field configurations for {MODULE_LABELS[module]}. You'll need to click Save to apply.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Rules Editor ----

function RulesEditor({ module }: { module: ModuleKey }) {
  const rules = useBusinessRules(module);
  const saveRule = useSaveBusinessRule();
  const deleteRule = useDeleteBusinessRule();
  const config = useFormConfig(module);
  const { toast } = useToast();
  const [editingRule, setEditingRule] = useState<BusinessRule | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const fieldOptions = config.allFields.map((f) => ({ label: f.label, value: f.key }));

  const createNewRule = (): BusinessRule => ({
    company_id: "",
    module,
    name: "",
    description: "",
    rule_type: "validation",
    conditions: [{ field: "", operator: "equals", value: "" }],
    actions: [{ type: "show_alert", message: "" }],
    priority: rules.length,
    is_active: true,
  });

  const handleSave = () => {
    if (!editingRule?.name) {
      toast({ title: "Rule name required", variant: "destructive" });
      return;
    }
    saveRule.mutate(editingRule, {
      onSuccess: () => {
        toast({ title: "Rule saved" });
        setShowEditor(false);
        setEditingRule(null);
      },
      onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const handleDelete = (id: string) => {
    deleteRule.mutate(id, {
      onSuccess: () => toast({ title: "Rule deleted" }),
    });
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Define conditional logic: validation, visibility, auto-fill, alerts
        </p>
        <Button size="sm" onClick={() => { setEditingRule(createNewRule()); setShowEditor(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Rule
        </Button>
      </div>

      {/* Existing rules list */}
      <div className="space-y-2">
        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No rules configured yet</p>
        )}
        {rules.map((rule) => (
          <div key={rule.id} className="border rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{rule.name}</span>
                <Badge variant="outline" className="text-xs">{rule.rule_type}</Badge>
                {!rule.is_active && <Badge variant="secondary" className="text-xs">Disabled</Badge>}
              </div>
              {rule.description && <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                {rule.conditions.length} condition(s) → {rule.actions.length} action(s)
              </p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => { setEditingRule(rule); setShowEditor(true); }}>Edit</Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => rule.id && handleDelete(rule.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Rule editor dialog-like inline */}
      {showEditor && editingRule && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{editingRule.id ? "Edit Rule" : "New Rule"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Rule Name</Label>
                <Input
                  value={editingRule.name}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  className="h-8 text-xs"
                  placeholder="e.g., High value approval"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={editingRule.rule_type} onValueChange={(v) => setEditingRule({ ...editingRule, rule_type: v as any })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="validation">Validation</SelectItem>
                    <SelectItem value="visibility">Visibility</SelectItem>
                    <SelectItem value="auto_fill">Auto Fill</SelectItem>
                    <SelectItem value="alert">Alert</SelectItem>
                    <SelectItem value="approval">Approval</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={editingRule.description ?? ""}
                onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                className="h-8 text-xs"
                placeholder="e.g., If MRP > 500, require approval"
              />
            </div>

            {/* Conditions */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Conditions (IF)</Label>
              {editingRule.conditions.map((cond, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 items-end">
                  <Select value={cond.field} onValueChange={(v) => {
                    const newConds = [...editingRule.conditions];
                    newConds[idx] = { ...cond, field: v };
                    setEditingRule({ ...editingRule, conditions: newConds });
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Field" /></SelectTrigger>
                    <SelectContent>
                      {fieldOptions.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={cond.operator} onValueChange={(v) => {
                    const newConds = [...editingRule.conditions];
                    newConds[idx] = { ...cond, operator: v as RuleOperator };
                    setEditingRule({ ...editingRule, conditions: newConds });
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(OPERATOR_LABELS) as [RuleOperator, string][]).map(([k, l]) => (
                        <SelectItem key={k} value={k}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={String(cond.value ?? "")}
                    onChange={(e) => {
                      const newConds = [...editingRule.conditions];
                      newConds[idx] = { ...cond, value: e.target.value };
                      setEditingRule({ ...editingRule, conditions: newConds });
                    }}
                    className="h-8 text-xs"
                    placeholder="Value"
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                    setEditingRule({ ...editingRule, conditions: editingRule.conditions.filter((_, i) => i !== idx) });
                  }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => {
                setEditingRule({
                  ...editingRule,
                  conditions: [...editingRule.conditions, { field: "", operator: "equals", value: "" }],
                });
              }}>
                <Plus className="h-3 w-3 mr-1" /> Add Condition
              </Button>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Actions (THEN)</Label>
              {editingRule.actions.map((action, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2 items-end">
                  <Select value={action.type} onValueChange={(v) => {
                    const newActions = [...editingRule.actions];
                    newActions[idx] = { ...action, type: v as RuleActionType };
                    setEditingRule({ ...editingRule, actions: newActions });
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(ACTION_TYPE_LABELS) as [RuleActionType, string][]).map(([k, l]) => (
                        <SelectItem key={k} value={k}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={action.target ?? ""} onValueChange={(v) => {
                    const newActions = [...editingRule.actions];
                    newActions[idx] = { ...action, target: v };
                    setEditingRule({ ...editingRule, actions: newActions });
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Target field" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— None —</SelectItem>
                      {fieldOptions.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    value={String(action.value ?? action.message ?? "")}
                    onChange={(e) => {
                      const newActions = [...editingRule.actions];
                      const isMessageType = ["show_alert", "block_submit"].includes(action.type);
                      if (isMessageType) {
                        newActions[idx] = { ...action, message: e.target.value };
                      } else {
                        newActions[idx] = { ...action, value: e.target.value };
                      }
                      setEditingRule({ ...editingRule, actions: newActions });
                    }}
                    className="h-8 text-xs"
                    placeholder="Value / Message"
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                    setEditingRule({ ...editingRule, actions: editingRule.actions.filter((_, i) => i !== idx) });
                  }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => {
                setEditingRule({
                  ...editingRule,
                  actions: [...editingRule.actions, { type: "show_alert", message: "" }],
                });
              }}>
                <Plus className="h-3 w-3 mr-1" /> Add Action
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={editingRule.is_active}
                onCheckedChange={(v) => setEditingRule({ ...editingRule, is_active: v })}
              />
              <Label className="text-xs">Active</Label>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setShowEditor(false); setEditingRule(null); }}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saveRule.isPending}>
                {saveRule.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save Rule
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- UI Overrides Editor ----

function UIOverridesEditor({ module }: { module: ModuleKey }) {
  const config = useFormConfig(module);
  const saveConfig = useSaveFormConfig();
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<UIOverrides>({});

  useEffect(() => {
    if (!config.isLoading) {
      setOverrides(config.uiOverrides);
    }
  }, [config.isLoading, module]);

  const handleSave = () => {
    saveConfig.mutate(
      { module, fields: config.allFields, sections: config.sections, uiOverrides: overrides, layout: config.layout },
      {
        onSuccess: () => toast({ title: "UI labels saved" }),
        onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-4 mt-4">
      <p className="text-sm text-muted-foreground">Customize button labels, headings, and messages for this module.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Form Title</Label>
          <Input
            value={overrides.formTitle ?? ""}
            onChange={(e) => setOverrides({ ...overrides, formTitle: e.target.value })}
            className="h-8 text-xs"
            placeholder="e.g., New Invoice"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Form Description</Label>
          <Input
            value={overrides.formDescription ?? ""}
            onChange={(e) => setOverrides({ ...overrides, formDescription: e.target.value })}
            className="h-8 text-xs"
            placeholder="e.g., Create a new sales invoice"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Submit Button Text</Label>
          <Input
            value={overrides.submitButtonText ?? ""}
            onChange={(e) => setOverrides({ ...overrides, submitButtonText: e.target.value })}
            className="h-8 text-xs"
            placeholder="e.g., Save Invoice"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cancel Button Text</Label>
          <Input
            value={overrides.cancelButtonText ?? ""}
            onChange={(e) => setOverrides({ ...overrides, cancelButtonText: e.target.value })}
            className="h-8 text-xs"
            placeholder="e.g., Discard"
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Success Message</Label>
          <Input
            value={overrides.successMessage ?? ""}
            onChange={(e) => setOverrides({ ...overrides, successMessage: e.target.value })}
            className="h-8 text-xs"
            placeholder="e.g., Invoice saved successfully!"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saveConfig.isPending}>
          {saveConfig.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Save Labels
        </Button>
      </div>
    </div>
  );
}
