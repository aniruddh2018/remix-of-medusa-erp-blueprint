import type { FormFieldConfig, FormSectionConfig, ModuleKey } from "@/types/formConfig";

// Default field definitions per module – used when no custom config exists

const supplierFields: FormFieldConfig[] = [
  { key: "name", label: "Company Name", type: "text", required: true, visible: true, order: 1, section: "basic", width: "half" },
  { key: "contact_person", label: "Contact Person", type: "text", required: false, visible: true, order: 2, section: "basic", width: "half" },
  { key: "phone", label: "Phone", type: "tel", required: false, visible: true, order: 3, section: "basic", width: "half" },
  { key: "email", label: "Email", type: "email", required: false, visible: true, order: 4, section: "basic", width: "half" },
  { key: "gst_number", label: "GST Number", type: "text", required: false, visible: true, order: 5, section: "basic", placeholder: "e.g., 27AABCU9603R1ZM", width: "half" },
  { key: "drug_license_number", label: "Drug License Number", type: "text", required: false, visible: true, order: 6, section: "basic", width: "half" },
  { key: "address", label: "Address", type: "textarea", required: false, visible: true, order: 7, section: "basic", width: "full" },
  { key: "is_active", label: "Active Supplier", type: "switch", required: false, visible: true, order: 8, section: "basic", defaultValue: true, width: "full" },
];

const customerFields: FormFieldConfig[] = [
  { key: "name", label: "Customer Name", type: "text", required: true, visible: true, order: 1, section: "basic", width: "half" },
  { key: "phone", label: "Phone", type: "tel", required: false, visible: true, order: 2, section: "basic", width: "half" },
  { key: "email", label: "Email", type: "email", required: false, visible: true, order: 3, section: "basic", width: "half" },
  { key: "gst_number", label: "GST Number", type: "text", required: false, visible: true, order: 4, section: "basic", width: "half" },
  { key: "address", label: "Address", type: "textarea", required: false, visible: true, order: 5, section: "basic", width: "full" },
  { key: "notes", label: "Notes", type: "textarea", required: false, visible: true, order: 6, section: "basic", width: "full" },
];

const productFields: FormFieldConfig[] = [
  { key: "name", label: "Product Name", type: "text", required: true, visible: true, order: 1, section: "basic", width: "half" },
  { key: "manufacturer", label: "Manufacturer", type: "text", required: true, visible: true, order: 2, section: "basic", width: "half" },
  { key: "generic_name", label: "Generic Name", type: "text", required: false, visible: true, order: 3, section: "basic", width: "half" },
  { key: "category", label: "Category", type: "text", required: false, visible: true, order: 4, section: "basic", width: "half" },
  { key: "composition", label: "Composition", type: "text", required: false, visible: true, order: 5, section: "details", width: "half" },
  { key: "strength", label: "Strength", type: "text", required: false, visible: true, order: 6, section: "details", width: "half" },
  { key: "hsn_code", label: "HSN Code", type: "text", required: false, visible: true, order: 7, section: "details", width: "half" },
  { key: "unit", label: "Unit", type: "select", required: true, visible: true, order: 8, section: "details", width: "half", options: [
    { label: "Pieces", value: "pcs" }, { label: "Strip", value: "strip" }, { label: "Box", value: "box" },
    { label: "Bottle", value: "bottle" }, { label: "Kg", value: "kg" }, { label: "Litre", value: "litre" },
  ]},
  { key: "mrp", label: "MRP", type: "number", required: true, visible: true, order: 9, section: "pricing", width: "half", min: 0 },
  { key: "purchase_price", label: "Purchase Price", type: "number", required: true, visible: true, order: 10, section: "pricing", width: "half", min: 0 },
  { key: "sale_price", label: "Sale Price", type: "number", required: false, visible: true, order: 11, section: "pricing", width: "half", min: 0 },
  { key: "gst_percentage", label: "GST %", type: "number", required: true, visible: true, order: 12, section: "pricing", width: "half", defaultValue: 18, min: 0, max: 100 },
  { key: "drug_schedule", label: "Drug Schedule", type: "select", required: false, visible: true, order: 13, section: "regulatory", width: "half", defaultValue: "none", options: [
    { label: "None", value: "none" }, { label: "Schedule H", value: "schedule_h" },
    { label: "Schedule H1", value: "schedule_h1" }, { label: "Schedule X", value: "schedule_x" },
    { label: "Narcotic", value: "narcotic" },
  ]},
  { key: "min_stock_level", label: "Min Stock", type: "number", required: false, visible: true, order: 14, section: "stock", width: "third", defaultValue: 10 },
  { key: "max_stock_level", label: "Max Stock", type: "number", required: false, visible: true, order: 15, section: "stock", width: "third", defaultValue: 1000 },
  { key: "reorder_level", label: "Reorder Level", type: "number", required: false, visible: true, order: 16, section: "stock", width: "third", defaultValue: 20 },
];

