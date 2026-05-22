# Data Transformation & Validation Layer - Technical Design

## Overview
The Data Transformation & Validation Layer is responsible for converting source data into the target schema format and ensuring data quality through comprehensive validation rules. This layer sits between the mapping engine and the import execution engine.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATA TRANSFORMATION & VALIDATION LAYER                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Input: Source Data + Mapping Configuration + Validation Rules              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    TRANSFORMATION ENGINE                              │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Type Casting │  │ Format Norm  │  │ Value Transform│              │    │
│  │  │ Engine       │  │ Engine       │  │ Engine       │                │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Lookup       │  │ Derive       │  │ Enum Map     │                │    │
│  │  │ Resolver     │  │ Fields       │  │ Engine       │                │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    VALIDATION ENGINE                               │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Schema       │  │ Business     │  │ Referential  │                │    │
│  │  │ Validation  │  │ Rule Validation│  │ Integrity    │                │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Data Quality │  │ Duplicate    │  │ Cross-Field  │                │    │
│  │  │ Scoring     │  │ Detection    │  │ Validation   │                │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    ERROR HANDLING & RECOVERY                         │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │    │
│  │  │ Error        │  │ Auto-Fix     │  │ Manual       │                │    │
│  │  │ Categorization│  │ Suggestions │  │ Review Queue │                │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Output: Transformed Data + Validation Results + Quality Score                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Transformation Engine

### Type Casting Engine

```typescript
interface TypeCastRule {
  from: DataType;
  to: DataType;
  transform: (value: any) => any;
  validate: (value: any) => boolean;
  errorMessage: string;
}

const TYPE_CAST_RULES: TypeCastRule[] = [
  {
    from: 'string',
    to: 'number',
    transform: (value: string) => parseFloat(value),
    validate: (value: string) => !isNaN(parseFloat(value)),
    errorMessage: 'Cannot convert to number'
  },
  {
    from: 'string',
    to: 'integer',
    transform: (value: string) => parseInt(value, 10),
    validate: (value: string) => !isNaN(parseInt(value, 10)),
    errorMessage: 'Cannot convert to integer'
  },
  {
    from: 'string',
    to: 'decimal',
    transform: (value: string) => parseFloat(value),
    validate: (value: string) => !isNaN(parseFloat(value)),
    errorMessage: 'Cannot convert to decimal'
  },
  {
    from: 'string',
    to: 'date',
    transform: (value: string) => parseDate(value),
    validate: (value: string) => isValidDate(value),
    errorMessage: 'Invalid date format'
  },
  {
    from: 'string',
    to: 'boolean',
    transform: (value: string) => {
      const normalized = value.toLowerCase().trim();
      return normalized === 'true' || normalized === '1' || normalized === 'yes';
    },
    validate: (value: string) => {
      const normalized = value.toLowerCase().trim();
      return ['true', 'false', '1', '0', 'yes', 'no'].includes(normalized);
    },
    errorMessage: 'Invalid boolean value (use true/false, 1/0, yes/no)'
  },
  {
    from: 'number',
    to: 'string',
    transform: (value: number) => value.toString(),
    validate: (value: number) => !isNaN(value),
    errorMessage: 'Cannot convert number to string'
  }
];

function castValue(value: any, targetType: DataType): TransformResult {
  const sourceType = inferDataType(value);
  const rule = TYPE_CAST_RULES.find(r => r.from === sourceType && r.to === targetType);
  
  if (!rule) {
    if (sourceType === targetType) {
      return { success: true, transformedValue: value };
    }
    return {
      success: false,
      error: `No casting rule from ${sourceType} to ${targetType}`
    };
  }
  
  if (!rule.validate(value)) {
    return {
      success: false,
      error: rule.errorMessage
    };
  }
  
  try {
    const transformed = rule.transform(value);
    return { success: true, transformedValue: transformed };
  } catch (err) {
    return {
      success: false,
      error: `Transformation failed: ${(err as Error).message}`
    };
  }
}
```

### Format Normalization Engine

