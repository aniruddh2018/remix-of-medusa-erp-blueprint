import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Upload,
  BookOpen, Users, Building2, Banknote, Stethoscope, Truck,
  Factory, User, Receipt, ArrowUpDown, RefreshCw, FileDown,
  AlertTriangle, CheckCircle2, XCircle, Loader2,
  Merge, History, FileSpreadsheet, Scale, ClipboardCheck,
} from "lucide-react";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import * as ledgerService from "@/services/ledgerService";
import * as ledgerImportService from "@/services/ledgerImportService";
import * as ledgerAdvanced from "@/services/ledgerAdvancedService";
import { syncLedgerToCustomer, syncLedgerToSupplier } from "@/services/ledgerBridge";
import { parse as csvParse } from "papaparse";
import type {
  Ledger, LedgerGroup, LedgerGroupNode, LedgerRoleType, LedgerGroupType,
  LedgerListResponse, CreateLedgerRequest, CreateLedgerGroupRequest,
  ImportPreview, DuplicateLedgerGroup, TrialBalanceResult, LedgerAuditEntry,
  CsvLedgerRow, FinancialYearCloseResult,
} from "@/types/ledger";

const ROLE_ICONS: Record<LedgerRoleType, React.ElementType> = {
  customer: Users, supplier: Truck, manufacturer: Factory,
  distributor: Building2, employee: User, doctor: Stethoscope,
  bank: Banknote, tax: Receipt, expense: ArrowUpDown,
  income: Banknote, asset: Building2, liability: Receipt,
};

const ROLE_COLORS: Record<LedgerRoleType, string> = {
  customer: 'bg-blue-100 text-blue-800', supplier: 'bg-orange-100 text-orange-800',
  manufacturer: 'bg-purple-100 text-purple-800', distributor: 'bg-teal-100 text-teal-800',
  employee: 'bg-slate-100 text-slate-800', doctor: 'bg-green-100 text-green-800',
  bank: 'bg-cyan-100 text-cyan-800', tax: 'bg-red-100 text-red-800',
  expense: 'bg-amber-100 text-amber-800', income: 'bg-emerald-100 text-emerald-800',
  asset: 'bg-indigo-100 text-indigo-800', liability: 'bg-rose-100 text-rose-800',
};

const GROUP_TYPE_LABELS: Record<LedgerGroupType, string> = {
  assets: 'Assets', liabilities: 'Liabilities', income: 'Income',
  expenses: 'Expenses', capital: 'Capital', bank: 'Bank',
  cash: 'Cash', tax: 'Tax', sundry_debtors: 'Sundry Debtors',
  sundry_creditors: 'Sundry Creditors', loan: 'Loans',
  investment: 'Investments', other: 'Other',
};

const ALL_ROLES: LedgerRoleType[] = [
  'customer', 'supplier', 'manufacturer', 'distributor',
  'employee', 'doctor', 'bank', 'tax', 'expense', 'income', 'asset', 'liability',
];

