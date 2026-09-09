// ERP tools for the voice agent — ported from supabase/functions/action-agent
// (search/read tools + upsert_customer, create_product, record_payment),
// plus two new tools action-agent didn't have: adjust_inventory and
// record_sale. Same propose-then-human-approval pattern as action-agent:
// every mutating tool writes to agent_pending_actions instead of the target
// table directly, and returns a spoken-friendly confirmation summary —
// nothing is applied until a human approves it in the existing chat/
// approvals UI.
import { z } from 'zod';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { defineTool, ToolContext, ToolDefinition } from './common.js';

// The service-role key lives in Secrets Manager, not a plain env var — see
// the stack's comment on SupabaseServiceRoleKey for why. Fetched once and
// cached for the life of this container (a session can run many tool calls
// across its ~8-minute Nova Sonic stream lifetime).
let supabasePromise: Promise<SupabaseClient> | null = null;
function getSupabase(): Promise<SupabaseClient> {
  if (!supabasePromise) {
    supabasePromise = (async () => {
      const sm = new SecretsManagerClient({});
      const { SecretString } = await sm.send(
        new GetSecretValueCommand({ SecretId: process.env.SUPABASE_SERVICE_ROLE_KEY_SECRET_ARN! })
      );
      return createClient(process.env.SUPABASE_URL!, SecretString!);
    })();
  }
  return supabasePromise;
}

async function getCompanyId(userId: string): Promise<string> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('profiles').select('company_id').eq('user_id', userId).maybeSingle();
  if (error || !data?.company_id) throw new Error('No company found for this user');
  return data.company_id;
}

async function proposeAction(
  companyId: string,
  userId: string,
  toolName: string,
  input: unknown,
  summary: string
): Promise<string> {
  const supabase = await getSupabase();
  const { error } = await supabase.from('agent_pending_actions').insert({
    company_id: companyId,
    tool_name: toolName,
    validated_input: input,
    status: 'pending',
    created_by: userId,
    conversation_id: 'voice-agent',
  });
  if (error) throw new Error(`Failed to propose action: ${error.message}`);
  return `${summary} I've queued this for your approval — check the pending actions list to confirm it.`;
}

// ───── READ tools ─────

export const searchCustomers = defineTool({
  name: 'search_customers',
  description: 'Search customers by name fragment or phone. Use BEFORE upsert_customer to avoid duplicates.',
  schema: z.object({ query: z.string() }),
  handler: async ({ query }, ctx: ToolContext) => {
    const companyId = await getCompanyId(ctx.userId);
    const supabase = await getSupabase();
    const { data } = await supabase.from('customers').select('id, name, phone, email')
      .eq('company_id', companyId).ilike('name', `%${query}%`).limit(5);
    return { customers: data ?? [] };
  },
});

export const searchProducts = defineTool({
  name: 'search_products',
  description: 'Search products by name fragment. Use BEFORE create_product to avoid duplicates.',
  schema: z.object({ query: z.string() }),
  handler: async ({ query }, ctx) => {
    const companyId = await getCompanyId(ctx.userId);
    const supabase = await getSupabase();
    const { data } = await supabase.from('products').select('id, name, manufacturer, mrp, sale_price')
      .eq('company_id', companyId).ilike('name', `%${query}%`).eq('deleted', false).limit(5);
    return { products: data ?? [] };
  },
});

export const searchInvoices = defineTool({
  name: 'search_invoices',
  description: 'Find sales invoices by invoice number fragment OR customer name. Use BEFORE record_payment for a customer.',
  schema: z.object({ invoice_number: z.string().optional(), customer_name: z.string().optional() }),
  handler: async ({ invoice_number, customer_name }, ctx) => {
    const companyId = await getCompanyId(ctx.userId);
    const supabase = await getSupabase();
    let q = supabase.from('sales_orders').select('id, invoice_number, customer_name, total_amount, paid_amount')
      .eq('company_id', companyId).limit(5);
    if (invoice_number) q = q.ilike('invoice_number', `%${invoice_number}%`);
    if (customer_name) q = q.ilike('customer_name', `%${customer_name}%`);
    const { data } = await q;
    return { invoices: (data ?? []).map((r) => ({ ...r, balance: Number(r.total_amount) - Number(r.paid_amount) })) };
  },
});

export const getOutstanding = defineTool({
  name: 'get_outstanding',
  description: 'Get total outstanding (unpaid) balance for a customer or supplier.',
  schema: z.object({ party_type: z.enum(['customer', 'supplier']), party_name: z.string() }),
  handler: async ({ party_type, party_name }, ctx) => {
    const companyId = await getCompanyId(ctx.userId);
    const supabase = await getSupabase();
    const table = party_type === 'supplier' ? 'purchase_orders' : 'sales_orders';
    const nameCol = party_type === 'supplier' ? 'supplier_name' : 'customer_name';
    const { data } = await supabase.from(table).select('total_amount, paid_amount')
      .eq('company_id', companyId).ilike(nameCol, `%${party_name}%`);
    const outstanding = (data ?? []).reduce((sum, r) => sum + (Number(r.total_amount) - Number(r.paid_amount)), 0);
    return { party_name, outstanding, invoice_count: data?.length ?? 0 };
  },
});

export const listRecentSales = defineTool({
  name: 'list_recent_sales',
  description: 'List the most recent sales invoices.',
  schema: z.object({ limit: z.number().min(1).max(50).default(10) }),
  handler: async ({ limit }, ctx) => {
    const companyId = await getCompanyId(ctx.userId);
    const supabase = await getSupabase();
    const { data } = await supabase.from('sales_orders')
      .select('id, invoice_number, customer_name, total_amount, created_at')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(limit);
    return { sales: data ?? [] };
  },
});