const salesFields: FormFieldConfig[] = [
  { key: "customer_name", label: "Customer Name", type: "text", required: true, visible: true, order: 1, section: "customer", width: "half" },
  { key: "customer_phone", label: "Phone", type: "tel", required: false, visible: true, order: 2, section: "customer", width: "half" },
  { key: "customer_address", label: "Address", type: "textarea", required: false, visible: true, order: 3, section: "customer", width: "full" },
  { key: "payment_method", label: "Payment Method", type: "select", required: false, visible: true, order: 4, section: "payment", width: "half", options: [
    { label: "Cash", value: "cash" }, { label: "UPI", value: "upi" },
    { label: "Card", value: "card" }, { label: "Credit", value: "credit" },
  ]},
  { key: "prescription_number", label: "Prescription #", type: "text", required: false, visible: true, order: 5, section: "payment", width: "half" },
  { key: "notes", label: "Notes", type: "textarea", required: false, visible: true, order: 6, section: "payment", width: "full" },
];

const purchaseOrderFields: FormFieldConfig[] = [
  { key: "supplier_id", label: "Supplier", type: "select", required: true, visible: true, order: 1, section: "basic", width: "half" },
  { key: "invoice_number", label: "Invoice Number", type: "text", required: false, visible: true, order: 2, section: "basic", width: "half" },
  { key: "order_date", label: "Order Date", type: "date", required: true, visible: true, order: 3, section: "basic", width: "half" },
  { key: "expected_delivery_date", label: "Expected Delivery", type: "date", required: false, visible: true, order: 4, section: "basic", width: "half" },
  { key: "notes", label: "Notes", type: "textarea", required: false, visible: true, order: 5, section: "basic", width: "full" },
];

const counterSaleFields: FormFieldConfig[] = [
  { key: "customer_name", label: "Customer Name", type: "text", required: true, visible: true, order: 1, section: "basic", width: "half", defaultValue: "Walk-in Customer" },
  { key: "customer_phone", label: "Phone", type: "tel", required: false, visible: true, order: 2, section: "basic", width: "half" },
  { key: "payment_method", label: "Payment", type: "select", required: false, visible: true, order: 3, section: "basic", width: "half", options: [
    { label: "Cash", value: "cash" }, { label: "UPI", value: "upi" }, { label: "Card", value: "card" },
  ]},
];

export const DEFAULT_FIELDS: Record<ModuleKey, FormFieldConfig[]> = {
  suppliers: supplierFields,
  customers: customerFields,
  products: productFields,
  sales: salesFields,
  purchase_orders: purchaseOrderFields,
  counter_sale: counterSaleFields,
};

const basicSection: FormSectionConfig = { key: "basic", label: "Basic Information", order: 1, collapsible: false, defaultOpen: true };

export const DEFAULT_SECTIONS: Record<ModuleKey, FormSectionConfig[]> = {
  suppliers: [basicSection],
  customers: [basicSection],
  products: [
    basicSection,
    { key: "details", label: "Details", order: 2, collapsible: true, defaultOpen: true },
    { key: "pricing", label: "Pricing", order: 3, collapsible: true, defaultOpen: true },
    { key: "regulatory", label: "Regulatory", order: 4, collapsible: true, defaultOpen: false },
    { key: "stock", label: "Stock Levels", order: 5, collapsible: true, defaultOpen: false },
  ],
  sales: [
    { key: "customer", label: "Customer", order: 1, collapsible: false, defaultOpen: true },
    { key: "payment", label: "Payment & Notes", order: 2, collapsible: true, defaultOpen: true },
  ],
  purchase_orders: [basicSection],
  counter_sale: [basicSection],
};