```typescript
interface FormatNormalizationRule {
  semanticType: SemanticType;
  detectPattern: RegExp;
  normalize: (value: string) => string;
  validate: (value: string) => boolean;
}

const FORMAT_NORMALIZATION_RULES: FormatNormalizationRule[] = [
  {
    semanticType: 'date',
    detectPattern: /^(\d{4})-(\d{2})-(\d{2})$/,
    normalize: (value: string) => {
      // Already in YYYY-MM-DD format
      return value;
    },
    validate: (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  },
  {
    semanticType: 'date',
    detectPattern: /^(\d{2})\/(\d{2})\/(\d{4})$/,
    normalize: (value: string) => {
      const parts = value.split('/');
      return `${parts[2]}-${parts[0]}-${parts[1]}`; // MM/DD/YYYY → YYYY-MM-DD
    },
    validate: (value: string) => {
      const date = new Date(value);
      return !isNaN(date.getTime());
    }
  },
  {
    semanticType: 'date',
    detectPattern: /^(\d{2})-(\d{2})-(\d{4})$/,
    normalize: (value: string) => {
      const parts = value.split('-');
      return `${parts[2]}-${parts[0]}-${parts[1]}`; // DD-MM-YYYY → YYYY-MM-DD
    },
    validate: (value: string) => {
      const date = new Date(value);
      return !isNaN(date.getTime());
    }
  },
  {
    semanticType: 'phone',
    detectPattern: /^[\d\s\-\+\(\)]+$/,
    normalize: (value: string) => {
      // Remove all non-digit characters
      return value.replace(/[^\d]/g, '');
    },
    validate: (value: string) => /^\d{10,15}$/.test(value)
  },
  {
    semanticType: 'gst',
    detectPattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    normalize: (value: string) => {
      // Already in correct format, just uppercase
      return value.toUpperCase();
    },
    validate: (value: string) => {
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      return gstRegex.test(value.toUpperCase());
    }
  },
  {
    semanticType: 'email',
    detectPattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    normalize: (value: string) => {
      return value.toLowerCase().trim();
    },
    validate: (value: string) => {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      return emailRegex.test(value.toLowerCase());
    }
  }
];

function normalizeFormat(value: string, semanticType: SemanticType): TransformResult {
  const rules = FORMAT_NORMALIZATION_RULES.filter(r => r.semanticType === semanticType);
  
  for (const rule of rules) {
    if (rule.detectPattern.test(value)) {
      try {
        const normalized = rule.normalize(value);
        if (rule.validate(normalized)) {
          return { success: true, transformedValue: normalized };
        }
      } catch (err) {
        return {
          success: false,
          error: `Normalization failed: ${(err as Error).message}`
        };
      }
    }
  }
  
  // Try generic normalization
  try {
    const normalized = value.trim();
    return { success: true, transformedValue: normalized };
  } catch (err) {
    return {
      success: false,
      error: `Generic normalization failed: ${(err as Error).message}`
    };
  }
}
```

### Value Transformation Engine

```typescript
interface ValueTransformRule {
  type: 'uppercase' | 'lowercase' | 'trim' | 'replace' | 'substring' | 'concat';
  params?: Record<string, any>;
  transform: (value: any, params?: Record<string, any>) => any;
}

const VALUE_TRANSFORM_RULES: ValueTransformRule[] = [
  {
    type: 'uppercase',
    transform: (value: string) => value.toUpperCase()
  },
  {
    type: 'lowercase',
    transform: (value: string) => value.toLowerCase()
  },
  {
    type: 'trim',
    transform: (value: string) => value.trim()
  },
  {
    type: 'replace',
    params: { search: '', replace: '' },
    transform: (value: string, params) => {
      return value.replace(new RegExp(params.search, 'g'), params.replace);
    }
  },
  {
    type: 'substring',
    params: { start: 0, end: 0 },
    transform: (value: string, params) => {
      return value.substring(params.start, params.end);
    }
  },
  {
    type: 'concat',
    params: { prefix: '', suffix: '' },
    transform: (value: string, params) => {
      return `${params.prefix}${value}${params.suffix}`;
    }
  }
];

function transformValue(value: any, transformation: TransformationRule): TransformResult {
  const rule = VALUE_TRANSFORM_RULES.find(r => r.type === transformation.type);
  
  if (!rule) {
    return {
      success: false,
      error: `Unknown transformation type: ${transformation.type}`
    };
  }
  
  try {
    const transformed = rule.transform(value, transformation.params);
    return { success: true, transformedValue: transformed };
  } catch (err) {
    return {
      success: false,
      error: `Transformation failed: ${(err as Error).message}`
    };
  }
}
```

### Lookup Resolver