// ───── MUTATING tools (propose → human approval) ─────

export const upsertCustomer = defineTool({
  name: 'upsert_customer',
  description: 'Propose creating or updating a customer. REQUIRES HUMAN APPROVAL.',
  schema: z.object({
    id: z.string().optional(), name: z.string().max(200), phone: z.string().max(20).optional(),
    email: z.string().max(255).optional(), address: z.string().max(500).optional(), gst_number: z.string().max(20).optional(),
  }),
  handler: async (input, ctx) => {
    const companyId = await getCompanyId(ctx.userId);
    const supabase = await getSupabase();
    return proposeAction(companyId, ctx.userId, 'upsert_customer', input,
      `${input.id ? 'Updating' : 'Creating'} customer ${input.name}.`);
  },
});

export const createProduct = defineTool({
  name: 'create_product',
  description: 'Propose creating a new product. REQUIRES HUMAN APPROVAL.',
  schema: z.object({
    name: z.string().max(200), manufacturer: z.string().max(200), mrp: z.number().min(0), purchase_price: z.number().min(0),
    gst_percentage: z.number().min(0).max(28).default(18), hsn_code: z.string().max(20).optional(),
    unit: z.string().max(20).default('pcs'), category: z.string().max(100).optional(), strength: z.string().max(50).optional(),
  }),
  handler: async (input, ctx) => {
    const companyId = await getCompanyId(ctx.userId);
    const supabase = await getSupabase();
    return proposeAction(companyId, ctx.userId, 'create_product', input,
      `Creating product ${input.name} at MRP ${input.mrp}.`);
  },
});

export const recordPayment = defineTool({
  name: 'record_payment',
  description: 'Propose recording a payment against an existing invoice or purchase bill. REQUIRES HUMAN APPROVAL. You MUST first use search_invoices to get the reference_id — never guess it.',
  schema: z.object({
    payment_type: z.enum(['received', 'made']), reference_type: z.enum(['sales_order', 'purchase_order']),
    reference_id: z.string(), reference_number: z.string(), party_name: z.string(),
    party_type: z.enum(['customer', 'supplier']), amount: z.number().min(0.01),
    payment_method: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'cheque']).default('cash'),
  }),
  handler: async (input, ctx) => {
    const companyId = await getCompanyId(ctx.userId);
    const supabase = await getSupabase();
    return proposeAction(companyId, ctx.userId, 'record_payment', input,
      `Recording a payment of ${input.amount} ${input.payment_type === 'received' ? 'from' : 'to'} ${input.party_name}.`);
  },
});

// ───── NEW tools (not in action-agent) ─────

export const adjustInventory = defineTool({
  name: 'adjust_inventory',
  description: 'Propose an inventory adjustment for a product (add stock, remove/write-off stock, or set to an exact count). REQUIRES HUMAN APPROVAL. You MUST first use search_products to resolve the exact product.',
  schema: z.object({
    product_name: z.string(), adjustment_type: z.enum(['add', 'remove', 'set']),
    quantity: z.number().min(0), reason: z.string().optional(),
  }),
  handler: async (input, ctx) => {
    const companyId = await getCompanyId(ctx.userId);
    const supabase = await getSupabase();
    const { data: product } = await supabase.from('products').select('id, name')
      .eq('company_id', companyId).ilike('name', `%${input.product_name}%`).eq('deleted', false).maybeSingle();
    if (!product) return { error: `No product matching "${input.product_name}" found. Use search_products first.` };
    return proposeAction(companyId, ctx.userId, 'adjust_inventory', { ...input, product_id: product.id },
      `${input.adjustment_type === 'add' ? 'Adding' : input.adjustment_type === 'remove' ? 'Removing' : 'Setting'} ${input.quantity} units of ${product.name}.`);
  },
});

export const recordSale = defineTool({
  name: 'record_sale',
  description: 'Propose a new sales order with one or more line items. REQUIRES HUMAN APPROVAL. Ask the user for every item, quantity, and the customer before calling this — get full detail via conversation, do not guess quantities.',
  schema: z.object({
    customer_name: z.string(),
    items: z.array(z.object({ product_name: z.string(), quantity: z.number().min(1), rate: z.number().min(0).optional() })).min(1),
    payment_method: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'cheque']).default('cash'),
  }),
  handler: async (input, ctx) => {
    const companyId = await getCompanyId(ctx.userId);
    const supabase = await getSupabase();
    // Resolve each product by name so the approval preview shows real
    // matched products, not just what was said.
    const resolvedItems = await Promise.all(
      input.items.map(async (item) => {
        const { data: product } = await supabase.from('products').select('id, name, sale_price, mrp')
          .eq('company_id', companyId).ilike('name', `%${item.product_name}%`).eq('deleted', false).maybeSingle();
        return {
          product_id: product?.id ?? null,
          product_name_raw: item.product_name,
          product_name_matched: product?.name ?? null,
          quantity: item.quantity,
          rate: item.rate ?? (product ? Number(product.sale_price || product.mrp) : null),
        };
      })
    );
    const unmatched = resolvedItems.filter((i) => !i.product_id);
    if (unmatched.length > 0) {
      return { error: `Could not match: ${unmatched.map((i) => i.product_name_raw).join(', ')}. Use search_products to find the right names first.` };
    }
    return proposeAction(companyId, ctx.userId, 'record_sale',
      { customer_name: input.customer_name, items: resolvedItems, payment_method: input.payment_method },
      `Creating a sale for ${input.customer_name} with ${resolvedItems.length} item(s).`);
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const erpTools: ToolDefinition<any>[] = [
  searchCustomers, searchProducts, searchInvoices, getOutstanding, listRecentSales,
  upsertCustomer, createProduct, recordPayment,
  adjustInventory, recordSale,
];
