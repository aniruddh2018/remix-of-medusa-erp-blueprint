import type { ImportEntityType, ValidationError, ValidationResult } from '@/types/dataImport';
import { ENTITY_SCHEMAS } from '@/types/dataImport';

// ─── Quality Metrics ─────────────────────────────────────────────────────────

export interface QualityMetrics {
  completeness: number;
  accuracy: number;
  consistency: number;
  uniqueness: number;
  overall: number;
}

export interface AnomalyFlag {
  rowIndex: number;
  field: string;
  type: string;
  detail: string;
  severity: 'warning' | 'error';
}

// ─── Validation Rule Types ──────────────────────────────────────────────────

type ValidationSeverity = 'error' | 'warning';

interface ValidationRule {
  field: string;
  check: (value: unknown, context: Record<string, unknown>) => { valid: boolean; message?: string };
  severity: ValidationSeverity;
  message: string;
}

// ─── Per-Entity Validation Rules ────────────────────────────────────────────

const COMMON_RULES: ValidationRule[] = [
  {
    field: '*',
    check: (value: unknown) => {
      if (value === null || value === undefined || String(value).trim() === '') {
        return { valid: false, message: 'Value is empty' };
      }
      return { valid: true };
    },
    severity: 'error',
    message: 'Required field is missing',
  },
];

function numberRule(field: string, min?: number, max?: number): ValidationRule {
  return {
    field,
    check: (value: unknown) => {
      const num = Number(value);
      if (isNaN(num)) return { valid: false, message: 'Must be a number' };
      if (min !== undefined && num < min) return { valid: false, message: `Must be >= ${min}` };
      if (max !== undefined && num > max) return { valid: false, message: `Must be <= ${max}` };
      return { valid: true };
    },
    severity: 'error',
    message: 'Invalid number value',
  };
}

function gstRule(field: string): ValidationRule {
  const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d]$/;
  return {
    field,
    check: (value: unknown) => {
      const s = String(value ?? '').trim();
      if (!s) return { valid: true };
      return { valid: GST_RE.test(s), message: 'Invalid GST format (e.g., 27ABCDE1234F1Z5)' };
    },
    severity: 'warning',
    message: 'Invalid GST format',
  };
}

function phoneRule(field: string): ValidationRule {
  const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{9}$/;
  return {
    field,
    check: (value: unknown) => {
      const s = String(value ?? '').replace(/[\s-]/g, '');
      if (!s) return { valid: true };
      return { valid: PHONE_RE.test(s), message: 'Invalid phone number' };
    },
    severity: 'warning',
    message: 'Invalid phone format',
  };
}

function emailRule(field: string): ValidationRule {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return {
    field,
    check: (value: unknown) => {
      const s = String(value ?? '').trim();
      if (!s) return { valid: true };
      return { valid: EMAIL_RE.test(s), message: 'Invalid email format' };
    },
    severity: 'warning',
    message: 'Invalid email format',
  };
}

function dateRule(field: string): ValidationRule {
  return {
    field,
    check: (value: unknown) => {
      const s = String(value ?? '').trim();
      if (!s) return { valid: true };
      const d = new Date(s);
      return { valid: !isNaN(d.getTime()), message: 'Invalid date' };
    },
    severity: 'error',
    message: 'Invalid date format',
  };
}