```typescript
interface LookupConfig {
  table: string;
  matchField: string;
  returnField: string;
  createIfMissing: boolean;
  defaultFields?: Record<string, any>;
}

async function resolveLookup(
  value: any,
  config: LookupConfig,
  supabaseClient: any,
  companyId: string
): Promise<TransformResult> {
  try {
    // Query the lookup table
    const { data, error } = await supabaseClient
      .from(config.table)
      .select(config.returnField)
      .eq(config.matchField, value)
      .eq('company_id', companyId)
      .maybeSingle();
    
    if (error) {
      return {
        success: false,
        error: `Lookup query failed: ${error.message}`
      };
    }
    
    if (data) {
      // Found existing record
      return { success: true, transformedValue: data[config.returnField] };
    }
    
    // Not found
    if (config.createIfMissing) {
      // Create new record
      const insertData = {
        company_id: companyId,
        [config.matchField]: value,
        ...config.defaultFields
      };
      
      const { data: newData, error: insertError } = await supabaseClient
        .from(config.table)
        .insert(insertData)
        .select(config.returnField)
        .single();
      
      if (insertError) {
        return {
          success: false,
          error: `Failed to create lookup record: ${insertError.message}`
        };
      }
      
      return { success: true, transformedValue: newData[config.returnField] };
    }
    
    return {
      success: false,
      error: `No matching record found in ${config.table} for ${config.matchField} = ${value}`
    };
  } catch (err) {
    return {
      success: false,
      error: `Lookup resolution failed: ${(err as Error).message}`
    };
  }
}
```

### Derived Field Calculator

```typescript
interface DerivedFieldRule {
  field: string;
  expression: string;
  dependencies: string[];
  calculate: (row: Record<string, any>) => any;
}

const DERIVED_FIELD_RULES: DerivedFieldRule[] = [
  {
    field: 'total_price',
    expression: 'quantity * unit_price',
    dependencies: ['quantity', 'unit_price'],
    calculate: (row) => row.quantity * row.unit_price
  },
  {
    field: 'gst_amount',
    expression: 'total_price * (gst_percentage / 100)',
    dependencies: ['total_price', 'gst_percentage'],
    calculate: (row) => row.total_price * (row.gst_percentage / 100)
  },
  {
    field: 'net_amount',
    expression: 'total_price + gst_amount - discount_amount',
    dependencies: ['total_price', 'gst_amount', 'discount_amount'],
    calculate: (row) => row.total_price + row.gst_amount - row.discount_amount
  },
  {
    field: 'margin_percentage',
    expression: '((sale_price - purchase_price) / sale_price) * 100',
    dependencies: ['sale_price', 'purchase_price'],
    calculate: (row) => ((row.sale_price - row.purchase_price) / row.sale_price) * 100
  },
  {
    field: 'days_to_expiry',
    expression: 'expiry_date - current_date',
    dependencies: ['expiry_date'],
    calculate: (row) => {
      const expiry = new Date(row.expiry_date);
      const today = new Date();
      const diffTime = expiry.getTime() - today.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
  }
];

function calculateDerivedFields(
  row: Record<string, any>,
  rules: DerivedFieldRule[]
): Record<string, any> {
  const result = { ...row };
  
  for (const rule of rules) {
    // Check if all dependencies are available
    const hasDependencies = rule.dependencies.every(dep => dep in result);
    
    if (hasDependencies) {
      try {
        result[rule.field] = rule.calculate(result);
      } catch (err) {
        console.error(`Failed to calculate derived field ${rule.field}:`, err);
        result[rule.field] = null;
      }
    }
  }
  
  return result;
}
```

### Enum Mapping Engine

```typescript
interface EnumMappingRule {
  field: string;
  enumType: string;
  mappings: Record<string, string>;
  defaultValue: string;
}

const ENUM_MAPPING_RULES: EnumMappingRule[] = [
  {
    field: 'drug_schedule',
    enumType: 'drug_schedule',
    mappings: {
      'H': 'schedule_h',
      'H1': 'schedule_h1',
      'X': 'schedule_x',
      'N': 'narcotic',
      'None': 'none',
      '': 'none',
      'null': 'none'
    },
    defaultValue: 'none'
  },
  {
    field: 'order_status',
    enumType: 'order_status',
    mappings: {
      'Pending': 'pending',
      'Confirmed': 'confirmed',
      'Shipped': 'shipped',
      'Delivered': 'delivered',
      'Cancelled': 'cancelled',
      '0': 'pending',
      '1': 'confirmed',
      '2': 'shipped',
      '3': 'delivered',
      '4': 'cancelled'
    },
    defaultValue: 'pending'
  },
  {
    field: 'user_role',
    enumType: 'app_role',
    mappings: {
      'Admin': 'admin',
      'Pharmacist': 'pharmacist',
      'Staff': 'staff',
      'Manager': 'admin',
      'Owner': 'admin'
    },
    defaultValue: 'staff'
  }
];

function mapEnumValue(value: any, rule: EnumMappingRule): TransformResult {
  const normalized = value?.toString().trim() || '';
  
  if (rule.mappings[normalized] !== undefined) {
    return {
      success: true,
      transformedValue: rule.mappings[normalized]
    };
  }
  
  // Try case-insensitive match
  const caseInsensitiveKey = Object.keys(rule.mappings).find(
    key => key.toLowerCase() === normalized.toLowerCase()
  );
  
  if (caseInsensitiveKey) {
    return {
      success: true,
      transformedValue: rule.mappings[caseInsensitiveKey]
    };
  }
  
  // Return default
  return {
    success: true,
    transformedValue: rule.defaultValue,
    warning: `Unknown enum value '${value}', using default '${rule.defaultValue}'`
  };
}
```

