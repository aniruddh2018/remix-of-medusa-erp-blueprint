export type ImportEntityType =
  | 'product'
  | 'supplier'
  | 'customer'
  | 'inventory_batch'
  | 'purchase_order'
  | 'sales_order'
  | 'payment';

export type ImportFileType = 'csv' | 'xlsx' | 'xls' | 'json' | 'xml';

export type ImportJobStatus =
  | 'uploaded'
  | 'detecting'
  | 'mapping'
  | 'previewing'
  | 'importing'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export type WizardStep =
  | 'upload'
  | 'schema'
  | 'mapping'
  | 'preview'
  | 'execute';

export type DetectedColumnType =
  | 'string'
  | 'number'
  | 'date'
  | 'boolean'
  | 'email'
  | 'phone'
  | 'gst'
  | 'unknown';

export interface DetectedColumn {
  name: string;
  normalizedName: string;
  sampleValues: string[];
  detectedType: DetectedColumnType;
  nullCount: number;
  uniqueCount: number;
}

export interface ParsedData {
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  fileType?: ImportFileType;
  delimiter?: string;
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transformation?: string;
  confidence?: number;
  isAiGenerated: boolean;
}

export interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
  value: unknown;
}

export interface ValidationResult {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  errors: ValidationError[];
}

export interface ImportJob {
  id: string;
  companyId: string;
  entityType: ImportEntityType;
  fileName: string;
  fileType: ImportFileType;
  status: ImportJobStatus;
  totalRows: number;
  successRows: number;
  failedRows: number;
  mappingConfig: FieldMapping[];
  validationResults?: ValidationResult;
  errorLog?: string[];
  createdAt: string;
}

export interface EntityFieldDefinition {
  key: string;
  label: string;
  required: boolean;
  type: 'string' | 'number' | 'date' | 'boolean' | 'email' | 'phone' | 'gst';
  description?: string;
}

export interface EntitySchema {
  entityType: ImportEntityType;
  label: string;
  icon: string;
  fields: EntityFieldDefinition[];
  dependencies?: ImportEntityType[];
}

export interface ImportTemplate {
  id: string;
  name: string;
  description?: string;
  entityType: ImportEntityType;
  sourceSystem: string;
  fieldMappings: FieldMapping[];
  isSystem: boolean;
  createdAt: string;
}