function GroupTreeNode({ node, depth, onSelect, selectedId, onEdit, onDelete }: {
  node: LedgerGroupNode; depth: number;
  onSelect: (id: string) => void; selectedId: string | null;
  onEdit: (g: LedgerGroup) => void; onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <>
      <div
        className={`flex items-center gap-1 py-1.5 px-2 cursor-pointer rounded hover:bg-muted/50 ${isSelected ? 'bg-muted font-medium' : ''}`}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
        onClick={() => { onSelect(node.id); if (hasChildren) setExpanded(!expanded); }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        ) : <span className="w-3.5" />}
        <span className="text-sm flex-1 truncate">{node.name}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
          {GROUP_TYPE_LABELS[node.groupType] || node.groupType}
        </Badge>
        {node.isSystem && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-slate-100 text-slate-600">System</Badge>}
        {!node.isSystem && (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
            <button onClick={(e) => { e.stopPropagation(); onEdit(node); }} className="p-0.5 hover:bg-muted rounded"><Pencil className="h-3 w-3" /></button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(node.id); }} className="p-0.5 hover:bg-destructive/10 rounded"><Trash2 className="h-3 w-3" /></button>
          </div>
        )}
      </div>
      {expanded && hasChildren && node.children!.map(child => (
        <GroupTreeNode key={child.id} node={child} depth={depth + 1}
          onSelect={onSelect} selectedId={selectedId} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  );
}

function TrialBalanceTab() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const [fy, setFy] = useState(() => {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-${y + 1}`;
  });

  const { data, isLoading } = useQuery<TrialBalanceResult>({
    queryKey: ['trial-balance', companyId, fy],
    queryFn: () => ledgerAdvanced.getTrialBalance(companyId!, fy),
    enabled: !!companyId,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Label className="text-sm">Financial Year</Label>
        <Input value={fy} onChange={e => setFy(e.target.value)} className="w-32" placeholder="2025-2026" />
        <Badge variant="outline">{fy}</Badge>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data || data.rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Scale className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>No balances found for {fy}. Open the financial year first or close it after transactions.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3"><div className="text-xs text-muted-foreground">Total Debit</div><div className="text-xl font-bold text-red-600">₹{data.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Total Credit</div><div className="text-xl font-bold text-green-600">₹{data.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Difference</div>
              <div className={`text-xl font-bold ${data.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                {data.isBalanced ? 'Balanced ✓' : `₹${data.difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
              </div>
            </Card>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Group</TableHead><TableHead>Type</TableHead>
                <TableHead className="text-right">Debit (₹)</TableHead><TableHead className="text-right">Credit (₹)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm">{r.groupName}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.groupType}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{r.totalDebit > 0 ? `₹${r.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                    <TableCell className="text-right font-mono">{r.totalCredit > 0 ? `₹${r.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

interface DuplicateLedgerForMerge {
  canonicalName: string;
  duplicateCount: number;
  ledgerIds: string[];
  totalDebit: number;
  totalCredit: number;
}

interface MergePreviewResult {
  canonicalName: string;
  keptLedgerId: string;
  keptLedgerName: string;
  mergedLedgerId: string;
  mergedLedgerName: string;
  transactionsMoved: number;
  ordersUpdated: number;
  paymentsUpdated: number;
  status: string;
}

function DuplicatesTab() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isMerging, setIsMerging] = useState(false);
  const [previewResults, setPreviewResults] = useState<MergePreviewResult[] | null>(null);

  const { data: duplicates, isLoading, refetch } = useQuery<DuplicateLedgerForMerge[]>({
    queryKey: ['ledger-duplicates-db', companyId],
    queryFn: () => ledgerAdvanced.findDuplicateLedgers(companyId!),
    enabled: !!companyId,
  });

  const handlePreview = async () => {
    if (!companyId) return;
    setIsMerging(true);
    try {
      const results = await ledgerAdvanced.bulkMergeDuplicateLedgers(companyId, true);
      setPreviewResults(results);
      toast({ title: 'Preview Ready', description: `${results.filter(r => r.status === 'WOULD_MERGE').length} duplicates would be merged` });
    } catch (err) {
      toast({ title: 'Preview failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsMerging(false);
    }
  };

  const handleBulkMerge = async () => {
    if (!companyId) return;
    if (!confirm('This will merge all duplicate ledgers. This action cannot be undone. Continue?')) return;
    
    setIsMerging(true);
    try {
      const results = await ledgerAdvanced.bulkMergeDuplicateLedgers(companyId, false);
      const merged = results.filter(r => r.status === 'MERGED').length;
      const errors = results.filter(r => r.status.startsWith('ERROR')).length;
      
      toast({ 
        title: 'Merge Complete', 
        description: `${merged} groups merged${errors > 0 ? `, ${errors} errors` : ''}`,
        variant: errors > 0 ? 'destructive' : 'default'
      });
      
      setPreviewResults(results);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['ledgers'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-stats'] });
    } catch (err) {
      toast({ title: 'Merge failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsMerging(false);
    }
  };

  const handleMergeSingle = async (duplicate: DuplicateLedgerForMerge) => {
    if (!companyId) return;
    if (!confirm(`Merge ${duplicate.duplicateCount - 1} duplicate(s) into "${duplicate.canonicalName}"?`)) return;
    
    setIsMerging(true);
    try {
      // Find the target ledger (first with both roles, or most transactions)
      const targetId = duplicate.ledgerIds[0]; // Already sorted by RPC function
      const sourceIds = duplicate.ledgerIds.slice(1);
      
      for (const sourceId of sourceIds) {
        await ledgerAdvanced.mergeLedgers(sourceId, targetId, companyId);
      }
      
      toast({ title: 'Merged', description: `${sourceIds.length} ledger(s) merged into "${duplicate.canonicalName}"` });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['ledgers'] });
    } catch (err) {
      toast({ title: 'Merge failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsMerging(false);
    }
  };

  const clearPreview = () => setPreviewResults(null);

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Duplicate Ledgers</h3>
          <p className="text-xs text-muted-foreground">Merge duplicate party records to consolidate transaction history</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isMerging}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isLoading ? 'animate-spin' : ''}`} />Scan
          </Button>
          <Button variant="outline" size="sm" onClick={handlePreview} disabled={isMerging || !duplicates?.length}>
            <ClipboardCheck className="h-3.5 w-3.5 mr-1" />Preview
          </Button>
          <Button size="sm" onClick={handleBulkMerge} disabled={isMerging || !duplicates?.length} className="bg-amber-600 hover:bg-amber-700">
            {isMerging ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Merge className="h-3.5 w-3.5 mr-1" />}
            Merge All
          </Button>
        </div>
      </div>

      {/* Preview results */}
      {previewResults && (
        <Card className="p-4 bg-muted/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">
              {previewResults.some(r => r.status === 'MERGED') ? 'Merge Results' : 'Preview (Dry Run)'}
            </h4>
            <Button variant="ghost" size="sm" onClick={clearPreview}><XCircle className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {previewResults.map((result, i) => (
              <div key={i} className={`flex items-center justify-between p-2 rounded text-xs ${
                result.status === 'MERGED' ? 'bg-green-50 border border-green-200' :
                result.status === 'WOULD_MERGE' ? 'bg-blue-50 border border-blue-200' :
                'bg-red-50 border border-red-200'
              }`}>
                <div>
                  <span className="font-medium">{result.canonicalName}</span>
                  <span className="text-muted-foreground ml-2">
                    {result.mergedLedgerName} → {result.keptLedgerName}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {result.transactionsMoved > 0 && <span className="text-muted-foreground">{result.transactionsMoved} tx</span>}
                  {result.ordersUpdated > 0 && <span className="text-muted-foreground">{result.ordersUpdated} orders</span>}
                  {result.paymentsUpdated > 0 && <span className="text-muted-foreground">{result.paymentsUpdated} payments</span>}
                  <Badge variant={result.status === 'MERGED' ? 'default' : result.status === 'WOULD_MERGE' ? 'secondary' : 'destructive'} className="text-[10px]">
                    {result.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          {previewResults.some(r => r.status === 'WOULD_MERGE') && (
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={handleBulkMerge} className="bg-amber-600 hover:bg-amber-700">
                <Merge className="h-3.5 w-3.5 mr-1" /> Execute Merge
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Duplicate list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !duplicates || duplicates.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
          <p>No duplicate ledgers detected.</p>
          <p className="text-xs mt-1">All party records are unique and properly linked.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{duplicates.length} duplicate group(s) found</p>
          {duplicates.map((group, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">{group.canonicalName}</span>
                  <Badge variant="outline" className="text-[10px]">{group.duplicateCount} ledgers</Badge>
                  {group.totalDebit > 0 || group.totalCredit > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Dr: ₹{group.totalDebit.toFixed(2)} · Cr: ₹{group.totalCredit.toFixed(2)}
                    </span>
                  )}
                </div>
                <Button size="sm" onClick={() => handleMergeSingle(group)} disabled={isMerging}>
                  {isMerging ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Merge className="h-3.5 w-3.5 mr-1" />}
                  Merge
                </Button>
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                Ledger IDs: {group.ledgerIds.join(', ')}
              </div>
              <div className="flex flex-wrap gap-2">
                {group.ledgerIds.map((id, idx) => (
                  <div key={id} className={`px-3 py-1.5 rounded border text-xs ${idx === 0 ? 'border-green-300 bg-green-50' : ''}`}>
                    <div className="font-medium font-mono text-[10px]">{id.substring(0, 8)}...</div>
                    {idx === 0 && <Badge className="text-[9px] px-1 py-0 h-3 bg-green-100 text-green-800">Keep</Badge>}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditTab() {
  const { companyId } = useBusiness();
  const [actionFilter, setActionFilter] = useState<string>('all');

  const { data, isLoading } = useQuery<{ data: LedgerAuditEntry[]; count: number }>({
    queryKey: ['ledger-audit', companyId, actionFilter],
    queryFn: () => ledgerAdvanced.getLedgerAuditLog(companyId!, { action: actionFilter !== 'all' ? actionFilter : undefined, limit: 100 }),
    enabled: !!companyId,
  });

  const ACTION_COLORS: Record<string, string> = {
    create: 'bg-green-100 text-green-800', update: 'bg-blue-100 text-blue-800',
    delete: 'bg-red-100 text-red-800', merge: 'bg-purple-100 text-purple-800',
    role_add: 'bg-cyan-100 text-cyan-800', role_remove: 'bg-amber-100 text-amber-800',
    balance_close: 'bg-slate-100 text-slate-800', import: 'bg-teal-100 text-teal-800',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="text-sm">Action</Label>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {['create', 'update', 'delete', 'merge', 'role_add', 'role_remove', 'balance_close', 'import'].map(a => (
              <SelectItem key={a} value={a}>{a.replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline">{data?.count ?? 0} entries</Badge>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data || data.data.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>No audit entries found.</p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Time</TableHead><TableHead>Action</TableHead>
              <TableHead>Description</TableHead><TableHead>Changed Fields</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.data.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 ${ACTION_COLORS[entry.action] || ''}`}>
                      {entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm max-w-[300px] truncate">{entry.description}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-wrap gap-1">
                      {entry.changedFields.slice(0, 5).map(f => (
                        <Badge key={f} variant="outline" className="text-[9px] px-1 py-0 h-3">{f}</Badge>
                      ))}
                      {entry.changedFields.length > 5 && <span className="text-[10px] text-muted-foreground">+{entry.changedFields.length - 5}</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function CsvImportTab() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicates: number; errors: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setImporting(true);
    setResult(null);
    try {
      const text = await file.text();
      const parsed = csvParse<CsvLedgerRow>(text, { header: true, skipEmptyLines: true });
      if (parsed.errors.length > 0) {
        toast({ title: 'CSV Parse Errors', description: `${parsed.errors.length} errors found. Check format.`, variant: 'destructive' });
      }
      const rows = parsed.data.filter(r => r.name && r.name.trim());
      if (rows.length === 0) {
        toast({ title: 'No rows', description: 'CSV must have a "name" column', variant: 'destructive' });
        setImporting(false);
        return;
      }
      const r = await ledgerAdvanced.importLedgersFromCsv(companyId!, rows);
      setResult(r);
      toast({ title: `Imported ${r.imported} ledgers`, description: `${r.duplicates} duplicates, ${r.errors} errors` });
    } catch (err) {
      toast({ title: 'Import failed', description: err instanceof Error ? err.message : 'Unknown', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-2">Import Ledgers from CSV</h3>
        <p className="text-xs text-muted-foreground mb-4">
          CSV must have a header row with at least a "name" column. Optional: alias, parentGroupName, ledgerCode,
          openingBalance, balanceType, gstNumber, panNumber, phone, email, state, city, contactPerson, roleTypes (comma-separated).
        </p>
        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
          <Upload className="w-6 h-6 text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">Click or drag CSV file</p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }} />
        </label>
        {importing && <div className="flex items-center gap-2 mt-3"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Importing...</span></div>}
        {result && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            <Card className="p-3"><div className="text-xs text-muted-foreground">Imported</div><div className="text-lg font-bold text-green-600">{result.imported}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Duplicates</div><div className="text-lg font-bold text-amber-600">{result.duplicates}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Errors</div><div className="text-lg font-bold text-red-600">{result.errors}</div></Card>
          </div>
        )}
      </Card>
    </div>
  );
}

function YearCloseTab() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const [fy, setFy] = useState(() => {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-${y + 1}`;
  });
  const [closing, setClosing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [closeResult, setCloseResult] = useState<FinancialYearCloseResult | null>(null);

  const handleClose = async () => {
    if (!confirm(`Close financial year ${fy}? This will finalize all closing balances.`)) return;
    setClosing(true);
    try {
      const r = await ledgerAdvanced.closeFinancialYear(companyId!, fy);
      setCloseResult(r);
      toast({ title: `Year ${fy} closed`, description: `${r.ledgersClosed} ledgers finalized` });
    } catch (err) {
      toast({ title: 'Close failed', description: err instanceof Error ? err.message : 'Unknown', variant: 'destructive' });
    } finally {
      setClosing(false);
    }
  };

  const handleOpen = async () => {
    const prevY = fy.split('-')[0];
    const prevYear = `${parseInt(prevY) - 1}-${prevY}`;
    setOpening(true);
    try {
      const r = await ledgerAdvanced.openFinancialYear(companyId!, fy, prevYear);
      toast({ title: `Year ${fy} opened`, description: `${r.created} ledger balances created from ${prevYear}` });
    } catch (err) {
      toast({ title: 'Open failed', description: err instanceof Error ? err.message : 'Unknown', variant: 'destructive' });
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-3">Financial Year Management</h3>
        <div className="flex items-center gap-3 mb-4">
          <Label className="text-sm">Year</Label>
          <Input value={fy} onChange={e => setFy(e.target.value)} className="w-32" placeholder="2025-2026" />
        </div>
        <div className="flex gap-3">
          <Button onClick={handleOpen} disabled={opening}>
            {opening ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Open New Year
          </Button>
          <Button variant="destructive" onClick={handleClose} disabled={closing}>
            {closing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Close Year {fy}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          <strong>Open</strong>: Carries forward closing balances from the previous year as opening balances.
          <br /><strong>Close</strong>: Finalizes all closing balances for the selected year. Run after all transactions are posted.
        </p>
      </Card>

      {closeResult && (
        <Card className="p-4">
          <h4 className="text-sm font-medium mb-2">Closed {closeResult.financialYear} — {closeResult.ledgersClosed} ledgers</h4>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Ledger</TableHead><TableHead className="text-right">Closing Balance</TableHead><TableHead>Type</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {closeResult.entries.slice(0, 20).map(e => (
                <TableRow key={e.ledgerId}>
                  <TableCell className="text-sm">{e.name}</TableCell>
                  <TableCell className="text-right font-mono">₹{Math.abs(e.closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{e.closingBalanceType}</Badge></TableCell>
                </TableRow>
              ))}
              {closeResult.entries.length > 20 && (
                <TableRow><TableCell colSpan={3} className="text-xs text-muted-foreground text-center">
                  ...and {closeResult.entries.length - 20} more
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

export default function LedgerManagement() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { companyId } = useBusiness();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("ledgers");

  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [isLedgerDialogOpen, setIsLedgerDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<LedgerGroup | null>(null);
  const [editingLedger, setEditingLedger] = useState<Ledger | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [groupForm, setGroupForm] = useState<CreateLedgerGroupRequest>({ name: '', groupType: 'other' });
  const [ledgerForm, setLedgerForm] = useState<CreateLedgerRequest & { id?: string }>({ name: '', roles: ['customer'] });

  const searchRef = useRef<HTMLInputElement>(null);
  useKeyboardShortcut({ key: "/", callback: () => { searchRef.current?.focus(); searchRef.current?.select(); } });

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: groupTree, isLoading: groupsLoading } = useQuery({
    queryKey: ['ledger-group-tree', companyId],
    queryFn: () => ledgerService.getLedgerGroupTree(companyId!),
    enabled: !!companyId,
  });

  const { data: flatGroups } = useQuery({
    queryKey: ['ledger-groups-flat', companyId],
    queryFn: () => ledgerService.getLedgerGroupFlatList(companyId!),
    enabled: !!companyId,
  });

  const { data: ledgerData, isLoading: ledgersLoading } = useQuery<LedgerListResponse>({
    queryKey: ['ledgers', companyId, searchQuery, roleFilter, groupFilter],
    queryFn: () => ledgerService.getLedgers({
      companyId: companyId!,
      search: searchQuery || undefined,
      role: roleFilter !== 'all' ? (roleFilter as LedgerRoleType) : undefined,
      groupId: groupFilter !== 'all' ? groupFilter : undefined,
      limit: 200,
    }),
    enabled: !!companyId,
  });

  const { data: stats } = useQuery({
    queryKey: ['ledger-stats', companyId],
    queryFn: () => ledgerService.getLedgerStats(companyId!),
    enabled: !!companyId,
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createGroupMutation = useMutation({
    mutationFn: (input: CreateLedgerGroupRequest) => ledgerService.createLedgerGroup(companyId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-group-tree'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-groups-flat'] });
      setIsGroupDialogOpen(false);
      setGroupForm({ name: '', groupType: 'other' });
      toast({ title: 'Group created successfully' });
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateLedgerGroupRequest> }) =>
      ledgerService.updateLedgerGroup(id, companyId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-group-tree'] });
      setIsGroupDialogOpen(false);
      setEditingGroup(null);
      toast({ title: 'Group updated successfully' });
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => ledgerService.deleteLedgerGroup(id, companyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-group-tree'] });
      toast({ title: 'Group deactivated' });
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const createLedgerMutation = useMutation({
    mutationFn: (input: CreateLedgerRequest) => ledgerService.createLedger(companyId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledgers'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-stats'] });
      setIsLedgerDialogOpen(false);
      setLedgerForm({ name: '', roles: ['customer'] });
      toast({ title: 'Ledger created successfully' });
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const updateLedgerMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<CreateLedgerRequest> }) => {
      const result = await ledgerService.updateLedger(id, companyId!, input);
      // Sync to legacy tables when roles are modified
      if (input.roles?.includes('customer')) {
        await syncLedgerToCustomer(id, companyId!);
      }
      if (input.roles?.includes('supplier')) {
        await syncLedgerToSupplier(id, companyId!);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledgers'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-stats'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setIsLedgerDialogOpen(false);
      setEditingLedger(null);
      toast({ title: 'Ledger updated successfully' });
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const deleteLedgerMutation = useMutation({
    mutationFn: (id: string) => ledgerService.deleteLedger(id, companyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledgers'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-stats'] });
      toast({ title: 'Ledger deactivated' });
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: () => ledgerService.seedDefaultLedgerGroups(companyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-group-tree'] });
      toast({ title: 'Default groups seeded' });
    },
    onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleEditGroup = useCallback((g: LedgerGroup) => {
    setEditingGroup(g);
    setGroupForm({ name: g.name, parentId: g.parentId, groupType: g.groupType, sortOrder: g.sortOrder, affectsStock: g.affectsStock });
    setIsGroupDialogOpen(true);
  }, []);

  const handleSaveGroup = useCallback(() => {
    if (editingGroup) {
      updateGroupMutation.mutate({ id: editingGroup.id, input: groupForm });
    } else {
      createGroupMutation.mutate(groupForm);
    }
  }, [editingGroup, groupForm, createGroupMutation, updateGroupMutation]);

  const handleEditLedger = useCallback((l: Ledger) => {
    setEditingLedger(l);
    setLedgerForm({
      id: l.id, name: l.name, alias: l.alias ?? undefined,
      ledgerGroupId: l.ledgerGroupId ?? undefined, ledgerCode: l.ledgerCode ?? undefined,
      openingBalance: l.openingBalance, balanceType: l.balanceType,
      gstNumber: l.gstNumber ?? undefined, panNumber: l.panNumber ?? undefined,
      phone: l.phone ?? undefined, email: l.email ?? undefined,
      city: l.city ?? undefined, state: l.state ?? undefined,
      contactPerson: l.contactPerson ?? undefined,
      bankName: l.bankName ?? undefined, bankAccountNumber: l.bankAccountNumber ?? undefined,
      bankIfsc: l.bankIfsc ?? undefined, bankBranch: l.bankBranch ?? undefined,
      roles: l.roles ?? [l.primaryRole ?? 'customer'],
      primaryRole: l.primaryRole ?? undefined,
      partyType: l.partyType,
    });
    setIsLedgerDialogOpen(true);
  }, []);

  const handleSaveLedger = useCallback(() => {
    if (editingLedger) {
      updateLedgerMutation.mutate({ id: editingLedger.id, input: ledgerForm });
    } else {
      createLedgerMutation.mutate(ledgerForm);
    }
  }, [editingLedger, ledgerForm, createLedgerMutation, updateLedgerMutation]);

  const toggleLedgerRole = useCallback((role: LedgerRoleType) => {
    const current = ledgerForm.roles ?? [];
    const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
    setLedgerForm(prev => ({ ...prev, roles: next, primaryRole: next[0] }));
  }, [ledgerForm.roles]);

  const ledgers = ledgerData?.data ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Unified ledger system — {stats?.totalLedgers ?? 0} ledgers across {stats?.totalGroups ?? 0} groups
          </p>
        </div>
        <div className="flex gap-2">
          {groupTree && groupTree.length === 0 && (
            <Button variant="outline" onClick={() => seedDefaultsMutation.mutate()} disabled={seedDefaultsMutation.isPending}>
              {seedDefaultsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Seed Defaults
            </Button>
          )}
          <Button onClick={() => { setEditingLedger(null); setLedgerForm({ name: '', roles: ['customer'] }); setIsLedgerDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Ledger
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3"><div className="text-xs text-muted-foreground">Total Ledgers</div><div className="text-xl font-bold">{stats.totalLedgers}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">Active</div><div className="text-xl font-bold text-green-600">{stats.activeLedgers}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">Groups</div><div className="text-xl font-bold">{stats.totalGroups}</div></Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Role Breakdown</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(stats.roleBreakdown).slice(0, 4).map(([role, count]) => (
                <Badge key={role} variant="outline" className="text-[10px]">{role}: {count}</Badge>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="ledgers">Ledgers</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="trial-balance" className="gap-1"><Scale className="h-3.5 w-3.5" />Trial Balance</TabsTrigger>
          <TabsTrigger value="duplicates" className="gap-1"><Merge className="h-3.5 w-3.5" />Duplicates</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1"><History className="h-3.5 w-3.5" />Audit</TabsTrigger>
          <TabsTrigger value="import-csv" className="gap-1"><FileSpreadsheet className="h-3.5 w-3.5" />CSV Import</TabsTrigger>
          <TabsTrigger value="year-close" className="gap-1"><ClipboardCheck className="h-3.5 w-3.5" />Year Close</TabsTrigger>
        </TabsList>

        {/* LEDGERS TAB */}
        <TabsContent value="ledgers" className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input ref={searchRef} placeholder="Search ledgers..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Groups" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Groups</SelectItem>
                {flatGroups?.map(g => <SelectItem key={g.id} value={g.id}>{'—'.repeat(g.level)} {g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {ledgersLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : ledgers.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No ledgers found. Create your first ledger or import from Tally/Marg.</p>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Current Balance</TableHead>
                    <TableHead>GST</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgers.map(l => {
                    const RoleIcon = l.primaryRole ? ROLE_ICONS[l.primaryRole] : BookOpen;
                    const bal = l.currentBalance ?? l.openingBalance ?? 0;
                    return (
                      <TableRow key={l.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <RoleIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                              <div className="font-medium text-sm">{l.name}</div>
                              {l.alias && <div className="text-xs text-muted-foreground">{l.alias}</div>}
                              {l.ledgerCode && <div className="text-xs text-muted-foreground">Code: {l.ledgerCode}</div>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {l.roles?.map(r => (
                              <Badge key={r} className={`text-[10px] px-1.5 py-0 h-4 ${ROLE_COLORS[r] || ''}`}>
                                {r}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {l.group?.name || '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <span className={l.openingBalance > 0 ? 'text-red-600' : l.openingBalance < 0 ? 'text-green-600' : ''}>
                            ₹{Math.abs(l.openingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">{l.balanceType === 'debit' ? 'Dr' : 'Cr'}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <span className={bal > 0 ? 'text-red-600' : bal < 0 ? 'text-green-600' : ''}>
                            {bal > 0 ? `Dr ₹${Math.abs(bal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : bal < 0 ? `Cr ₹${Math.abs(bal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">{l.gstNumber || '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditLedger(l)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                              onClick={() => deleteLedgerMutation.mutate(l.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          {ledgerData && ledgerData.count > 0 && (
            <div className="text-xs text-muted-foreground text-center">
              Showing {ledgers.length} of {ledgerData.count} ledgers
            </div>
          )}
        </TabsContent>

        {/* GROUPS TAB */}
        <TabsContent value="groups" className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Accounting Groups</h2>
            <Button onClick={() => { setEditingGroup(null); setGroupForm({ name: '', groupType: 'other' }); setIsGroupDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> New Group
            </Button>
          </div>

          {groupsLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : !groupTree || groupTree.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No groups found. Seed default groups to get started.</p>
              <Button variant="outline" className="mt-3" onClick={() => seedDefaultsMutation.mutate()}>
                Seed Default Groups
              </Button>
            </Card>
          ) : (
            <Card className="p-2">
              {groupTree.map(root => (
                <GroupTreeNode key={root.id} node={root} depth={0}
                  onSelect={setSelectedGroupId} selectedId={selectedGroupId}
                  onEdit={handleEditGroup} onDelete={(id) => deleteGroupMutation.mutate(id)} />
              ))}
            </Card>
          )}
        </TabsContent>

        {/* TRIAL BALANCE TAB */}
        <TabsContent value="trial-balance" className="space-y-3">
          <TrialBalanceTab />
        </TabsContent>

        {/* DUPLICATES TAB */}
        <TabsContent value="duplicates" className="space-y-3">
          <DuplicatesTab />
        </TabsContent>

        {/* AUDIT TAB */}
        <TabsContent value="audit" className="space-y-3">
          <AuditTab />
        </TabsContent>

        {/* CSV IMPORT TAB */}
        <TabsContent value="import-csv" className="space-y-3">
          <CsvImportTab />
        </TabsContent>

        {/* YEAR CLOSE TAB */}
        <TabsContent value="year-close" className="space-y-3">
          <YearCloseTab />
        </TabsContent>
      </Tabs>

      {/* GROUP DIALOG */}
      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Edit Group' : 'Create Group'}</DialogTitle>
            <DialogDescription>{editingGroup ? 'Update group details' : 'Add a new accounting group'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={groupForm.name} onChange={e => setGroupForm(p => ({ ...p, name: e.target.value }))} placeholder="Group name" />
            </div>
            <div>
              <Label>Parent Group</Label>
              <Select value={groupForm.parentId ?? 'none'} onValueChange={v => setGroupForm(p => ({ ...p, parentId: v === 'none' ? null : v }))}>
                <SelectTrigger><SelectValue placeholder="None (root)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (root)</SelectItem>
                  {flatGroups?.filter(g => g.id !== editingGroup?.id).map(g => (
                    <SelectItem key={g.id} value={g.id}>{'—'.repeat(g.level)} {g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={groupForm.groupType} onValueChange={v => setGroupForm(p => ({ ...p, groupType: v as LedgerGroupType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(GROUP_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={groupForm.affectsStock}
                onChange={e => setGroupForm(p => ({ ...p, affectsStock: e.target.checked }))} />
              <Label className="text-sm">Affects Stock</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGroupDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveGroup} disabled={!groupForm.name.trim()}>
              {createGroupMutation.isPending || updateGroupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingGroup ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* LEDGER DIALOG */}
      <Dialog open={isLedgerDialogOpen} onOpenChange={setIsLedgerDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLedger ? 'Edit Ledger' : 'Create Ledger'}</DialogTitle>
            <DialogDescription>{editingLedger ? 'Update ledger details' : 'Add a new ledger to the chart of accounts'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input value={ledgerForm.name} onChange={e => setLedgerForm(p => ({ ...p, name: e.target.value }))} placeholder="Ledger name" />
              </div>
              <div>
                <Label>Alias</Label>
                <Input value={ledgerForm.alias ?? ''} onChange={e => setLedgerForm(p => ({ ...p, alias: e.target.value || undefined }))} placeholder="Alternate name" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Group</Label>
                <Select value={ledgerForm.ledgerGroupId ?? 'none'}
                  onValueChange={v => setLedgerForm(p => ({ ...p, ledgerGroupId: v === 'none' ? undefined : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No group</SelectItem>
                    {flatGroups?.map(g => (
                      <SelectItem key={g.id} value={g.id}>{'—'.repeat(g.level)} {g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Party Type</Label>
                <Select value={ledgerForm.partyType ?? 'other'}
                  onValueChange={v => setLedgerForm(p => ({ ...p, partyType: v as Ledger['partyType'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['individual', 'proprietorship', 'partnership', 'llp', 'pvt_ltd', 'ltd', 'trust', 'other'].map(t => (
                      <SelectItem key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Opening Balance</Label>
                <Input type="number" value={ledgerForm.openingBalance ?? 0}
                  onChange={e => setLedgerForm(p => ({ ...p, openingBalance: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Balance Type</Label>
                <Select value={ledgerForm.balanceType ?? 'debit'}
                  onValueChange={v => setLedgerForm(p => ({ ...p, balanceType: v as 'debit' | 'credit' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ledger Code</Label>
                <Input value={ledgerForm.ledgerCode ?? ''} onChange={e => setLedgerForm(p => ({ ...p, ledgerCode: e.target.value || undefined }))} />
              </div>
            </div>

            <div>
              <Label>Roles * (at least one)</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {ALL_ROLES.map(role => (
                  <button key={role} type="button"
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      (ledgerForm.roles ?? []).includes(role)
                        ? ROLE_COLORS[role] + ' border-current'
                        : 'bg-muted/50 text-muted-foreground border-transparent hover:border-muted-foreground/30'
                    }`}
                    onClick={() => toggleLedgerRole(role)}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Contact & Tax</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>GST Number</Label>
                  <Input value={ledgerForm.gstNumber ?? ''} onChange={e => setLedgerForm(p => ({ ...p, gstNumber: e.target.value || undefined }))} placeholder="27ABCDE1234F1Z5" />
                </div>
                <div>
                  <Label>PAN Number</Label>
                  <Input value={ledgerForm.panNumber ?? ''} onChange={e => setLedgerForm(p => ({ ...p, panNumber: e.target.value || undefined }))} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={ledgerForm.phone ?? ''} onChange={e => setLedgerForm(p => ({ ...p, phone: e.target.value || undefined }))} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={ledgerForm.email ?? ''} onChange={e => setLedgerForm(p => ({ ...p, email: e.target.value || undefined }))} />
                </div>
                <div>
                  <Label>Contact Person</Label>
                  <Input value={ledgerForm.contactPerson ?? ''} onChange={e => setLedgerForm(p => ({ ...p, contactPerson: e.target.value || undefined }))} />
                </div>
                <div>
                  <Label>State</Label>
                  <Input value={ledgerForm.state ?? ''} onChange={e => setLedgerForm(p => ({ ...p, state: e.target.value || undefined }))} />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Bank Details</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Bank Name</Label>
                  <Input value={ledgerForm.bankName ?? ''} onChange={e => setLedgerForm(p => ({ ...p, bankName: e.target.value || undefined }))} />
                </div>
                <div>
                  <Label>Account Number</Label>
                  <Input value={ledgerForm.bankAccountNumber ?? ''} onChange={e => setLedgerForm(p => ({ ...p, bankAccountNumber: e.target.value || undefined }))} />
                </div>
                <div>
                  <Label>IFSC</Label>
                  <Input value={ledgerForm.bankIfsc ?? ''} onChange={e => setLedgerForm(p => ({ ...p, bankIfsc: e.target.value || undefined }))} />
                </div>
                <div>
                  <Label>Branch</Label>
                  <Input value={ledgerForm.bankBranch ?? ''} onChange={e => setLedgerForm(p => ({ ...p, bankBranch: e.target.value || undefined }))} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLedgerDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveLedger} disabled={!ledgerForm.name.trim() || (ledgerForm.roles ?? []).length === 0}>
              {createLedgerMutation.isPending || updateLedgerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingLedger ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