## Validation Engine

### Schema Validation

```typescript
interface SchemaValidationRule {
  field: string;
  type: 'required' | 'type' | 'length' | 'pattern' | 'range';
  params?: Record<string, any>;
  errorMessage: string;
  severity: 'error' | 'warning';
}

const SCHEMA_VALIDATION_RULES: Record<string, SchemaValidationRule[]> = {
  products: [
    {
      field: 'name',
      type: 'required',
      errorMessage: 'Product name is required',
      severity: 'error'
    },
    {
      field: 'name',
      type: 'length',
      params: { min: 1, max: 255 },
      errorMessage: 'Product name must be between 1 and 255 characters',
      severity: 'error'
    },
    {
      field: 'manufacturer',
      type: 'required',
      errorMessage: 'Manufacturer is required',
      severity: 'error'
    },
    {
      field: 'mrp',
      type: 'type',
      params: { expectedType: 'decimal' },
      errorMessage: 'MRP must be a decimal number',
      severity: 'error'
    },
    {
      field: 'mrp',
      type: 'range',
      params: { min: 0, max: 1000000 },
      errorMessage: 'MRP must be between 0 and 1,000,000',
      severity: 'error'
    },
    {
      field: 'purchase_price',
      type: 'required',
      errorMessage: 'Purchase price is required',
      severity: 'error'
    },
    {
      field: 'purchase_price',
      type: 'range',
      params: { min: 0, max: 1000000 },
      errorMessage: 'Purchase price must be between 0 and 1,000,000',
      severity: 'error'
    },
    {
      field: 'gst_percentage',
      type: 'range',
      params: { min: 0, max: 100 },
      errorMessage: 'GST percentage must be between 0 and 100',
      severity: 'error'
    },
    {
      field: 'drug_schedule',
      type: 'pattern',
      params: {
        pattern: /^(none|schedule_h|schedule_h1|schedule_x|narcotic)$/,
        message: 'Invalid drug schedule'
      },
      errorMessage: 'Drug schedule must be one of: none, schedule_h, schedule_h1, schedule_x, narcotic',
      severity: 'error'
    }
  ],
  suppliers: [
    {
      field: 'name',
      type: 'required',
      errorMessage: 'Supplier name is required',
      severity: 'error'
    },
    {
      field: 'email',
      type: 'pattern',
      params: {
        pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
      },
      errorMessage: 'Invalid email format',
      severity: 'warning'
    },
    {
      field: 'phone',
      type: 'pattern',
      params: {
        pattern: /^\d{10,15}$/
      },
      errorMessage: 'Phone number must be 10-15 digits',
      severity: 'warning'
    },
    {
      field: 'gst_number',
      type: 'pattern',
      params: {
        pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
      },
      errorMessage: 'Invalid GST number format',
      severity: 'warning'
    }
  ],
  inventory_batches: [
    {
      field: 'product_id',
      type: 'required',
      errorMessage: 'Product ID is required',
      severity: 'error'
    },
    {
      field: 'batch_number',
      type: 'required',
      errorMessage: 'Batch number is required',
      severity: 'error'
    },
    {
      field: 'quantity',
      type: 'required',
      errorMessage: 'Quantity is required',
      severity: 'error'
    },
    {
      field: 'quantity',
      type: 'range',
      params: { min: 0 },
      errorMessage: 'Quantity must be non-negative',
      severity: 'error'
    },
    {
      field: 'expiry_date',
      type: 'required',
      errorMessage: 'Expiry date is required',
      severity: 'error'
    },
    {
      field: 'expiry_date',
      type: 'type',
      params: { expectedType: 'date' },
      errorMessage: 'Expiry date must be a valid date',
      severity: 'error'
    }
  ]
};

function validateSchema(row: Record<string, any>, entityType: string): ValidationError[] {
  const rules = SCHEMA_VALIDATION_RULES[entityType] || [];
  const errors: ValidationError[] = [];
  
  for (const rule of rules) {
    const value = row[rule.field];
    
    switch (rule.type) {
      case 'required':
        if (value === null || value === undefined || value === '') {
          errors.push({
            field: rule.field,
            value,
            message: rule.errorMessage,
            severity: rule.severity,
            code: 'REQUIRED_FIELD'
          });
        }
        break;
        
      case 'type':
        if (value !== null && value !== undefined) {
          const actualType = inferDataType(value);
          if (actualType !== rule.params?.expectedType) {
            errors.push({
              field: rule.field,
              value,
              message: rule.errorMessage,
              severity: rule.severity,
              code: 'TYPE_MISMATCH'
            });
          }
        }
        break;
        
      case 'length':
        if (value && typeof value === 'string') {
          const len = value.length;
          if (len < rule.params?.min || len > rule.params?.max) {
            errors.push({
              field: rule.field,
              value,
              message: rule.errorMessage,
              severity: rule.severity,
              code: 'LENGTH_VIOLATION'
            });
          }
        }
        break;
        
      case 'pattern':
        if (value && !rule.params?.pattern.test(value)) {
          errors.push({
            field: rule.field,
            value,
            message: rule.errorMessage,
            severity: rule.severity,
            code: 'PATTERN_MISMATCH'
          });
        }
        break;
        
      case 'range':
        if (value !== null && value !== undefined) {
          const num = parseFloat(value);
          if (isNaN(num) || num < rule.params?.min || num > rule.params?.max) {
            errors.push({
              field: rule.field,
              value,
              message: rule.errorMessage,
              severity: rule.severity,
              code: 'RANGE_VIOLATION'
            });
          }
        }
        break;
    }
  }
  
  return errors;
}
```