function getEntityRules(entityType: ImportEntityType): ValidationRule[] {
  const rules: ValidationRule[] = [];
  const schema = ENTITY_SCHEMAS[entityType];

  for (const field of schema.fields) {
    if (field.required) {
      rules.push({
        field: field.key,
        check: (value: unknown) => {
          if (value === null || value === undefined || String(value).trim() === '') {
            return { valid: false, message: `${field.label} is required` };
          }
          return { valid: true };
        },
        severity: 'error',
        message: `${field.label} is required`,
      });
    }

    switch (field.type) {
      case 'number':
        rules.push(numberRule(field.key, 0));
        break;
      case 'gst':
        rules.push(gstRule(field.key));
        break;
      case 'phone':
        rules.push(phoneRule(field.key));
        break;
      case 'email':
        rules.push(emailRule(field.key));
        break;
      case 'date':
        rules.push(dateRule(field.key));
        break;
    }
  }

  // Entity-specific business rules
  if (entityType === 'product') {
    rules.push({
      field: 'mrp',
      check: (value: unknown, context: Record<string, unknown>) => {
        const mrp = Number(value);
        const pp = Number(context['purchase_price'] ?? 0);
        if (!isNaN(mrp) && !isNaN(pp) && pp > 0 && mrp < pp) {
          return { valid: false, message: `MRP (${mrp}) is less than purchase price (${pp})` };
        }
        return { valid: true };
      },
      severity: 'warning',
      message: 'MRP is less than purchase price',
    });
  }

  if (entityType === 'inventory_batch') {
    rules.push({
      field: 'expiry_date',
      check: (value: unknown) => {
        const s = String(value ?? '').trim();
        if (!s) return { valid: true };
        const expiry = new Date(s);
        if (!isNaN(expiry.getTime()) && expiry < new Date()) {
          return { valid: false, message: 'Expiry date is in the past' };
        }
        return { valid: true };
      },
      severity: 'warning',
      message: 'Expiry date is in the past',
    });
  }

  return rules;
}

// ─── Validation Execution ────────────────────────────────────────────────────

export function validateRows(
  entityType: ImportEntityType,
  rows: Record<string, unknown>[],
  mappings?: { sourceField: string; targetField: string }[]
): ValidationResult {
  const rules = getEntityRules(entityType);
  const errors: ValidationError[] = [];
  let errorRowCount = 0;
  let warningRowCount = 0;

  // Build a map from source column → target field if mappings provided
  const fieldMap = new Map<string, string>();
  if (mappings) {
    for (const m of mappings) {
      fieldMap.set(m.targetField, m.sourceField);
    }
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    let rowHasError = false;
    let rowHasWarning = false;

    for (const rule of rules) {
      const valueKey = fieldMap.has(rule.field)
        ? fieldMap.get(rule.field)!
        : rule.field;

      const value = row[valueKey];
      const result = rule.check(value, row);

      if (!result.valid) {
        errors.push({
          rowIndex,
          field: rule.field,
          message: result.message || rule.message,
          severity: rule.severity,
          value: value ?? null,
        });
        if (rule.severity === 'error') rowHasError = true;
        else rowHasWarning = true;
      }
    }

    if (rowHasError) errorRowCount++;
    else if (rowHasWarning) warningRowCount++;
  }

  return {
    totalRows: rows.length,
    validRows: rows.length - errorRowCount,
    errorRows: errorRowCount,
    warningRows: warningRowCount,
    errors,
  };
}

export function getRowErrors(
  validationResult: ValidationResult,
  rowIndex: number
): ValidationError[] {
  return validationResult.errors.filter(e => e.rowIndex === rowIndex);
}

export function getRowStatus(
  validationResult: ValidationResult,
  rowIndex: number
): 'valid' | 'error' | 'warning' {
  const rowErrors = getRowErrors(validationResult, rowIndex);
  if (rowErrors.some(e => e.severity === 'error')) return 'error';
  if (rowErrors.length > 0) return 'warning';
  return 'valid';
}

export function calculateQualityScore(validationResult: ValidationResult): number {
  if (validationResult.totalRows === 0) return 100;
  const completeness = validationResult.validRows / validationResult.totalRows;
  const hasNoErrors = validationResult.errorRows === 0 ? 1 : 0;
  return Math.round(completeness * 100 * 0.8 + hasNoErrors * 20);
}

// ─── Phase 5: Anomaly Detection ──────────────────────────────────────────────

