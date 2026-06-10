-- Seed system import templates for common ERP source systems
-- These templates map common ERP export column names to target ERP fields.

-- ─── Tally ───────────────────────────────────────────────────────────────────

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Tally Products',
  'Template for importing products/stock items exported from Tally ERP',
  'product',
  'tally',
  '[
    {"sourceField":"Stock Item Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"HSN","targetField":"hsn_code","isAiGenerated":false},
    {"sourceField":"Rate","targetField":"purchase_price","isAiGenerated":false},
    {"sourceField":"MRP","targetField":"mrp","isAiGenerated":false},
    {"sourceField":"GST %","targetField":"gst_percentage","isAiGenerated":false},
    {"sourceField":"Unit","targetField":"unit","isAiGenerated":false},
    {"sourceField":"Stock Group","targetField":"category","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Tally Suppliers',
  'Template for importing suppliers/vendors exported from Tally ERP',
  'supplier',
  'tally',
  '[
    {"sourceField":"Ledger Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"GSTIN","targetField":"gst_number","isAiGenerated":false},
    {"sourceField":"Contact","targetField":"contact_person","isAiGenerated":false},
    {"sourceField":"Phone","targetField":"phone","isAiGenerated":false},
    {"sourceField":"Email","targetField":"email","isAiGenerated":false},
    {"sourceField":"Drug Licence No","targetField":"drug_license_number","isAiGenerated":false},
    {"sourceField":"Address","targetField":"address","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Tally Customers',
  'Template for importing customers/debtors exported from Tally ERP',
  'customer',
  'tally',
  '[
    {"sourceField":"Ledger Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"GSTIN","targetField":"gst_number","isAiGenerated":false},
    {"sourceField":"Phone","targetField":"phone","isAiGenerated":false},
    {"sourceField":"Email","targetField":"email","isAiGenerated":false},
    {"sourceField":"Address","targetField":"address","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Tally Inventory',
  'Template for importing stock/batches exported from Tally ERP',
  'inventory_batch',
  'tally',
  '[
    {"sourceField":"Stock Item Name","targetField":"product_name","isAiGenerated":false},
    {"sourceField":"Batch No","targetField":"batch_number","isAiGenerated":false},
    {"sourceField":"Qty","targetField":"quantity","isAiGenerated":false},
    {"sourceField":"Rate","targetField":"purchase_price","isAiGenerated":false},
    {"sourceField":"MRP","targetField":"mrp","isAiGenerated":false},
    {"sourceField":"Expiry","targetField":"expiry_date","isAiGenerated":false},
    {"sourceField":"Mfg Date","targetField":"manufacturing_date","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Tally Purchase Orders',
  'Template for importing purchase invoices from Tally ERP',
  'purchase_order',
  'tally',
  '[
    {"sourceField":"Invoice No","targetField":"invoice_number","isAiGenerated":false},
    {"sourceField":"Party Name","targetField":"supplier_name","isAiGenerated":false},
    {"sourceField":"Date","targetField":"order_date","isAiGenerated":false},
    {"sourceField":"Grand Total","targetField":"total_amount","isAiGenerated":false},
    {"sourceField":"GST Amount","targetField":"gst_amount","isAiGenerated":false},
    {"sourceField":"Discount","targetField":"discount_amount","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

-- ─── SAP ─────────────────────────────────────────────────────────────────────

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'SAP Products',
  'Template for importing materials from SAP Business One',
  'product',
  'sap',
  '[
    {"sourceField":"ItemCode","targetField":"name","isAiGenerated":false},
    {"sourceField":"ItemName","targetField":"name","isAiGenerated":false},
    {"sourceField":"FrgnName","targetField":"generic_name","isAiGenerated":false},
    {"sourceField":"SalUnitMsr","targetField":"unit","isAiGenerated":false},
    {"sourceField":"ItmsGrpCod","targetField":"category","isAiGenerated":false},
    {"sourceField":"GST Tax Rate","targetField":"gst_percentage","isAiGenerated":false},
    {"sourceField":"HSN Code","targetField":"hsn_code","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'SAP Suppliers',
  'Template for importing business partners from SAP Business One',
  'supplier',
  'sap',
  '[
    {"sourceField":"CardCode","targetField":"name","isAiGenerated":false},
    {"sourceField":"CardName","targetField":"name","isAiGenerated":false},
    {"sourceField":"Phone1","targetField":"phone","isAiGenerated":false},
    {"sourceField":"E_Mail","targetField":"email","isAiGenerated":false},
    {"sourceField":"GSTIN","targetField":"gst_number","isAiGenerated":false},
    {"sourceField":"Address","targetField":"address","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

-- ─── Zoho Books ──────────────────────────────────────────────────────────────

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Zoho Products',
  'Template for importing items from Zoho Books',
  'product',
  'zoho',
  '[
    {"sourceField":"Item Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"HSN/SAC","targetField":"hsn_code","isAiGenerated":false},
    {"sourceField":"Rate","targetField":"purchase_price","isAiGenerated":false},
    {"sourceField":"Tax %","targetField":"gst_percentage","isAiGenerated":false},
    {"sourceField":"Unit","targetField":"unit","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Zoho Customers',
  'Template for importing customers from Zoho Books',
  'customer',
  'zoho',
  '[
    {"sourceField":"Customer Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"Customer Phone","targetField":"phone","isAiGenerated":false},
    {"sourceField":"Customer Email","targetField":"email","isAiGenerated":false},
    {"sourceField":"GST Treatment","targetField":"gst_number","isAiGenerated":false},
    {"sourceField":"Billing Address","targetField":"address","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'Zoho Suppliers',
  'Template for importing vendors from Zoho Books',
  'supplier',
  'zoho',
  '[
    {"sourceField":"Vendor Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"Phone","targetField":"phone","isAiGenerated":false},
    {"sourceField":"Email","targetField":"email","isAiGenerated":false},
    {"sourceField":"GSTIN","targetField":"gst_number","isAiGenerated":false},
    {"sourceField":"Address","targetField":"address","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

-- ─── QuickBooks ──────────────────────────────────────────────────────────────

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'QuickBooks Products',
  'Template for importing products/services from QuickBooks',
  'product',
  'quickbooks',
  '[
    {"sourceField":"Name","targetField":"name","isAiGenerated":false},
    {"sourceField":"Description","targetField":"composition","isAiGenerated":false},
    {"sourceField":"Sales Price","targetField":"mrp","isAiGenerated":false},
    {"sourceField":"Purchase Cost","targetField":"purchase_price","isAiGenerated":false},
    {"sourceField":"Income Account","targetField":"category","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

INSERT INTO public.import_templates (name, description, entity_type, source_system, field_mappings, is_system)
VALUES (
  'QuickBooks Customers',
  'Template for importing customers from QuickBooks',
  'customer',
  'quickbooks',
  '[
    {"sourceField":"Customer","targetField":"name","isAiGenerated":false},
    {"sourceField":"Phone","targetField":"phone","isAiGenerated":false},
    {"sourceField":"Email","targetField":"email","isAiGenerated":false},
    {"sourceField":"Billing Address","targetField":"address","isAiGenerated":false},
    {"sourceField":"GST Number","targetField":"gst_number","isAiGenerated":false}
  ]'::jsonb,
  true
) ON CONFLICT DO NOTHING;