### Business Rule Validation

```typescript
interface BusinessValidationRule {
  name: string;
  description: string;
  validate: (row: Record<string, any>, context: ValidationContext) => ValidationResult;
}

interface ValidationContext {
  companyId: string;
  entityType: string;
  existingData?: Record<string, any>[];
  businessType: string;
}

const BUSINESS_VALIDATION_RULES: BusinessValidationRule[] = [
  {
    name: 'MRP must be greater than purchase price',
    description: 'MRP should always be higher than the purchase price',
    validate: (row) => {
      if (row.mrp && row.purchase_price && row.mrp <= row.purchase_price) {
        return {
          isValid: false,
          errors: [{
            field: 'mrp',
            value: row.mrp,
            message: 'MRP must be greater than purchase price',
            severity: 'error',
            code: 'MRP_BELOW_PURCHASE_PRICE'
          }]
        };
      }
      return { isValid: true, errors: [] };
    }
  },
  {
    name: 'Expiry date must be in the future',
    description: 'Products cannot have expiry dates in the past',
    validate: (row) => {
      if (row.expiry_date) {
        const expiry = new Date(row.expiry_date);
        const today = new Date();
        if (expiry < today) {
          return {
            isValid: false,
            errors: [{
              field: 'expiry_date',
              value: row.expiry_date,
              message: 'Expiry date cannot be in the past',
              severity: 'error',
              code: 'EXPIRY_DATE_IN_PAST'
            }]
          };
        }
      }
      return { isValid: true, errors: [] };
    }
  },
  {
    name: 'Drug schedule required for pharmacy',
    description: 'Pharmacy business type requires drug_schedule field',
    validate: (row, context) => {
      if (context.businessType === 'pharmacy' && !row.drug_schedule) {
        return {
          isValid: false,
          errors: [{
            field: 'drug_schedule',
            value: null,
            message: 'Drug schedule is required for pharmacy business type',
            severity: 'error',
            code: 'DRUG_SCHEDULE_REQUIRED'
          }]
        };
      }
      return { isValid: true, errors: [] };
    }
  },
  {
    name: 'Duplicate product check',
    description: 'Product with same name and manufacturer should not exist',
    validate: async (row, context, supabaseClient) => {
      const { data, error } = await supabaseClient
        .from('products')
        .select('id')
        .eq('company_id', context.companyId)
        .eq('name', row.name)
        .eq('manufacturer', row.manufacturer)
        .maybeSingle();
      
      if (data) {
        return {
          isValid: false,
          errors: [{
            field: 'name',
            value: row.name,
            message: `Product with name "${row.name}" and manufacturer "${row.manufacturer}" already exists`,
            severity: 'error',
            code: 'DUPLICATE_PRODUCT'
          }]
        };
      }
      return { isValid: true, errors: [] };
    }
  },
  {
    name: 'Batch uniqueness',
    description: 'Same product cannot have duplicate batch numbers',
    validate: async (row, context, supabaseClient) => {
      const { data, error } = await supabaseClient
        .from('inventory_batches')
        .select('id')
        .eq('product_id', row.product_id)
        .eq('batch_number', row.batch_number)
        .eq('company_id', context.companyId)
        .maybeSingle();
      
      if (data) {
        return {
          isValid: false,
          errors: [{
            field: 'batch_number',
            value: row.batch_number,
            message: `Batch number "${row.batch_number}" already exists for this product`,
            severity: 'error',
            code: 'DUPLICATE_BATCH'
          }]
        };
      }
      return { isValid: true, errors: [] };
    }
  },
  {
    name: 'GST format validation',
    description: 'GST number must match Indian GST format',
    validate: (row) => {
      if (row.gst_number) {
        const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        if (!gstRegex.test(row.gst_number.toUpperCase())) {
          return {
            isValid: false,
            errors: [{
              field: 'gst_number',
              value: row.gst_number,
              message: 'Invalid GST number format (expected: 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric)',
              severity: 'warning',
              code: 'INVALID_GST_FORMAT'
            }]
          };
        }
      }
      return { isValid: true, errors: [] };
    }
  }
];

async function validateBusinessRules(
  row: Record<string, any>,
  context: ValidationContext,
  supabaseClient: any
): Promise<ValidationError[]> {
  const allErrors: ValidationError[] = [];
  
  for (const rule of BUSINESS_VALIDATION_RULES) {
    try {
      const result = await rule.validate(row, context, supabaseClient);
      allErrors.push(...result.errors);
    } catch (err) {
      console.error(`Business rule validation failed for ${rule.name}:`, err);
    }
  }
  
  return allErrors;
}
```

