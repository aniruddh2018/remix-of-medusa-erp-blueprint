import type { TallyMastersParseResult, TallyGroup, TallyStockGroup, TallyFullLedger, TallyGstRateDetail } from '@/types/dataImport';

interface LedgerGroupMapping {
  tallyName: string;
  erpName: string;
  parentId: string | null;
  affectsStock: boolean;
}

interface ManufacturerMapping {
  stockGroupName: string;
  manufacturerName: string;
  parentStockGroup: string;
}

interface UnitMapping {
  tallyUnit: string;
  erpUnit: string;
}

interface TaxMapping {
  tallyRate: number;
  gstPercentage: number;
  hsnCode: string;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
}

interface MappingResult {
  ledgerGroups: LedgerGroupMapping[];
  manufacturers: ManufacturerMapping[];
  units: UnitMapping[];
  taxMappings: TaxMapping[];
  unresolvedGroups: string[];
  unresolvedUnits: string[];
}

const TALLY_TO_ERP_UNIT_MAP: Record<string, string> = {
  TAB: 'Tablet',
  TABS: 'Tablet',
  CAP: 'Capsule',
  CAPS: 'Capsule',
  INJ: 'Injection',
  INJE: 'Injection',
  BOT: 'Bottle',
  BOTL: 'Bottle',
  BOTT: 'Bottle',
  BOX: 'Box',
  TUBE: 'Tube',
  GM: 'Gram',
  ML: 'Milliliter',
  PCS: 'Pieces',
  PC: 'Piece',
  PCE: 'Piece',
  STRIP: 'Strip',
  DROP: 'Drops',
  DRP: 'Drops',
  SACHET: 'Sachet',
  SACH: 'Sachet',
  AMP: 'Ampoule',
  AMPU: 'Ampoule',
  AMPL: 'Ampoule',
  CREAM: 'Cream',
  CREM: 'Cream',
  CRM: 'Cream',
  GEL: 'Gel',
  OINT: 'Ointment',
  SYRUP: 'Syrup',
  SYR: 'Syrup',
  SUS: 'Suspension',
  LIQ: 'Liquid',
  POWDER: 'Powder',
  POW: 'Powder',
  COTTON: 'Cotton',
  COTN: 'Cotton',
  BAND: 'Bandage',
  BNDG: 'Bandage',
  BNDT: 'Bandage',
  BELT: 'Belt',
  KIT: 'Kit',
  JAR: 'Jar',
  CAN: 'Can',
  DOSE: 'Dose',
  VIAL: 'Vial',
  ROLL: 'Roll',
  SET: 'Set',
  PKT: 'Packet',
  NOS: 'Nos',
  PIECE: 'Piece',
  PIECES: 'Pieces',
  PAIR: 'Pair',
  SHEET: 'Sheet',
  MTR: 'Meter',
  CM: 'Centimeter',
  LTR: 'Liter',
  KG: 'Kilogram',
  MCG: 'Microgram',
  MG: 'Milligram',
  UNIT: 'Unit',
  ED: 'Each',
  EA: 'Each',
};

const TALLY_GROUP_HIERARCHY_MAP: Record<string, string> = {
  'BRANCH  DIVISIONS': 'Branch Divisions',
  'CAPITAL ACCOUNT': 'Capital Account',
  'CURRENT ASSETS': 'Current Assets',
  'CURRENT LIABILITIES': 'Current Liabilities',
  'FIXED ASSETS': 'Fixed Assets',
  'INVESTMENTS': 'Investments',
  'LOANS (LIABILITY)': 'Loans (Liability)',
  'MISC. EXPENSES (ASSET)': 'Misc Expenses (Asset)',
  'PROFIT & LOSS AC': 'Profit & Loss',
  'REVENUE ACCOUNT': 'Revenue Account',
  'SUSPENSE ACCOUNT (TEMPORARY ACS)': 'Suspense Account',
  'RESERVES & SURPLUS': 'Reserves & Surplus',
  'SHARE CAPITAL': 'Share Capital',
  'BANK ACCOUNTS': 'Bank Accounts',
  'CASH-IN-HAND': 'Cash In Hand',
  'LOAN & ADVANCES (ASSET)': 'Loan & Advances',
  'SUNDRY DEBTORS': 'Sundry Debtors',
  'SUNDRY CREDITORS': 'Sundry Creditors',
  'DUTIES & TAXES': 'Duties & Taxes',
  'PROVISIONS': 'Provisions',
  'PURCHASE ACCOUNT': 'Purchase Account',
  'SALES ACCOUNT': 'Sales Account',
  'DIRECT EXPENSES': 'Direct Expenses',
  'INDIRECT EXPENSES': 'Indirect Expenses',
  'DIRECT INCOMES': 'Direct Incomes',
  'INDIRECT INCOMES': 'Indirect Incomes',
  'TAX - IGST': 'Tax - IGST',
  'TAX - SGST': 'Tax - SGST',
  'TAX - CGST': 'Tax - CGST',
};

