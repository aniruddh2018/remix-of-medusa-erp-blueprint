import { z } from 'zod';

const LedgerGroupType = z.enum([
  'assets', 'liabilities', 'income', 'expenses', 'capital',
  'bank', 'cash', 'tax', 'sundry_debtors', 'sundry_creditors',
  'loan', 'investment', 'other',
]);

const LedgerRoleType = z.enum([
  'customer', 'supplier', 'manufacturer', 'distributor',
  'employee', 'doctor', 'bank', 'tax', 'expense', 'income',
  'asset', 'liability',
]);

const BalanceType = z.enum(['debit', 'credit']);

const PartyType = z.enum([
  'individual', 'proprietorship', 'partnership', 'llp',
  'pvt_ltd', 'ltd', 'trust', 'other',
]);

const GstRegistrationType = z.enum([
  'regular', 'composition', 'unregistered', 'ecommerce',
]);

const AddressSchema = z.object({
  line1: z.string().max(200).optional(),
  line2: z.string().max(200).optional(),
  line3: z.string().max(200).optional(),
}).passthrough();

export const createLedgerGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  parentId: z.string().uuid().nullable().optional(),
  groupType: LedgerGroupType.default('other'),
  sortOrder: z.number().int().min(0).default(0),
  affectsStock: z.boolean().default(false),
});

export const updateLedgerGroupSchema = createLedgerGroupSchema.partial().extend({ id: z.string().uuid() });

const GST_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[A-Z\d]$/;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const createLedgerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(300),
  alias: z.string().max(300).optional(),
  ledgerGroupId: z.string().uuid().optional(),
  ledgerCode: z.string().max(50).optional(),
  openingBalance: z.number().min(0).default(0),
  balanceType: BalanceType.default('debit'),
  gstNumber: z.string().regex(GST_RE, 'Invalid GST format').optional().or(z.literal('')),
  gstRegistrationType: GstRegistrationType.default('regular'),
  panNumber: z.string().regex(PAN_RE, 'Invalid PAN format').optional().or(z.literal('')),
  taxId: z.string().max(50).optional(),
  contactPerson: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
  mobile: z.string().max(20).optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  address: AddressSchema.optional(),
  billingAddress: AddressSchema.optional(),
  shippingAddress: AddressSchema.optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  country: z.string().max(100).default('India'),
  bankName: z.string().max(200).optional(),
  bankAccountNumber: z.string().max(30).optional(),
  bankIfsc: z.string().regex(IFSC_RE, 'Invalid IFSC').optional().or(z.literal('')),
  bankBranch: z.string().max(200).optional(),
  partyType: PartyType.default('other'),
  roles: z.array(LedgerRoleType).min(1, 'At least one role is required').default(['customer']),
  primaryRole: LedgerRoleType.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateLedgerSchema = createLedgerSchema.partial().extend({
  id: z.string().uuid(),
  roles: z.array(LedgerRoleType).optional(),
});

export const ledgerFilterSchema = z.object({
  companyId: z.string().uuid(),
  search: z.string().optional(),
  groupId: z.string().uuid().optional(),
  groupType: LedgerGroupType.optional(),
  role: LedgerRoleType.optional(),
  isActive: z.boolean().optional(),
  sourceSystem: z.enum(['manual', 'tally', 'marg', 'imported']).optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  gstNumber: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().min(0).default(0),
  orderBy: z.string().default('name'),
  orderDirection: z.enum(['asc', 'desc']).default('asc'),
});

export const ledgerGroupFilterSchema = z.object({
  companyId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  groupType: LedgerGroupType.optional(),
  search: z.string().optional(),
  includeDescendants: z.boolean().optional(),
});

export const createLedgerRoleSchema = z.object({
  ledgerId: z.string().uuid(),
  roleType: LedgerRoleType,
  isPrimary: z.boolean().default(false),
  priority: z.number().int().min(0).default(0),
  metadata: z.record(z.unknown()).optional(),
});

export const importLedgerGroupsSchema = z.object({
  sessionId: z.string().uuid(),
  groups: z.array(z.object({
    name: z.string().min(1),
    parentName: z.string().nullable().optional(),
    groupType: LedgerGroupType.default('other'),
    affectsStock: z.boolean().default(false),
    sourceData: z.record(z.unknown()).optional(),
  })).min(1),
});

export const importLedgersSchema = z.object({
  sessionId: z.string().uuid(),
  ledgers: z.array(z.object({
    name: z.string().min(1),
    alias: z.string().optional(),
    parentGroupName: z.string(),
    ledgerCode: z.string().optional(),
    openingBalance: z.number().default(0),
    balanceType: BalanceType.default('debit'),
    gstNumber: z.string().optional(),
    panNumber: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    state: z.string().optional(),
    city: z.string().optional(),
    pincode: z.string().optional(),
    country: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankIfsc: z.string().optional(),
    contactPerson: z.string().optional(),
    roleTypes: z.array(LedgerRoleType).default([]),
    sourceData: z.record(z.unknown()).optional(),
  })).min(1),
});

export const confirmImportSchema = z.object({
  sessionId: z.string().uuid(),
  dryRun: z.boolean().default(false),
});

export const mergeLedgersSchema = z.object({
  primaryId: z.string().uuid(),
  duplicateIds: z.array(z.string().uuid()).min(1),
  mergeRoles: z.boolean().default(true),
  mergeContact: z.boolean().default(true),
  mergeBank: z.boolean().default(true),
  mergeTax: z.boolean().default(true),
});

export const closeFinancialYearSchema = z.object({
  companyId: z.string().uuid(),
  financialYear: z.string().regex(/^\d{4}-\d{4}$/, 'Format: YYYY-YYYY'),
});

export const csvImportSchema = z.object({
  companyId: z.string().uuid(),
  rows: z.array(z.object({
    name: z.string().min(1),
    alias: z.string().optional(),
    parentGroupName: z.string().optional(),
    ledgerCode: z.string().optional(),
    openingBalance: z.coerce.number().default(0),
    balanceType: z.enum(['debit', 'credit']).default('debit'),
    gstNumber: z.string().optional(),
    panNumber: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    state: z.string().optional(),
    city: z.string().optional(),
    contactPerson: z.string().optional(),
    roleTypes: z.string().optional(),
  })).min(1),
});

export type CreateLedgerGroupInput = z.infer<typeof createLedgerGroupSchema>;
export type UpdateLedgerGroupInput = z.infer<typeof updateLedgerGroupSchema>;
export type CreateLedgerInput = z.infer<typeof createLedgerSchema>;
export type UpdateLedgerInput = z.infer<typeof updateLedgerSchema>;
export type LedgerFilterInput = z.infer<typeof ledgerFilterSchema>;
export type LedgerGroupFilterInput = z.infer<typeof ledgerGroupFilterSchema>;
export type CreateLedgerRoleInput = z.infer<typeof createLedgerRoleSchema>;
export type ImportLedgerGroupsInput = z.infer<typeof importLedgerGroupsSchema>;
export type ImportLedgersInput = z.infer<typeof importLedgersSchema>;
export type ConfirmImportInput = z.infer<typeof confirmImportSchema>;
export type MergeLedgersInput = z.infer<typeof mergeLedgersSchema>;
export type CloseFinancialYearInput = z.infer<typeof closeFinancialYearSchema>;
export type CsvImportInput = z.infer<typeof csvImportSchema>;
