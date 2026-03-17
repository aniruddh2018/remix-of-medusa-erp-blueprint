import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormFieldConfig } from "@/types/formConfig";

interface ConfigurableFormFieldProps {
  field: FormFieldConfig;
  value: any;
  onChange: (key: string, value: any) => void;
  disabled?: boolean;
  error?: string;
  overrideRequired?: boolean;
}

export function ConfigurableFormField({
  field,
  value,
  onChange,
  disabled,
  error,
  overrideRequired,
}: ConfigurableFormFieldProps) {
  const isRequired = overrideRequired ?? field.required;

  const labelEl = (
    <Label htmlFor={field.key} className={error ? "text-destructive" : ""}>
      {field.label}
      {isRequired && <span className="text-destructive ml-1">*</span>}
    </Label>
  );

  const helpEl = field.helpText ? (
    <p className="text-xs text-muted-foreground">{field.helpText}</p>
  ) : null;

  const errorEl = error ? (
    <p className="text-xs text-destructive">{error}</p>
  ) : null;

  switch (field.type) {
    case "switch":
      return (
        <div className="flex items-center gap-2">
          <Switch
            id={field.key}
            checked={!!value}
            onCheckedChange={(checked) => onChange(field.key, checked)}
            disabled={disabled}
          />
          <Label htmlFor={field.key}>{field.label}</Label>
          {helpEl}
        </div>
      );

    case "checkbox":
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            id={field.key}
            checked={!!value}
            onCheckedChange={(checked) => onChange(field.key, checked)}
            disabled={disabled}
          />
          <Label htmlFor={field.key}>{field.label}</Label>
          {helpEl}
        </div>
      );

    case "textarea":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <Textarea
            id={field.key}
            value={value ?? ""}
            onChange={(e) => onChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            rows={3}
          />
          {helpEl}
          {errorEl}
        </div>
      );

    case "select":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <Select
            value={value ?? ""}
            onValueChange={(v) => onChange(field.key, v)}
            disabled={disabled}
          >
            <SelectTrigger id={field.key}>
              <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {helpEl}
          {errorEl}
        </div>
      );

    case "number":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <Input
            id={field.key}
            type="number"
            value={value ?? ""}
            onChange={(e) => onChange(field.key, e.target.value ? Number(e.target.value) : "")}
            placeholder={field.placeholder}
            disabled={disabled}
            min={field.min}
            max={field.max}
          />
          {helpEl}
          {errorEl}
        </div>
      );

    case "date":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <Input
            id={field.key}
            type="date"
            value={value ?? ""}
            onChange={(e) => onChange(field.key, e.target.value)}
            disabled={disabled}
          />
          {helpEl}
          {errorEl}
        </div>
      );

    default:
      return (
        <div className="space-y-1.5">
          {labelEl}
          <Input
            id={field.key}
            type={field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
            value={value ?? ""}
            onChange={(e) => onChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            pattern={field.pattern}
          />
          {helpEl}
          {errorEl}
        </div>
      );
  }
}