### Referential Integrity Validation

```typescript
interface ReferentialIntegrityRule {
  field: string;
  references: {
    table: string;
    field: string;
  };
  validate: (value: any, context: ValidationContext, supabaseClient: any) => Promise<boolean>;
}

const REFERENTIAL_INTEGRITY_RULES: ReferentialIntegrityRule[] = [
  {
    field: 'product_id',
    references: { table: 'products', field: 'id' },
    validate: async (value, context, supabaseClient) => {
      if (!value) return true;
      
      const { data } = await supabaseClient
        .from('products')
        .select('id')
        .eq('id', value)
        .eq('company_id', context.companyId)
        .maybeSingle();
      
      return !!data;
    }
  },
  {
    field: 'supplier_id',
    references: { table: 'suppliers', field: 'id' },
    validate: async (value, context, supabaseClient) => {
      if (!value) return true;
      
      const { data } = await supabaseClient
        .from('suppliers')
        .select('id')
        .eq('id', value)
        .eq('company_id', context.companyId)
        .maybeSingle();
      
      return !!data;
    }
  },
  {
    field: 'batch_id',
    references: { table: 'inventory_batches', field: 'id' },
    validate: async (value, context, supabaseClient) => {
      if (!value) return true;
      
      const { data } = await supabaseClient
        .from('inventory_batches')
        .select('id')
        .eq('id', value)
        .eq('company_id', context.companyId)
        .maybeSingle();
      
      return !!data;
    }
  }
];

async function validateReferentialIntegrity(
  row: Record<string, any>,
  context: ValidationContext,
  supabaseClient: any
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  
  for (const rule of REFERENTIAL_INTEGRITY_RULES) {
    const value = row[rule.field];
    
    if (value) {
      const isValid = await rule.validate(value, context, supabaseClient);
      
      if (!isValid) {
        errors.push({
          field: rule.field,
          value,
          message: `Referenced ${rule.references.table}.${rule.references.field} does not exist`,
          severity: 'error',
          code: 'REFERENTIAL_INTEGRITY_VIOLATION'
        });
      }
    }
  }
  
  return errors;
}
```

### Data Quality Scoring

