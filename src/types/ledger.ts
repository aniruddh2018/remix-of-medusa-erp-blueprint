/**
 * Unified Ledger System — TypeScript Types
 *
 * Design: Single ledger table for ALL parties. Roles assigned via ledger_roles.
 * Replaces: customers, suppliers, manufacturers, distributors tables.
 */

// ─── Enums ─────────────────────────────────────────────────────────────────

export type LedgerGroupType =
  | 'assets'
  | 'liabilities'
  | 'income'
  | 'expenses'
  | 'capital'
  | 'bank'
  | 'cash'
  | 'tax'
  | 'sundry_debtors'
  | 'sundry_creditors'
  | 'loan'
  | 'investment'
  | 'other';

export type LedgerRoleType =
  | 'customer'
  | 'supplier'
  | 'manufacturer'
  | 'distributor'
  | 'employee'
  | 'doctor'
  | 'bank'
  | 'tax'
  | 'expense'
  | 'income'
  | 'asset'
  | 'liability';

export type BalanceType = 'debit' | 'credit';

export type PartyType =
  | 'individual'
  | 'proprietorship'
  | 'partnership'
  | 'llp'
  | 'pvt_ltd'
  | 'ltd'
  | 'trust'
  | 'other';

export type GstRegistrationType = 'regular' | 'composition' | 'unregistered' | 'ecommerce';

// ─── Core Entities ─────────────────────────────────────────────────────────

export interface LedgerGroup {
  id: string;
  companyId: string;
  name: string;
  parentId: string | null;
  groupType: LedgerGroupType;
  materializedPath: string;
  level: number;
  sortOrder: number;
  affectsStock: boolean;
  isSystem: boolean;
  sourceSystem: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Joined
  children?: LedgerGroup[];
}

export interface Ledger {
  id: string;
  companyId: string;
  ledgerGroupId: string | null;
  name: string;
  alias: string | null;
  ledgerCode: string | null;
  openingBalance: number;
  balanceType: BalanceType;
  currentBalance: number;

  // GST / Tax
  gstNumber: string | null;
  gstRegistrationType: GstRegistrationType;
  panNumber: string | null;
  taxId: string | null;

  // Contact
  contactPerson: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;

  // Address
  address: Record<string, unknown>;
  billingAddress: Record<string, unknown>;
  shippingAddress: Record<string, unknown>;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;

  // Bank
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankBranch: string | null;

  // Classification
  partyType: PartyType;

  // Integration
  sourceSystem: string;
  sourceLedgerName: string | null;
  sourceGroupName: string | null;
  importMetadata: Record<string, unknown>;

  // Status
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  // Joined / computed
  group?: LedgerGroup;
  roles?: LedgerRole[];
  primaryRole?: LedgerRoleType | null;
  balance?: LedgerBalance;
}

