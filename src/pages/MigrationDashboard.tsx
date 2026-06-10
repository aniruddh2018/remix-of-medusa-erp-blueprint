import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Upload, History, RefreshCw, FileCode, CheckCircle,
  AlertTriangle, XCircle, Download, RotateCcw, ArrowRight, Database, BookOpen, Users, Truck
} from "lucide-react";

import {
  createMigrationSession,
  writeStaging,
  confirmStaging,
  rollbackMigrationSession,
  previewStaging,
  exportStagingErrors,
  listImportSessions,
  parseTallyMasters,
  buildStagingRowsFromParse,
  getEntityRowCount,
  generateErrorCSV,
} from "@/services/migrationStaging";
import { buildMappingResult, getUniqueManufacturers, classifyLedgerType } from "@/services/mappingEngine";
import * as ledgerImportService from "@/services/ledgerImportService";
import { bulkSyncCustomersToLedgers, bulkSyncSuppliersToLedgers } from "@/services/ledgerBridge";
import type {
  TallyMastersParseResult,
  ImportSession,
  StagingEntityType,
  StagingPreviewResult,
  MigrationConfirmResult,
} from "@/types/dataImport";

type MigrationStep = 'upload' | 'parse' | 'staging' | 'review' | 'confirm' | 'done';

const ENTITY_LABELS: Record<StagingEntityType, { label: string; icon: string; description: string }> = {
  product: { label: 'Products', icon: 'Package', description: 'Stock items from Tally/Marg' },
  ledger: { label: 'Ledgers', icon: 'BookOpen', description: 'All accounting ledgers (suppliers, customers, GST, bank)' },
  supplier: { label: 'Suppliers', icon: 'Truck', description: 'Sundry creditors with GSTIN' },
  batch: { label: 'Batches', icon: 'Boxes', description: 'Opening stock batches' },
};