```typescript
interface QualityMetrics {
  completeness: number;  // % of required fields filled
  accuracy: number;      // % of valid values
  consistency: number;   // format uniformity
  uniqueness: number;    // duplicate detection
  overall: number;       // weighted average
}

function calculateQualityScore(
  rows: Record<string, any>[],
  entityType: string,
  validationResults: ValidationError[][]
): QualityMetrics {
  const totalRows = rows.length;
  if (totalRows === 0) {
    return { completeness: 0, accuracy: 0, consistency: 0, uniqueness: 0, overall: 0 };
  }
  
  // Completeness: % of required fields filled
  const requiredFields = SCHEMA_VALIDATION_RULES[entityType]
    ?.filter(r => r.type === 'required')
    .map(r => r.field) || [];
  
  let filledRequiredFields = 0;
  let totalRequiredFields = totalRows * requiredFields.length;
  
  for (const row of rows) {
    for (const field of requiredFields) {
      if (row[field] !== null && row[field] !== undefined && row[field] !== '') {
        filledRequiredFields++;
      }
    }
  }
  
  const completeness = totalRequiredFields > 0 
    ? (filledRequiredFields / totalRequiredFields) * 100 
    : 100;
  
  // Accuracy: % of rows without errors
  const errorRows = validationResults.filter(errors => errors.length > 0).length;
  const accuracy = ((totalRows - errorRows) / totalRows) * 100;
  
  // Consistency: format uniformity (simplified)
  const consistency = 85; // Placeholder - would need actual format analysis
  
  // Uniqueness: duplicate detection
  const uniqueRows = new Set(rows.map(r => JSON.stringify(r))).size;
  const uniqueness = (uniqueRows / totalRows) * 100;
  
  // Overall: weighted average
  const overall = (
    completeness * 0.3 +
    accuracy * 0.4 +
    consistency * 0.15 +
    uniqueness * 0.15
  );
  
  return {
    completeness: Math.round(completeness),
    accuracy: Math.round(accuracy),
    consistency: Math.round(consistency),
    uniqueness: Math.round(uniqueness),
    overall: Math.round(overall)
  };
}
```

## Edge Function Implementation

```typescript
// supabase/functions/data-transformer/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { 
      sourceData, 
      mappingConfig, 
      entityType, 
      companyId,
      businessType 
    } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Transform data
    const transformedData = await transformData(
      sourceData,
      mappingConfig,
      supabaseClient,
      companyId
    );

    // Validate data
    const validationResults = await validateData(
      transformedData,
      entityType,
      companyId,
      businessType,
      supabaseClient
    );

    // Calculate quality score
    const qualityScore = calculateQualityScore(
      transformedData,
      entityType,
      validationResults
    );

    const result = {
      transformedData,
      validationResults,
      qualityScore,
      summary: {
        totalRows: sourceData.length,
        transformedRows: transformedData.length,
        validRows: validationResults.filter(r => r.errors.filter(e => e.severity === 'error').length === 0).length,
        errorRows: validationResults.filter(r => r.errors.filter(e => e.severity === 'error').length > 0).length,
        warningRows: validationResults.filter(r => r.errors.filter(e => e.severity === 'warning').length > 0).length
      }
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Data transformation error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function transformData(
  sourceData: Record<string, any>[],
  mappingConfig: MappingConfiguration,
  supabaseClient: any,
  companyId: string
): Promise<Record<string, any>[]> {
  const transformed: Record<string, any>[] = [];

  for (const row of sourceData) {
    const transformedRow: Record<string, any> = {
      company_id: companyId
    };

    for (const mapping of mappingConfig.mappings) {
      const sourceValue = row[mapping.sourceColumn];
      
      if (sourceValue === undefined || sourceValue === null) {
        continue;
      }

      let transformedValue = sourceValue;

      // Apply transformations
      if (mapping.transformation) {
        const result = applyTransformation(
          sourceValue,
          mapping.transformation,
          supabaseClient,
          companyId
        );
        
        if (result.success) {
          transformedValue = result.transformedValue;
        } else {
          transformedValue = null;
        }
      }

      transformedRow[mapping.targetField] = transformedValue;
    }

    // Calculate derived fields
    const withDerived = calculateDerivedFields(transformedRow, DERIVED_FIELD_RULES);
    transformed.push(withDerived);
  }

  return transformed;
}

async function applyTransformation(
  value: any,
  transformation: TransformationRule,
  supabaseClient: any,
  companyId: string
): Promise<TransformResult> {
  switch (transformation.type) {
    case 'cast':
      return castValue(value, transformation.params.to);
    
    case 'format':
      return normalizeFormat(value, transformation.params.semanticType);
    
    case 'lookup':
      return await resolveLookup(value, transformation.params, supabaseClient, companyId);
    
    case 'enum_map':
      const rule = ENUM_MAPPING_RULES.find(r => r.field === transformation.params.field);
      if (rule) {
        return mapEnumValue(value, rule);
      }
      return { success: true, transformedValue: value };
    
    default:
      return { success: true, transformedValue: value };
  }
}

async function validateData(
  data: Record<string, any>[],
  entityType: string,
  companyId: string,
  businessType: string,
  supabaseClient: any
): Promise<ValidationError[][]> {
  const results: ValidationError[][] = [];
  const context: ValidationContext = {
    companyId,
    entityType,
    businessType
  };

  for (const row of data) {
    const errors: ValidationError[] = [];

    // Schema validation
    const schemaErrors = validateSchema(row, entityType);
    errors.push(...schemaErrors);

    // Business rule validation
    const businessErrors = await validateBusinessRules(row, context, supabaseClient);
    errors.push(...businessErrors);

    // Referential integrity validation
    const refErrors = await validateReferentialIntegrity(row, context, supabaseClient);
    errors.push(...refErrors);

    results.push(errors);
  }

  return results;
}
```