export interface LedgerRole {
  id: string;
  ledgerId: string;
  companyId: string;
  roleType: LedgerRoleType;
  isPrimary: boolean;
  priority: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface LedgerBalance {
  id: string;
  ledgerId: string;
  companyId: string;
  financialYear: string;
  openingBalance: number;
  openingBalanceType: BalanceType;
  currentBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  closingBalanceType: BalanceType;
  createdAt: string;
  updatedAt: string;
}

// ─── Import / Staging ────────────────────────────────────────────────────────

export interface LedgerImportSession {
  id: string;
  companyId: string;
  userId: string | null;
  name: string;
  sourceSystem: string;
  fileName: string | null;
  fileSize: number | null;
  status: 'uploaded' | 'parsing' | 'staging' | 'reviewing' | 'importing' | 'completed' | 'failed' | 'rolled_back';
  groupsImported: number;
  ledgersImported: number;
  groupsFailed: number;
  ledgersFailed: number;
  duplicateGroups: number;
  duplicateLedgers: number;
  errorLog: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface StagingLedgerGroup {
  id: string;
  sessionId: string;
  companyId: string;
  rowIndex: number;
  name: string;
  parentName: string | null;
  groupType: LedgerGroupType | string;
  materializedPath: string;
  level: number;
  affectsStock: boolean;
  sourceData: Record<string, unknown>;
  validationStatus: string;
  validationErrors: string[];
  mappedGroupId: string | null;
  resolved: boolean;
  createdAt: string;
}

export interface StagingLedger {
  id: string;
  sessionId: string;
  companyId: string;
  rowIndex: number;
  name: string;
  alias: string | null;
  parentGroupName: string | null;
  ledgerCode: string | null;
  openingBalance: number;
  balanceType: BalanceType;
  gstNumber: string | null;
  panNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  state: string | null;
  city: string | null;
  pincode: string | null;
  country: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  contactPerson: string | null;
  roleTypes: LedgerRoleType[];
  sourceData: Record<string, unknown>;
  validationStatus: string;
  validationErrors: string[];
  mappedLedgerId: string | null;
  mappedGroupId: string | null;
  resolved: boolean;
  createdAt: string;
}

// ─── API Request / Response ────────────────────────────────────────────────

export interface CreateLedgerRequest {
  name: string;
  alias?: string;
  ledgerGroupId?: string;
  ledgerCode?: string;
  openingBalance?: number;
  balanceType?: BalanceType;
  gstNumber?: string;
  gstRegistrationType?: GstRegistrationType;
  panNumber?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  address?: Record<string, unknown>;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  contactPerson?: string;
  partyType?: PartyType;
  roles?: LedgerRoleType[];
  primaryRole?: LedgerRoleType;
  metadata?: Record<string, unknown>;
}

export interface UpdateLedgerRequest extends Partial<CreateLedgerRequest> {
  id: string;
}

export interface CreateLedgerGroupRequest {
  name: string;
  parentId?: string | null;
  groupType?: LedgerGroupType;
  sortOrder?: number;
  affectsStock?: boolean;
}

export interface UpdateLedgerGroupRequest extends Partial<CreateLedgerGroupRequest> {
  id: string;
}

export interface LedgerFilter {
  companyId: string;
  search?: string;
  groupId?: string;
  groupType?: LedgerGroupType;
  role?: LedgerRoleType;
  isActive?: boolean;
  sourceSystem?: string;
  state?: string;
  city?: string;
  gstNumber?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface LedgerGroupFilter {
  companyId: string;
  parentId?: string | null;
  groupType?: LedgerGroupType;
  search?: string;
  includeDescendants?: boolean;
}

export interface LedgerListResponse {
  data: Ledger[];
  count: number;
  limit: number;
  offset: number;
}

export interface LedgerGroupTreeResponse {
  data: LedgerGroup[];
}

// ─── Import ────────────────────────────────────────────────────────────────

export interface MargGroupImport {
  name: string;
  parentName: string | null;
  reservedName: string | null;
  affectsStock: boolean;
}

export interface MargLedgerImport {
  name: string;
  parentGroupName: string;
  ledgerType: string;
  gstNumber: string | null;
  panNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  state: string | null;
  openingBalance: number;
  balanceType: BalanceType;
  roleTypes: LedgerRoleType[];
  sourceData: Record<string, unknown>;
}

export interface ImportPreview {
  groups: { total: number; new: number; existing: number; errors: number };
  ledgers: { total: number; new: number; existing: number; errors: number };
  errors: { rowIndex: number; name: string; error: string }[];
}

export interface ImportResult {
  sessionId: string;
  groupsImported: number;
  groupsFailed: number;
  ledgersImported: number;
  ledgersFailed: number;
  duplicateGroups: number;
  duplicateLedgers: number;
  errors: string[];
}

// ─── Hierarchy ─────────────────────────────────────────────────────────────

export interface LedgerGroupNode extends LedgerGroup {
  children: LedgerGroupNode[];
  ledgerCount?: number;
}

export interface LedgerGroupFlat {
  id: string;
  name: string;
  parentId: string | null;
  groupType: LedgerGroupType;
  level: number;
  fullPath: string;
}

// ─── Audit Log ──────────────────────────────────────────────────────────────

export type LedgerAuditAction = 'create' | 'update' | 'delete' | 'merge' | 'role_add' | 'role_remove' | 'balance_close' | 'import';

export interface LedgerAuditEntry {
  id: string;
  companyId: string;
  userId: string | null;
  ledgerId: string | null;
  action: LedgerAuditAction;
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  changedFields: string[];
  description: string;
  createdAt: string;
}

// ─── Trial Balance ──────────────────────────────────────────────────────────

export interface TrialBalanceRow {
  groupName: string;
  groupType: LedgerGroupType | string;
  totalDebit: number;
  totalCredit: number;
}

export interface TrialBalanceResult {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  difference: number;
  isBalanced: boolean;
  financialYear: string;
}

// ─── Duplicate Detection ────────────────────────────────────────────────────

export interface DuplicateLedgerGroup {
  ledgers: { id: string; name: string; gstNumber: string | null; roles: LedgerRoleType[]; sourceSystem: string }[];
  matchReason: string;
  matchScore: number;
}

// ─── CSV Import ──────────────────────────────────────────────────────────────

export interface CsvLedgerRow {
  name: string;
  alias?: string;
  parentGroupName?: string;
  ledgerCode?: string;
  openingBalance?: number;
  balanceType?: BalanceType;
  gstNumber?: string;
  panNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  state?: string;
  city?: string;
  pincode?: string;
  contactPerson?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  roleTypes?: string;
  [key: string]: string | number | undefined;
}

// ─── Financial Year ──────────────────────────────────────────────────────────

export interface FinancialYearCloseResult {
  financialYear: string;
  ledgersClosed: number;
  entries: { ledgerId: string; name: string; closingBalance: number; closingBalanceType: string }[];
}

// ─── Journal Vouchers ──────────────────────────────────────────────────────────

export type JournalReferenceType = 'sales_order' | 'purchase_order' | 'payment' | 'adjustment';

export interface JournalVoucher {
  id: string;
  companyId: string;
  date: string;
  referenceType: JournalReferenceType;
  referenceId: string | null;
  referenceNumber: string | null;
  narration: string;
  totalAmount: number;
  createdBy: string | null;
  createdAt: string;
}

export interface JournalVoucherLine {
  id: string;
  voucherId: string;
  ledgerId: string;
  companyId: string;
  debitAmount: number;
  creditAmount: number;
  narration: string;
  createdAt: string;
}

export interface LedgerTransaction {
  date: string;
  refType: string;
  refNumber: string | null;
  narration: string;
  debit: number;
  credit: number;
  runningBalance: number;
  voucherId: string;
}

export interface LedgerBalanceWithName {
  id: string;
  companyId: string;
  name: string;
  alias: string | null;
  ledgerCode: string | null;
  openingBalance: number;
  balanceType: BalanceType;
  financialYear: string | null;
  currentBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  closingBalanceType: BalanceType;
  roles: LedgerRoleType[];
  groupName: string | null;
  groupType: LedgerGroupType | null;
}