export function buildMappingResult(parseResult: TallyMastersParseResult): MappingResult {
  const ledgerGroups = mapLedgerGroups(parseResult.groups);
  const manufacturers = mapManufacturers(parseResult.stockGroups);
  const units = mapUnits(parseResult.units.map(u => u.name));
  const taxMappings = mapTaxRates(parseResult.gstRates);

  const unresolvedGroups = parseResult.groups
    .filter(g => !TALLY_GROUP_HIERARCHY_MAP[g.name.toUpperCase()])
    .map(g => g.name);

  const unresolvedUnits = parseResult.units
    .filter(u => !TALLY_TO_ERP_UNIT_MAP[u.name.toUpperCase()])
    .map(u => u.name);

  return {
    ledgerGroups,
    manufacturers,
    units,
    taxMappings,
    unresolvedGroups,
    unresolvedUnits,
  };
}

function mapLedgerGroups(groups: TallyGroup[]): LedgerGroupMapping[] {
  return groups.map(g => ({
    tallyName: g.name,
    erpName: TALLY_GROUP_HIERARCHY_MAP[g.name.toUpperCase()] || g.name,
    parentId: g.parent ? null : null,
    affectsStock: false,
  }));
}

function mapManufacturers(stockGroups: TallyStockGroup[]): ManufacturerMapping[] {
  const seen = new Set<string>();
  const result: ManufacturerMapping[] = [];

  for (const sg of stockGroups) {
    const name = sg.name.trim();
    if (!seen.has(name.toUpperCase())) {
      seen.add(name.toUpperCase());
      result.push({
        stockGroupName: name,
        manufacturerName: name,
        parentStockGroup: sg.parent,
      });
    }
  }

  return result;
}

function mapUnits(tallyUnits: string[]): UnitMapping[] {
  const seen = new Set<string>();
  const result: UnitMapping[] = [];

  for (const u of tallyUnits) {
    const key = u.toUpperCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      tallyUnit: u,
      erpUnit: TALLY_TO_ERP_UNIT_MAP[key] || u,
    });
  }

  return result;
}

function mapTaxRates(gstRates: TallyGstRateDetail[]): TaxMapping[] {
  return gstRates.map(r => ({
    tallyRate: r.effective_rate,
    gstPercentage: r.effective_rate,
    hsnCode: r.hsn_code,
    cgstRate: r.cgst_rate,
    sgstRate: r.sgst_rate,
    igstRate: r.igst_rate,
  }));
}

export function classifyLedgerType(parentGroup: string): string {
  const g = parentGroup.toUpperCase();
  if (g.includes('SUNDRY CREDITOR') || g.includes('CREDITOR')) return 'supplier';
  if (g.includes('SUNDRY DEBTOR') || g.includes('DEBTOR')) return 'customer';
  if (g.includes('BANK ACCOUNT') || g.includes('BANK')) return 'bank';
  if (g.includes('CASH-IN-HAND') || g.includes('CASH')) return 'cash';
  if (g.includes('DUTIES') || g.includes('TAX')) return 'gst';
  if (g.includes('PURCHASE ACCOUNT') || g.includes('SALES ACCOUNT')) return 'income';
  if (g.includes('EXPENSE')) return 'expense';
  if (g.includes('FIXED ASSET') || g.includes('CAPITAL') || g.includes('INVESTMENT')) return 'asset';
  if (g.includes('LIABILIT') || g.includes('PROVISION') || g.includes('RESERVES')) return 'liability';
  return 'general';
}

export function resolveUnitName(tallyUnit: string): string {
  return TALLY_TO_ERP_UNIT_MAP[tallyUnit.toUpperCase().trim()] || tallyUnit;
}

export function resolveGroupName(tallyGroupName: string): string {
  return TALLY_GROUP_HIERARCHY_MAP[tallyGroupName.toUpperCase()] || tallyGroupName;
}

export function filterLedgersByType(
  ledgers: TallyFullLedger[],
  types: string[]
): TallyFullLedger[] {
  return ledgers.filter(l => types.includes(l.ledger_type));
}

export function getUniqueManufacturers(stockGroups: TallyStockGroup[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const sg of stockGroups) {
    const key = sg.name.trim().toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(sg.name.trim());
    }
  }
  return result;
}

export function getUniqueGroupNames(groups: TallyGroup[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const g of groups) {
    const key = g.name.trim().toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(g.name.trim());
    }
  }
  return result;
}