export default function MigrationDashboard() {
  const { isSuperAdmin, user, loading: authLoading } = useAuth();
  const { companyId, isLoading: bizLoading } = useBusiness();
  const { toast } = useToast();

  const [step, setStep] = useState<MigrationStep>('upload');
  const [isParsing, setIsParsing] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parseResult, setParseResult] = useState<TallyMastersParseResult | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ledgerSessionId, setLedgerSessionId] = useState<string | null>(null);
  const [selectedEntities, setSelectedEntities] = useState<StagingEntityType[]>([]);
  const [stagingResults, setStagingResults] = useState<Partial<Record<StagingEntityType, { total: number; valid: number; invalid: number }>>>({});
  const [previewData, setPreviewData] = useState<Partial<Record<StagingEntityType, StagingPreviewResult>>>({});
  const [confirmResult, setConfirmResult] = useState<MigrationConfirmResult | null>(null);

  const [sessions, setSessions] = useState<ImportSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const fileRef = useRef<File | null>(null);

  const loadSessions = useCallback(async () => {
    if (!companyId) return;
    setIsLoadingSessions(true);
    const result = await listImportSessions(supabase, companyId, { limit: 20 });
    setSessions(result);
    setIsLoadingSessions(false);
  }, [companyId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleFileUpload = useCallback(async (file: File) => {
    fileRef.current = file;
    setError(null);
    setIsParsing(true);
    setStep('parse');

    try {
      const result = await parseTallyMasters(supabase, file);
      setParseResult(result);
      setStep('staging');
      toast({
        title: "XML Parsed",
        description: `Found ${result.summary.stockItems} products, ${result.summary.allLedgers} ledgers, ${result.summary.stockGroups} categories`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed");
      setStep('upload');
    } finally {
      setIsParsing(false);
    }
  }, [toast]);

  const handleStartStaging = useCallback(async () => {
    if (!parseResult) {
      setError('No parse result available. Please re-upload the file.');
      return;
    }
    if (!companyId) {
      setError('Company not loaded. Please refresh the page and try again.');
      return;
    }
    if (selectedEntities.length === 0) {
      setError('Please select at least one entity type to import.');
      return;
    }
    setIsStaging(true);
    setError(null);

    try {
      const sid = await createMigrationSession(supabase, {
        companyId: companyId,
        name: `Migration from ${parseResult.company_name || 'Tally'}`,
        sourceSystem: parseResult.source_system,
        fileName: fileRef.current?.name,
        fileSize: fileRef.current?.size,
      });
      setSessionId(sid);

      const results: Partial<Record<StagingEntityType, { total: number; valid: number; invalid: number }>> = {};

      if (selectedEntities.includes('ledger') && user) {
        const ledgerSession = await ledgerImportService.createImportSession(
          companyId, user.id,
          `Ledgers from ${parseResult.company_name || 'Tally'}`,
          parseResult.source_system as 'tally' | 'marg',
          fileRef.current?.name,
          fileRef.current?.size,
        );
        setLedgerSessionId(ledgerSession.id);

        const groups = parseResult.groups.map(g => ({
          name: g.name,
          parentName: g.parent || null,
          reservedName: null,
          affectsStock: false,
        }));

        const ledgerRoles = ['customer', 'supplier', 'manufacturer', 'distributor', 'employee', 'doctor', 'bank', 'tax', 'expense', 'income', 'asset', 'liability'] as const;

        const ledgers = parseResult.allLedgers.map(l => ({
          name: l.name,
          parentGroupName: l.parent_group,
          ledgerType: l.ledger_type,
          gstNumber: l.gst_number || null,
          panNumber: l.pan_number || null,
          phone: l.phone || null,
          email: l.email || null,
          address: l.address || null,
          state: l.state || null,
          openingBalance: Number(l.opening_balance || 0),
          balanceType: (l.balance_type || 'debit') as 'debit' | 'credit',
          roleTypes: (l.ledger_type ? [l.ledger_type].filter(rt => ledgerRoles.includes(rt as any)) : classifyLedgerType(l.parent_group).split(',').map(s => s.trim()).filter(rt => ledgerRoles.includes(rt as any))) as any[],
          sourceData: l as Record<string, unknown>,
        }));

        const groupResult = await ledgerImportService.stageGroups(ledgerSession.id, companyId, groups);
        const ledgerResult = await ledgerImportService.stageLedgers(ledgerSession.id, companyId, ledgers);

        results.ledger = {
          total: groupResult.staged + groupResult.duplicates + ledgerResult.staged + ledgerResult.duplicates,
          valid: groupResult.staged + ledgerResult.staged,
          invalid: groupResult.errors + ledgerResult.errors,
        };
      }

      const entityOrder: StagingEntityType[] = ['supplier', 'product', 'batch'];

      for (const entityType of entityOrder) {
        if (!selectedEntities.includes(entityType)) continue;
        const rows = buildStagingRowsFromParse(parseResult, entityType);
        if (rows.length === 0) continue;

        const stagingResult = await writeStaging(supabase, sid, companyId, entityType, rows);
        results[entityType] = {
          total: stagingResult.validation.total,
          valid: stagingResult.validation.valid,
          invalid: stagingResult.validation.invalid,
        };
      }

      if (Object.keys(results).length === 0) {
        setError('No data was staged. Selected entities may have no rows in the parsed file.');
        return;
      }

      setStagingResults(results);
      setStep('review');

      toast({
        title: "Data Staged",
        description: "Review the staging data before confirming import",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Staging failed";
      console.error('[MigrationDashboard] handleStartStaging error:', err);
      setError(msg);
    } finally {
      setIsStaging(false);
    }
  }, [parseResult, companyId, selectedEntities, toast]);

  const handlePreview = useCallback(async (entityType: StagingEntityType) => {
    if (!sessionId || !companyId) return;
    try {
      const result = await previewStaging(supabase, sessionId, companyId, entityType, 20, 0);
      setPreviewData(prev => ({ ...prev, [entityType]: result }));
    } catch (err) {
      toast({ title: "Preview failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  }, [sessionId, companyId, toast]);

  const handleConfirm = useCallback(async () => {
    if (!sessionId || !companyId) return;
    setIsConfirming(true);
    setError(null);

    try {
      if (ledgerSessionId && companyId) {
        await ledgerImportService.confirmImport(ledgerSessionId, companyId);
      }

      const result = await confirmStaging(supabase, sessionId, companyId);
      setConfirmResult(result);
      setStep('done');

      if (result.status === 'completed') {
        toast({ title: "Migration Complete", description: `${result.totalSuccess} rows imported successfully` });
      } else {
        toast({ title: "Migration Rolled Back", description: "Failure rate exceeded 30% threshold", variant: "destructive" });
      }

      loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setIsConfirming(false);
    }
  }, [sessionId, companyId, toast, loadSessions]);

  const handleRollback = useCallback(async () => {
    if (!sessionId || !companyId) return;
    try {
      if (ledgerSessionId && companyId) {
        await ledgerImportService.rollbackImport(ledgerSessionId, companyId);
      }

      const result = await rollbackMigrationSession(supabase, sessionId, companyId);
      if (result.success) {
        toast({ title: "Rolled Back", description: result.message });
        setStep('staging');
        setConfirmResult(null);
        loadSessions();
      } else {
        toast({ title: "Rollback Failed", description: result.message, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Rollback Error", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    }
  }, [sessionId, companyId, toast, loadSessions]);

  const handleExportErrors = useCallback(async (entityType: StagingEntityType) => {
    if (!sessionId || !companyId) return;
    try {
      const errors = await exportStagingErrors(supabase, sessionId, companyId, entityType);
      const csv = generateErrorCSV(errors);
      if (!csv) { toast({ title: "No errors to export" }); return; }
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `migration-errors-${entityType}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: "Export Failed", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    }
  }, [sessionId, companyId, toast]);

  const toggleEntity = useCallback((entity: StagingEntityType) => {
    setSelectedEntities(prev =>
      prev.includes(entity) ? prev.filter(e => e !== entity) : [...prev, entity]
    );
  }, []);

  const handleReset = useCallback(() => {
    setStep('upload');
    setParseResult(null);
    setSessionId(null);
    setLedgerSessionId(null);
    setSelectedEntities([]);
    setStagingResults({});
    setPreviewData({});
    setConfirmResult(null);
    setError(null);
    fileRef.current = null;
  }, []);

  if (!authLoading && !isSuperAdmin) return <Navigate to="/dashboard" replace />;

  const mappingResult = parseResult ? buildMappingResult(parseResult) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Migration Engine"
        description="Import data from Marg/Tally XML with staging, validation, and rollback"
      />

      <Tabs defaultValue="migrate">
        <TabsList>
          <TabsTrigger value="migrate" className="flex items-center gap-2"><Database className="w-4 h-4" />Migrate</TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2"><History className="w-4 h-4" />History</TabsTrigger>
          <TabsTrigger value="sync" className="flex items-center gap-2"><BookOpen className="w-4 h-4" />Sync Legacy</TabsTrigger>
        </TabsList>

        <TabsContent value="migrate" className="mt-4 space-y-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          {/* Step indicators */}
          <div className="flex items-center gap-2 text-sm">
            {(['upload', 'parse', 'staging', 'review', 'confirm', 'done'] as MigrationStep[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded ${step === s ? 'bg-primary text-primary-foreground' : i < ['upload', 'parse', 'staging', 'review', 'confirm', 'done'].indexOf(step) ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </span>
                {i < 5 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
              </div>
            ))}
          </div>

          {/* Upload Step */}
          {step === 'upload' && (
            <Card>
              <CardHeader><CardTitle>Upload XML File</CardTitle></CardHeader>
              <CardContent>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Click or drag Tally/Marg XML file (up to 500 MB)</p>
                  <input type="file" accept=".xml" className="hidden" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }} />
                </label>
              </CardContent>
            </Card>
          )}

          {/* Parse Step */}
          {step === 'parse' && isParsing && (
            <Card>
              <CardContent className="flex items-center gap-3 p-6">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm">Parsing XML file... This may take a minute for large files.</p>
              </CardContent>
            </Card>
          )}

          {/* Staging Step - Entity Selection */}
          {step === 'staging' && parseResult && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCode className="w-5 h-5" />
                    Parse Results: {parseResult.company_name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="p-3 rounded bg-blue-50 border border-blue-200">
                      <span className="font-medium text-blue-800">{parseResult.summary.stockItems.toLocaleString()}</span>
                      <span className="text-blue-600 ml-1">Products</span>
                    </div>
                    <div className="p-3 rounded bg-green-50 border border-green-200">
                      <span className="font-medium text-green-800">{parseResult.summary.allLedgers.toLocaleString()}</span>
                      <span className="text-green-600 ml-1">Ledgers</span>
                    </div>
                    <div className="p-3 rounded bg-purple-50 border border-purple-200">
                      <span className="font-medium text-purple-800">{parseResult.summary.stockGroups.toLocaleString()}</span>
                      <span className="text-purple-600 ml-1">Categories</span>
                    </div>
                    <div className="p-3 rounded bg-amber-50 border border-amber-200">
                      <span className="font-medium text-amber-800">{parseResult.summary.gstRates}</span>
                      <span className="text-amber-600 ml-1">GST Rates</span>
                    </div>
                  </div>

                  {mappingResult && mappingResult.unresolvedUnits.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <AlertTriangle className="w-3 h-3 inline mr-1" />
                      {mappingResult.unresolvedUnits.length} unmapped units: {mappingResult.unresolvedUnits.slice(0, 5).join(', ')}{mappingResult.unresolvedUnits.length > 5 ? '...' : ''}
                    </div>
                  )}

                  <h3 className="text-sm font-semibold pt-2">Select entities to import</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(['ledger', 'supplier', 'product', 'batch'] as StagingEntityType[]).map(entity => {
                      const info = ENTITY_LABELS[entity];
                      const count = parseResult ? getEntityRowCount(parseResult, entity) : 0;
                      return (
                        <label key={entity} className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${selectedEntities.includes(entity) ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
                          <input type="checkbox" checked={selectedEntities.includes(entity)} onChange={() => toggleEntity(entity)} className="mt-0.5" />
                          <div>
                            <p className="font-medium text-sm">{info.label}</p>
                            <p className="text-xs text-muted-foreground">{count.toLocaleString()} rows · {info.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button onClick={handleStartStaging} disabled={selectedEntities.length === 0 || isStaging}>
                      {isStaging ? (
                        <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />Staging...</>
                      ) : (
                        <><Database className="w-4 h-4 mr-2" />Stage for Import</>
                      )}
                    </Button>
                    <Button variant="outline" onClick={handleReset}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Review Step */}
          {step === 'review' && (
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Staging Review</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedEntities.map(entity => {
                      const info = ENTITY_LABELS[entity];
                      const result = stagingResults[entity];
                      if (!result) return null;
                      return (
                        <Card key={entity} className="border">
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">{info.label}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="default" className="bg-green-100 text-green-700">{result.valid} valid</Badge>
                                {result.invalid > 0 && <Badge variant="destructive">{result.invalid} invalid</Badge>}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => handlePreview(entity)}>
                                Preview
                              </Button>
                              {result.invalid > 0 && (
                                <Button size="sm" variant="outline" onClick={() => handleExportErrors(entity)}>
                                  <Download className="w-3 h-3 mr-1" />Export Errors
                                </Button>
                              )}
                            </div>
                            {previewData[entity] && (
                              <div className="mt-2 text-xs text-muted-foreground">
                                Showing {previewData[entity].rows.length} of {previewData[entity].total} rows
                                <div className="mt-1 max-h-32 overflow-auto border rounded p-2 font-mono">
                                  {previewData[entity]!.rows.slice(0, 5).map((row: Record<string, unknown>, i: number) => (
                                     <div key={i}>{String(row.name || row.product_name || '')} {row.validation_status !== 'valid' && <span className="text-red-500">⚠ {JSON.stringify(row.validation_errors)}</span>}</div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button onClick={handleConfirm} disabled={isConfirming}>
                      {isConfirming ? (
                        <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />Importing...</>
                      ) : (
                        <><CheckCircle className="w-4 h-4 mr-2" />Confirm Import</>
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => setStep('staging')}>Back</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Done Step */}
          {step === 'done' && confirmResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {confirmResult.status === 'completed'
                    ? <><CheckCircle className="w-5 h-5 text-green-600" />Migration Complete</>
                    : <><XCircle className="w-5 h-5 text-red-600" />Migration Rolled Back</>
                  }
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {confirmResult.status === 'completed' && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(confirmResult.details).map(([entity, result]) => (
                      <div key={entity} className="p-3 rounded border">
                        <p className="text-sm font-medium">{entity}</p>
                        <p className="text-xs text-green-600">{result.success} imported</p>
                        {result.failed > 0 && <p className="text-xs text-red-600">{result.failed} failed</p>}
                      </div>
                    ))}
                  </div>
                )}
                {confirmResult.status === 'rolled_back' && (
                  <div className="space-y-3">
                    <Alert variant="destructive">
                      <AlertDescription>
                        Failure rate exceeded 50%. All imported data has been rolled back.
                        Fix errors and retry.
                      </AlertDescription>
                    </Alert>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(confirmResult.details).map(([entity, result]) => (
                        <div key={entity} className="p-3 rounded border">
                          <p className="text-sm font-medium">{entity}</p>
                          <p className="text-xs text-green-600">{result.success} imported</p>
                          {result.failed > 0 && <p className="text-xs text-red-600">{result.failed} failed</p>}
                          {result.errors.length > 0 && (
                            <details className="mt-1">
                              <summary className="text-xs cursor-pointer">View errors</summary>
                              <ul className="text-xs text-red-600 mt-1 max-h-24 overflow-auto">
                                {result.errors.slice(0, 5).map((err, i) => (
                                  <li key={i}>{err}</li>
                                ))}
                                {result.errors.length > 5 && <li>...and {result.errors.length - 5} more</li>}
                              </ul>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleRollback}>
                    <RotateCcw className="w-4 h-4 mr-2" />Rollback
                  </Button>
                  <Button variant="outline" onClick={handleReset}>New Migration</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Migration History</CardTitle>
              <Button size="sm" variant="ghost" onClick={loadSessions}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingSessions ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No migrations yet</p>
              ) : (
                <div className="space-y-3">
                  {sessions.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded border">
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.sourceSystem} · {s.fileName || 'No file'} · {new Date(s.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={
                        s.status === 'completed' ? 'default' :
                        s.status === 'rolled_back' ? 'destructive' :
                        s.status === 'failed' ? 'destructive' : 'secondary'
                      }>
                        {s.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sync" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Sync Legacy Data to Unified Ledger
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Copy existing Customers and Suppliers from legacy tables into the unified Ledger system.
                This creates ledger entries with appropriate roles (customer/supplier) so all parties
                appear in the Chart of Accounts.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-blue-600" />
                      <span className="font-medium">Customers → Ledger</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sync all customers from the legacy customers table as ledgers with role=customer.
                    </p>
                    <Button size="sm" onClick={async () => {
                      if (!companyId) return;
                      const r = await bulkSyncCustomersToLedgers(companyId);
                      toast({ title: `Synced ${r.synced} customers`, description: r.errors > 0 ? `${r.errors} errors` : undefined });
                    }}>
                      Sync Customers
                    </Button>
                  </CardContent>
                </Card>
                <Card className="border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-orange-600" />
                      <span className="font-medium">Suppliers → Ledger</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sync all suppliers from the legacy suppliers table as ledgers with role=supplier.
                    </p>
                    <Button size="sm" onClick={async () => {
                      if (!companyId) return;
                      const r = await bulkSyncSuppliersToLedgers(companyId);
                      toast({ title: `Synced ${r.synced} suppliers`, description: r.errors > 0 ? `${r.errors} errors` : undefined });
                    }}>
                      Sync Suppliers
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