export const ENTITY_SCHEMAS: Record<ImportEntityType, EntitySchema> = {
  supplier: {
    entityType: 'supplier',
    label: 'Suppliers',
    icon: 'Truck',
    fields: [
      { key: 'name', label: 'Name', required: true, type: 'string' },
      { key: 'contact_person', label: 'Contact Person', required: false, type: 'string' },
      { key: 'phone', label: 'Phone', required: false, type: 'phone' },
      { key: 'email', label: 'Email', required: false, type: 'email' },
      { key: 'gst_number', label: 'GST Number', required: false, type: 'gst' },
      { key: 'drug_license_number', label: 'Drug License', required: false, type: 'string' },
      { key: 'address', label: 'Address', required: false, type: 'string' },
    ],
  },
  product: {
    entityType: 'product',
    label: 'Products',
    icon: 'Package',
    fields: [
      { key: 'name', label: 'Name', required: true, type: 'string' },
      { key: 'manufacturer', label: 'Manufacturer', required: true, type: 'string' },
      { key: 'category', label: 'Category', required: false, type: 'string' },
      { key: 'unit', label: 'Unit', required: false, type: 'string' },
      { key: 'mrp', label: 'MRP', required: false, type: 'number' },
      { key: 'purchase_price', label: 'Purchase Price', required: false, type: 'number' },
      { key: 'sale_price', label: 'Sale Price', required: false, type: 'number' },
      { key: 'gst_percentage', label: 'GST %', required: false, type: 'number' },
      { key: 'hsn_code', label: 'HSN Code', required: false, type: 'string' },
      { key: 'generic_name', label: 'Generic Name', required: false, type: 'string' },
      { key: 'composition', label: 'Composition', required: false, type: 'string' },
      { key: 'strength', label: 'Strength', required: false, type: 'string' },
      { key: 'drug_schedule', label: 'Drug Schedule', required: false, type: 'string' },
      { key: 'min_stock_level', label: 'Min Stock Level', required: false, type: 'number' },
      { key: 'max_stock_level', label: 'Max Stock Level', required: false, type: 'number' },
      { key: 'reorder_level', label: 'Reorder Level', required: false, type: 'number' },
    ],
  },
  customer: {
    entityType: 'customer',
    label: 'Customers',
    icon: 'Users',
    fields: [
      { key: 'name', label: 'Name', required: true, type: 'string' },
      { key: 'phone', label: 'Phone', required: false, type: 'phone' },
      { key: 'email', label: 'Email', required: false, type: 'email' },
      { key: 'address', label: 'Address', required: false, type: 'string' },
      { key: 'gst_number', label: 'GST Number', required: false, type: 'gst' },
    ],
  },
  inventory_batch: {
    entityType: 'inventory_batch',
    label: 'Inventory Batches',
    icon: 'Boxes',
    dependencies: ['product', 'supplier'],
    fields: [
      { key: 'product_name', label: 'Product Name', required: true, type: 'string', description: 'Name of existing product in ERP' },
      { key: 'batch_number', label: 'Batch Number', required: true, type: 'string' },
      { key: 'quantity', label: 'Quantity', required: false, type: 'number' },
      { key: 'purchase_price', label: 'Purchase Price', required: false, type: 'number' },
      { key: 'mrp', label: 'MRP', required: false, type: 'number' },
      { key: 'expiry_date', label: 'Expiry Date', required: true, type: 'date' },
      { key: 'manufacturing_date', label: 'Mfg Date', required: false, type: 'date' },
      { key: 'supplier_name', label: 'Supplier Name', required: false, type: 'string', description: 'Name of existing supplier' },
    ],
  },
  purchase_order: {
    entityType: 'purchase_order',
    label: 'Purchase Orders',
    icon: 'ShoppingCart',
    dependencies: ['supplier'],
    fields: [
      { key: 'invoice_number', label: 'Invoice Number', required: true, type: 'string' },
      { key: 'supplier_name', label: 'Supplier Name', required: true, type: 'string' },
      { key: 'order_date', label: 'Order Date', required: false, type: 'date' },
      { key: 'total_amount', label: 'Total Amount', required: false, type: 'number' },
      { key: 'gst_amount', label: 'GST Amount', required: false, type: 'number' },
      { key: 'discount_amount', label: 'Discount', required: false, type: 'number' },
      { key: 'status', label: 'Status', required: false, type: 'string' },
    ],
  },
  sales_order: {
    entityType: 'sales_order',
    label: 'Sales Orders',
    icon: 'Receipt',
    dependencies: ['customer'],
    fields: [
      { key: 'invoice_number', label: 'Invoice Number', required: true, type: 'string' },
      { key: 'customer_name', label: 'Customer Name', required: true, type: 'string' },
      { key: 'customer_phone', label: 'Customer Phone', required: false, type: 'phone' },
      { key: 'order_date', label: 'Order Date', required: false, type: 'date' },
      { key: 'total_amount', label: 'Total Amount', required: false, type: 'number' },
      { key: 'gst_amount', label: 'GST Amount', required: false, type: 'number' },
      { key: 'discount_amount', label: 'Discount', required: false, type: 'number' },
      { key: 'status', label: 'Status', required: false, type: 'string' },
    ],
  },
  payment: {
    entityType: 'payment',
    label: 'Payments',
    icon: 'CreditCard',
    dependencies: ['supplier', 'customer'],
    fields: [
      { key: 'amount', label: 'Amount', required: true, type: 'number' },
      { key: 'payment_type', label: 'Payment Type', required: false, type: 'string', description: 'purchase or sale' },
      { key: 'reference_type', label: 'Reference Type', required: false, type: 'string' },
      { key: 'reference_number', label: 'Reference Number', required: false, type: 'string' },
      { key: 'party_name', label: 'Party Name', required: true, type: 'string' },
      { key: 'payment_method', label: 'Payment Method', required: false, type: 'string' },
      { key: 'payment_date', label: 'Payment Date', required: false, type: 'date' },
    ],
  },
};

export const IMPORT_ENTITY_ORDER: ImportEntityType[] = [
  'supplier',
  'customer',
  'product',
  'inventory_batch',
  'purchase_order',
  'sales_order',
  'payment',
];

export function getEntityDependencies(entityType: ImportEntityType): ImportEntityType[] {
  return ENTITY_SCHEMAS[entityType].dependencies || [];
}

export function topologicalSort(entities: ImportEntityType[]): ImportEntityType[] {
  const result: ImportEntityType[] = [];
  const visited = new Set<ImportEntityType>();
  const visiting = new Set<ImportEntityType>();

  function visit(entity: ImportEntityType): void {
    if (visited.has(entity)) return;
    if (visiting.has(entity)) return; // cycle guard
    visiting.add(entity);
    for (const dep of getEntityDependencies(entity)) {
      if (entities.includes(dep)) visit(dep);
    }
    visiting.delete(entity);
    visited.add(entity);
    result.push(entity);
  }

  for (const entity of entities) {
    visit(entity);
  }

  return result;
}