export function detectAnomalies(
  entityType: ImportEntityType,
  rows: Record<string, unknown>[],
  mappings?: { sourceField: string; targetField: string }[]
): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];
  const fieldMap = new Map<string, string>();
  if (mappings) {
    for (const m of mappings) fieldMap.set(m.targetField, m.sourceField);
  }

  const resolve = (field: string, row: Record<string, unknown>) => {
    const src = fieldMap.get(field) ?? field;
    return row[src];
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const gst = Number(resolve('gst_percentage', row));
    if (!isNaN(gst) && gst > 40) {
      flags.push({ rowIndex: i, field: 'gst_percentage', type: 'high_gst', detail: `GST ${gst}% exceeds 40%`, severity: 'warning' });
    }

    const qty = Number(resolve('quantity', row));
    if (!isNaN(qty) && qty < 0) {
      flags.push({ rowIndex: i, field: 'quantity', type: 'negative_quantity', detail: `Quantity is ${qty}`, severity: 'error' });
    }

    const mrp = Number(resolve('mrp', row));
    const pp = Number(resolve('purchase_price', row) ?? resolve('unit_price', row));
    if (!isNaN(mrp) && !isNaN(pp) && mrp > 0 && pp > 0 && mrp < pp) {
      flags.push({ rowIndex: i, field: 'mrp', type: 'mrp_below_cost', detail: `MRP ₹${mrp} < Purchase ₹${pp}`, severity: 'warning' });
    }

    const expiryStr = resolve('expiry_date', row);
    if (expiryStr) {
      const expiry = new Date(String(expiryStr));
      if (!isNaN(expiry.getTime()) && expiry < new Date()) {
        flags.push({ rowIndex: i, field: 'expiry_date', type: 'expired_batch', detail: `Expired: ${String(expiryStr)}`, severity: 'error' });
      }
    }

    const discount = Number(resolve('discount_amount', row));
    const total = Number(resolve('total_amount', row));
    if (!isNaN(discount) && !isNaN(total) && total > 0 && discount / total > 0.5) {
      flags.push({ rowIndex: i, field: 'discount_amount', type: 'excessive_discount', detail: `Discount exceeds 50% of total`, severity: 'warning' });
    }
  }

  return flags;
}

// ─── Phase 5: Multi-Metric Quality Scoring ───────────────────────────────────

export function calculateQualityMetrics(
  rows: Record<string, unknown>[],
  validationResult: ValidationResult,
  entityType: ImportEntityType,
  mappings?: { sourceField: string; targetField: string }[]
): QualityMetrics {
  const schema = ENTITY_SCHEMAS[entityType];
  const requiredFields = schema.fields.filter(f => f.required).map(f => f.key);
  const numericFields = schema.fields.filter(f => f.type === 'number' || f.type === 'date').map(f => f.key);

  const fieldMap = new Map<string, string>();
  if (mappings) {
    for (const m of mappings) fieldMap.set(m.targetField, m.sourceField);
  }

  // Completeness: % of required fields filled across all rows
  let totalRequired = requiredFields.length * rows.length;
  let filledRequired = 0;
  for (const row of rows) {
    for (const f of requiredFields) {
      const src = fieldMap.get(f) ?? f;
      const val = row[src];
      if (val !== null && val !== undefined && String(val).trim() !== '') filledRequired++;
    }
  }
  const completeness = totalRequired > 0 ? Math.round((filledRequired / totalRequired) * 100) : 100;

  // Accuracy: % of valid rows
  const accuracy = validationResult.totalRows > 0
    ? Math.round((validationResult.validRows / validationResult.totalRows) * 100)
    : 100;

  // Consistency: format uniformity for numeric/date fields
  let formatChecks = 0;
  let formatPasses = 0;
  for (const row of rows) {
    for (const f of numericFields) {
      const src = fieldMap.get(f) ?? f;
      const val = row[src];
      if (val !== null && val !== undefined && String(val) !== '') {
        formatChecks++;
        if (!isNaN(Number(val))) formatPasses++;
      }
    }
  }
  const consistency = formatChecks > 0 ? Math.round((formatPasses / formatChecks) * 100) : 100;

  // Uniqueness: % unique key values
  const nameSrc = fieldMap.get('name') ?? 'name';
  const uniqueNames = new Set(rows.map(r => String(r[nameSrc] ?? '').toLowerCase().trim()).filter(Boolean));
  const uniqueness = rows.length > 0 ? Math.round((uniqueNames.size / rows.length) * 100) : 100;

  const overall = Math.round(
    completeness * 0.35 + accuracy * 0.35 + consistency * 0.15 + uniqueness * 0.15
  );

  return { completeness, accuracy, consistency, uniqueness, overall };
}