## Error Handling & Recovery

### Error Categorization

```typescript
enum ErrorCategory {
  DATA_TYPE = 'data_type',
  FORMAT = 'format',
  REQUIRED_FIELD = 'required_field',
  BUSINESS_RULE = 'business_rule',
  REFERENTIAL_INTEGRITY = 'referential_integrity',
  DUPLICATE = 'duplicate',
  SYSTEM = 'system'
}

interface CategorizedError {
  category: ErrorCategory;
  error: ValidationError;
  autoFixable: boolean;
  fixSuggestion?: string;
}

function categorizeError(error: ValidationError): CategorizedError {
  let category: ErrorCategory;
  let autoFixable = false;
  let fixSuggestion: string | undefined;

  switch (error.code) {
    case 'TYPE_MISMATCH':
      category = ErrorCategory.DATA_TYPE;
      autoFixable = true;
      fixSuggestion = 'Apply type casting transformation';
      break;
    
    case 'PATTERN_MISMATCH':
      category = ErrorCategory.FORMAT;
      autoFixable = true;
      fixSuggestion = 'Apply format normalization';
      break;
    
    case 'REQUIRED_FIELD':
      category = ErrorCategory.REQUIRED_FIELD;
      autoFixable = false;
      fixSuggestion = 'Provide a value for this field or set a default';
      break;
    
    case 'MRP_BELOW_PURCHASE_PRICE':
      category = ErrorCategory.BUSINESS_RULE;
      autoFixable = false;
      fixSuggestion = 'Review pricing - MRP should be higher than purchase price';
      break;
    
    case 'DUPLICATE_PRODUCT':
    case 'DUPLICATE_BATCH':
      category = ErrorCategory.DUPLICATE;
      autoFixable = false;
      fixSuggestion = 'Skip duplicate or update existing record';
      break;
    
    case 'REFERENTIAL_INTEGRITY_VIOLATION':
      category = ErrorCategory.REFERENTIAL_INTEGRITY;
      autoFixable = true;
      fixSuggestion = 'Enable auto-create lookup records';
      break;
    
    default:
      category = ErrorCategory.SYSTEM;
      autoFixable = false;
  }

  return {
    category,
    error,
    autoFixable,
    fixSuggestion
  };
}
```

### Auto-Fix Suggestions

```typescript
interface AutoFixSuggestion {
  field: string;
  currentValue: any;
  suggestedValue: any;
  reason: string;
  confidence: number;
}

function generateAutoFixSuggestions(
  row: Record<string, any>,
  errors: ValidationError[]
): AutoFixSuggestion[] {
  const suggestions: AutoFixSuggestion[] = [];

  for (const error of errors) {
    switch (error.code) {
      case 'TYPE_MISMATCH':
        if (error.field === 'mrp' || error.field === 'purchase_price') {
          suggestions.push({
            field: error.field,
            currentValue: error.value,
            suggestedValue: parseFloat(error.value),
            reason: 'Convert string to decimal',
            confidence: 95
          });
        }
        break;
      
      case 'PATTERN_MISMATCH':
        if (error.field === 'phone') {
          suggestions.push({
            field: error.field,
            currentValue: error.value,
            suggestedValue: error.value.replace(/[^\d]/g, ''),
            reason: 'Remove non-digit characters',
            confidence: 90
          });
        }
        break;
      
      case 'REQUIRED_FIELD':
        if (error.field === 'drug_schedule') {
          suggestions.push({
            field: error.field,
            currentValue: error.value,
            suggestedValue: 'none',
            reason: 'Set default drug schedule to "none"',
            confidence: 70
          });
        }
        break;
    }
  }

  return suggestions;
}
```

---

**Last Updated**: 2026-05-13
**Status**: Design Complete - Ready for Implementation
