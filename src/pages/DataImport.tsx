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
import { History, Upload, RefreshCw, FileCode } from "lucide-react";

import { useImportWizard } from "@/hooks/useImportWizard";
import { useFieldMapping } from "@/hooks/useFieldMapping";
import { useImportHistory } from "@/hooks/useImportHistory";
import { ImportWizard } from "@/components/data-import/ImportWizard";
import { FileUploadStep } from "@/components/data-import/FileUploadStep";
import { SchemaDetectionStep } from "@/components/data-import/SchemaDetectionStep";
import { FieldMappingStep } from "@/components/data-import/FieldMappingStep";
import { ValidationPreviewStep } from "@/components/data-import/ValidationPreviewStep";
import { ImportExecutionStep } from "@/components/data-import/ImportExecutionStep";
import { ImportHistory as ImportHistoryTab } from "@/components/data-import/ImportHistory";
import { TemplateSelector } from "@/components/data-import/TemplateSelector";
import { MargImportHierarchy } from "@/components/data-import/MargImportHierarchy";

import {
  detectSchemaClient,
  detectSchemaAI,
  suggestMappingsAI,
  convertAIMappingsToFieldMappings,
  executeImport,
  rollbackImport,
  parseTallyMasters,
} from "@/services/dataImport";
import { validateRows } from "@/services/importValidators";
import { saveTemplate } from "@/services/importTemplates";
import { ENTITY_SCHEMAS, topologicalSort } from "@/types/dataImport";
import type { FieldMapping, ImportJob, ImportEntityType, TallyMastersParseResult } from "@/types/dataImport";
import type { ParsedData } from "@/types/dataImport";

export default function DataImport() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const { companyId } = useBusiness();
  const company = companyId ? { id: companyId } : null;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"import" | "marg" | "marg-master" | "marg-sales" | "marg-purchase" | "marg-stock" | "marg-parties" | "marg-doctors" | "history">("import");
  const [isImporting, setIsImporting] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  const [detectedErp, setDetectedErp] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [isRolledBack, setIsRolledBack] = useState(false);
  const [executionState, setExecutionState] = useState({
    successRows: 0,
    failedRows: 0,
    currentBatch: 0,
    totalBatches: 0,
  });

  const [isTallyMultiEntity, setIsTallyMultiEntity] = useState(false);
  const [tallyResult, setTallyResult] = useState<TallyMastersParseResult | null>(null);
  const [selectedTallyEntities, setSelectedTallyEntities] = useState<ImportEntityType[]>([]);
  const [isTallyParsing, setIsTallyParsing] = useState(false);
  const [tallyEntityParsedData, setTallyEntityParsedData] = useState<Partial<Record<ImportEntityType, ParsedData>>>({});
  const tallyFileRef = useRef<File | null>(null);

  const wizard = useImportWizard();
  const history = useImportHistory(supabase, company?.id ?? "");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const fieldMapping = useFieldMapping(
    wizard.currentEntity,
    wizard.detectedColumns,
    undefined
  );

  // ─── Rollback handler ──────────────────────────────────────────────────────

  const handleRollback = useCallback(async () => {
    if (!currentJobId) return;
    const result = await rollbackImport(supabase, currentJobId);
    if (result.success) {
      setIsRolledBack(true);
      toast({ title: "Import Rolled Back", description: result.message });
    } else {
      toast({ title: "Rollback Failed", description: result.message, variant: "destructive" });
    }
    history.refetch();
  }, [currentJobId, toast, history]);

  // ─── AI Schema Detection ───────────────────────────────────────────────────

  const handleAISchema = useCallback(async () => {
    if (!wizard.parsedData) return;
    setIsAILoading(true);
    wizard.setError(null);
    try {
      const result = await detectSchemaAI(supabase, wizard.parsedData.headers, wizard.parsedData.rows);
      if (result.error) { wizard.setError(`AI schema detection failed: ${result.error}`); return; }
      const aiColumns = wizard.detectedColumns.map(col => {
        const aiCol = result.columns.find(c => c.name === col.name);
        return aiCol ? { ...col, detectedType: aiCol.detected_type as typeof col.detectedType } : col;
      });
      wizard.setDetectedColumns(aiColumns);
      if (result.suggested_entity) wizard.setEntities([result.suggested_entity as any]);
      toast({ title: "AI Analysis Complete", description: `Detected ${result.suggested_entity} (${result.entity_confidence}% confidence)` });
    } catch (err) {
      wizard.setError(`AI error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAILoading(false);
    }
  }, [wizard, toast]);

  // ─── AI Field Mapping ──────────────────────────────────────────────────────

  const handleAIMapping = useCallback(async () => {
    if (!wizard.currentEntity || !wizard.parsedData) return;
    setIsAILoading(true);
    wizard.setError(null);
    try {
      const sourceColumns = wizard.detectedColumns.map(c => ({ name: c.name, detectedType: c.detectedType, sampleValues: c.sampleValues }));
      const result = await suggestMappingsAI(supabase, sourceColumns, wizard.currentEntity);
      if (result.error) { wizard.setError(`AI mapping failed: ${result.error}`); return; }
      wizard.setMappings(wizard.currentEntity, convertAIMappingsToFieldMappings(result));
      if (result.detected_erp) setDetectedErp(result.detected_erp);
      toast({ title: "AI Mapping Complete", description: `Mapped ${result.mappings.length} fields` });
    } catch (err) {
      wizard.setError(`AI mapping error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAILoading(false);
    }
  }, [wizard, toast]);

  // ─── Template ──────────────────────────────────────────────────────────────

  const handleTemplateSelected = useCallback((template: { fieldMappings: FieldMapping[] }) => {
    if (!wizard.currentEntity) return;
    wizard.setMappings(wizard.currentEntity, template.fieldMappings);
    setDetectedErp(null);
    toast({ title: "Template Loaded", description: "Field mappings restored from template" });
  }, [wizard, toast]);

  const handleSaveAsTemplate = useCallback(async (name: string) => {
    if (!wizard.currentEntity || !company?.id) return;
    const tmpl = await saveTemplate(supabase, { name, entityType: wizard.currentEntity, companyId: company.id, mappings: wizard.currentMappings });
    if (tmpl) toast({ title: "Template Saved", description: `"${name}" saved` });
  }, [wizard, company, toast]);

  // ─── Re-import from history ────────────────────────────────────────────────

  const handleReimport = useCallback((job: ImportJob) => {
    wizard.reset();
    wizard.setEntities([job.entityType]);
    setActiveTab("import");
    toast({ title: "Re-import Ready", description: `Entity set to ${job.entityType}. Upload a new file.` });
  }, [wizard, toast]);

  // ─── Tally All Masters handler ─────────────────────────────────────────────

  const handleFileParsed = useCallback(async (data: ParsedData, file: File) => {
    wizard.setParsedData(data);
    tallyFileRef.current = file;

    // Check for Tally All Masters XML
    if (data.fileType === 'xml') {
      const text = await file.text();
      if (text.includes('<TALLYREQUEST>Import Data</TALLYREQUEST>') && text.includes('<REPORTNAME>All Masters</REPORTNAME>')) {
        setIsTallyParsing(true);
        try {
          const result = await parseTallyMasters(supabase, file);
          setTallyResult(result);
          setIsTallyMultiEntity(true);
          wizard.setError(null);
        } catch (err) {
          wizard.setError(err instanceof Error ? err.message : 'Tally parsing failed');
          setIsTallyMultiEntity(false);
        } finally {
          setIsTallyParsing(false);
        }
        return;
      }
    }
    setIsTallyMultiEntity(false);
  }, [wizard]);

  const toggleTallyEntity = useCallback((entity: ImportEntityType) => {
    setSelectedTallyEntities(prev =>
      prev.includes(entity) ? prev.filter(e => e !== entity) : [...prev, entity]
    );
  }, []);

  const buildEntityParsedData = useCallback((result: TallyMastersParseResult): Partial<Record<ImportEntityType, ParsedData>> => {
    return {
      product: {
        headers: ['name', 'category', 'hsn_code', 'gst_percentage', 'unit', 'purchase_price', 'mrp', 'opening_balance', 'opening_value'],
        rows: result.stockItems as unknown as Record<string, unknown>[],
        totalRows: result.stockItems.length,
        fileType: 'xml' as const,
        entityType: 'product' as const,
      },
      supplier: {
        headers: ['name', 'gstin', 'phone', 'address', 'state', 'parent_group', 'pan'],
        rows: result.suppliers as unknown as Record<string, unknown>[],
        totalRows: result.suppliers.length,
        fileType: 'xml' as const,
        entityType: 'supplier' as const,
      },
      customer: {
        headers: ['name', 'gstin', 'phone', 'address', 'state', 'parent_group'],
        rows: result.customers as unknown as Record<string, unknown>[],
        totalRows: result.customers.length,
        fileType: 'xml' as const,
        entityType: 'customer' as const,
      },
    };
  }, []);

  // ─── Navigation Logic ──────────────────────────────────────────────────────

  const canGoBack = wizard.currentStep !== "upload";

  const canGoForward = (): boolean => {
    switch (wizard.currentStep) {
      case "upload": return wizard.parsedData !== null;
      case "schema": return wizard.selectedEntities.length > 0;
      case "mapping": return true;
      case "preview": return true;
      case "execute": return !isImporting;
      default: return false;
    }
  };

  const handleNext = useCallback(async () => {
    switch (wizard.currentStep) {
      case "upload": {
        if (!wizard.parsedData) return;
        if (isTallyMultiEntity && tallyResult) {
          if (selectedTallyEntities.length === 0) {
            toast({ title: "Select entities", description: "Please select at least one entity type to import", variant: "destructive" });
            return;
          }
          const entityData = buildEntityParsedData(tallyResult);
          setTallyEntityParsedData(entityData);
          const sorted = topologicalSort(selectedTallyEntities);
          wizard.setEntities(sorted);
          wizard.setDetectedColumns([]);
          wizard.setStep("schema");
        } else {
          wizard.setDetectedColumns(detectSchemaClient(wizard.parsedData.rows));
          wizard.setStep("schema");
        }
        break;
      }
      case "schema": {
        if (wizard.selectedEntities.length === 0) {
          toast({ title: "Select entities", description: "Please select at least one entity type", variant: "destructive" });
          return;
        }
        if (isTallyMultiEntity && tallyResult) {
          // Auto-select entity type and skip to mapping
          wizard.setStep("mapping");
          setDetectedErp(null);
        } else {
          wizard.setEntities(topologicalSort(wizard.selectedEntities));
          wizard.setStep("mapping");
          setDetectedErp(null);
        }
        break;
      }
      case "mapping": {
        if (!wizard.currentEntity) return;
        const entityRows = isTallyMultiEntity && tallyEntityParsedData[wizard.currentEntity]
          ? tallyEntityParsedData[wizard.currentEntity].rows
          : wizard.parsedData?.rows ?? [];
        const entityHeaders = isTallyMultiEntity && tallyEntityParsedData[wizard.currentEntity]
          ? tallyEntityParsedData[wizard.currentEntity].headers
          : wizard.parsedData?.headers ?? [];

        const mappings = wizard.currentMappings.length > 0 ? wizard.currentMappings : fieldMapping.generateInitialMappings();
        wizard.setMappings(wizard.currentEntity, mappings);

        // Build a fake parsed data just for validation
        const fakeData: ParsedData = { headers: entityHeaders, rows: entityRows, totalRows: entityRows.length, fileType: 'xml', entityType: wizard.currentEntity };
        wizard.setValidationResult(wizard.currentEntity, validateRows(wizard.currentEntity, entityRows, mappings));
        wizard.setStep("preview");
        break;
      }
      case "preview": {
        if (wizard.hasNextEntity) { wizard.nextEntity(); wizard.setStep("mapping"); setDetectedErp(null); }
        else wizard.setStep("execute");
        break;
      }
      case "execute": {
        if (wizard.selectedEntities.length === 0) return;
        setIsImporting(true);
        setIsRolledBack(false);
        wizard.setError(null);
        setCurrentJobId(null);
        setExecutionState({ successRows: 0, failedRows: 0, currentBatch: 1, totalBatches: 0 });
        let totalSuccess = 0, totalFailed = 0;
        const sorted = topologicalSort(wizard.selectedEntities);
        setExecutionState(s => ({ ...s, totalBatches: sorted.length }));

        for (let i = 0; i < sorted.length; i++) {
          const entity = sorted[i];
          setExecutionState(s => ({ ...s, currentBatch: i + 1 }));

          const entityRows = isTallyMultiEntity && tallyEntityParsedData[entity]
            ? tallyEntityParsedData[entity].rows
            : wizard.parsedData?.rows ?? [];

          try {
            const result = await executeImport(supabase, {
              companyId: company?.id ?? "", entityType: entity,
              rows: entityRows, mappings: wizard.fieldMappings[entity] ?? [], batchSize: 500,
            });
            totalSuccess += result.successRows;
            totalFailed += result.failedRows;
            setExecutionState({ successRows: totalSuccess, failedRows: totalFailed, currentBatch: i + 1, totalBatches: sorted.length });
            setCurrentJobId(result.jobId);
            if (result.errors.some(e => e.message?.includes('rolled back'))) {
              setIsRolledBack(true);
              break;
            }
          } catch (err) {
            totalFailed += wizard.parsedData!.rows.length;
            setExecutionState({ successRows: totalSuccess, failedRows: totalFailed, currentBatch: i + 1, totalBatches: sorted.length });
          }
        }

        setIsImporting(false);
        history.refetch();

        if (isRolledBack) {
          toast({ title: "Import Rolled Back", description: "Failure rate exceeded threshold", variant: "destructive" });
        } else if (totalFailed > 0 && totalSuccess > 0) {
          toast({ title: "Import completed with errors", description: `${totalSuccess} succeeded, ${totalFailed} failed`, variant: "destructive" });
        } else if (totalFailed > 0) {
          wizard.setError(`All ${totalFailed} rows failed to import`);
        } else {
          toast({ title: "Import complete", description: `${totalSuccess} rows imported` });
        }
        break;
      }
    }
  }, [wizard, fieldMapping, company, toast, history, isRolledBack]);

  const handleBack = useCallback(() => {
    switch (wizard.currentStep) {
      case "schema": wizard.setStep("upload"); break;
      case "mapping": wizard.setStep("schema"); setDetectedErp(null); break;
      case "preview": wizard.setStep("mapping"); break;
      case "execute": wizard.setStep("preview"); break;
    }
  }, [wizard]);

  // Data Import is available to all authenticated users (scoped per company).

  return (
    <div className="space-y-6">
      <PageHeader title="Data Import" description="Import data from CSV, Excel, or JSON files" />

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="import" className="flex items-center gap-2"><Upload className="w-4 h-4" />Import</TabsTrigger>
            <TabsTrigger value="marg" className="flex items-center gap-2"><FileCode className="w-4 h-4" />Marg Items</TabsTrigger>
            <TabsTrigger value="marg-master" className="flex items-center gap-2"><FileCode className="w-4 h-4" />MARG Master CSV</TabsTrigger>
            <TabsTrigger value="marg-sales" className="flex items-center gap-2"><FileCode className="w-4 h-4" />MARG Sales History</TabsTrigger>
            <TabsTrigger value="marg-purchase" className="flex items-center gap-2"><FileCode className="w-4 h-4" />MARG Purchase History</TabsTrigger>
            <TabsTrigger value="marg-stock" className="flex items-center gap-2"><FileCode className="w-4 h-4" />MARG Stock</TabsTrigger>
            <TabsTrigger value="marg-parties" className="flex items-center gap-2"><FileCode className="w-4 h-4" />MARG Party Master</TabsTrigger>
            <TabsTrigger value="marg-doctors" className="flex items-center gap-2"><FileCode className="w-4 h-4" />MARG Bill↔Doctor</TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2"><History className="w-4 h-4" />History</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-3">
            {activeTab === "import" && (wizard.currentStep === "schema" || wizard.currentStep === "mapping") && company?.id && wizard.currentEntity && (
              <TemplateSelector supabase={supabase} companyId={company.id} entityType={wizard.currentEntity} onTemplateSelected={handleTemplateSelected} onSaveAsTemplate={handleSaveAsTemplate} />
            )}
            {activeTab === "history" && (
              <button onClick={history.refetch} className="p-1 rounded hover:bg-muted" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
            )}
            {wizard.currentEntity && (
              <span className="text-xs text-muted-foreground">
                {ENTITY_SCHEMAS[wizard.currentEntity]?.label ?? wizard.currentEntity}
                {wizard.selectedEntities.length > 1 && ` (${wizard.currentEntityIndex + 1}/${wizard.selectedEntities.length})`}
              </span>
            )}
          </div>
        </div>

        <TabsContent value="import" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Import Wizard</CardTitle></CardHeader>
            <CardContent>
              {wizard.error && <Alert variant="destructive" className="mb-4"><AlertDescription>{wizard.error}</AlertDescription></Alert>}
              <ImportWizard
                currentStep={wizard.currentStep}
                setStep={wizard.setStep}
                canGoBack={canGoBack}
                canGoForward={canGoForward()}
                onNext={handleNext}
                onBack={handleBack}
                isTallyMultiEntity={isTallyMultiEntity}
                isLastEntity={wizard.isLastEntity}
                hasNextEntity={wizard.hasNextEntity}
              >
                {wizard.currentStep === "upload" && <>
                  <FileUploadStep
                    onParsed={(data) => { if (tallyFileRef.current) handleFileParsed(data, tallyFileRef.current); else wizard.setParsedData(data); }}
                    onFileReady={(file) => { tallyFileRef.current = file; }}
                    onError={wizard.setError}
                  />
                  {isTallyParsing && (
                    <div className="mt-4 flex items-center gap-3 p-3 rounded-md bg-blue-50 border border-blue-200">
                      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-blue-700">Analyzing Tally All Masters file...</p>
                    </div>
                  )}
                  {isTallyMultiEntity && tallyResult && !isTallyParsing && (
                    <div className="mt-6 space-y-4">
                      <h3 className="text-sm font-semibold">Tally "All Masters" Detected — Select entities to import</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${selectedTallyEntities.includes('product') ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
                          <input type="checkbox" checked={selectedTallyEntities.includes('product')} onChange={() => toggleTallyEntity('product')} className="mt-0.5" />
                          <div>
                            <p className="font-medium text-sm">Products</p>
                            <p className="text-xs text-muted-foreground">{tallyResult.summary.stockItems.toLocaleString()} items · {tallyResult.summary.stockGroups} categories</p>
                          </div>
                        </label>
                        <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${selectedTallyEntities.includes('supplier') ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
                          <input type="checkbox" checked={selectedTallyEntities.includes('supplier')} onChange={() => toggleTallyEntity('supplier')} className="mt-0.5" />
                          <div>
                            <p className="font-medium text-sm">Suppliers</p>
                            <p className="text-xs text-muted-foreground">{tallyResult.summary.suppliers.toLocaleString()} suppliers · with GSTIN, phone, address</p>
                          </div>
                        </label>
                        <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${selectedTallyEntities.includes('customer') ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}>
                          <input type="checkbox" checked={selectedTallyEntities.includes('customer')} onChange={() => toggleTallyEntity('customer')} className="mt-0.5" />
                          <div>
                            <p className="font-medium text-sm">Customers</p>
                            <p className="text-xs text-muted-foreground">{tallyResult.summary.customers.toLocaleString()} customers</p>
                          </div>
                        </label>
                        <div className="p-4 rounded-lg border-2 border-muted bg-muted/30">
                          <p className="font-medium text-sm text-muted-foreground">Other (not imported)</p>
                          <p className="text-xs text-muted-foreground">{tallyResult.summary.groups} groups · {tallyResult.summary.units} units · {tallyResult.summary.skippedLedgers} skipped ledgers</p>
                        </div>
                      </div>
                    </div>
                  )}
                </>}

                {wizard.currentStep === "schema" && wizard.parsedData && (
                  isTallyMultiEntity ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 border border-green-200">
                        <span className="text-sm font-medium text-green-800">Tally Data Ready</span>
                        <span className="text-xs text-green-600">
                          Importing: {wizard.selectedEntities.map(e => ENTITY_SCHEMAS[e]?.label ?? e).join(', ')}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Database tables will be populated in dependency order: {topologicalSort(wizard.selectedEntities).map(e => ENTITY_SCHEMAS[e]?.label ?? e).join(' → ')}.
                      </p>
                    </div>
                  ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">AI can improve column type detection</span>
                      <button onClick={handleAISchema} disabled={isAILoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 text-purple-700 hover:from-purple-100 hover:to-blue-100 disabled:opacity-50">
                        {isAILoading ? <><div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />Analyzing...</> : <>✨ AI Analyze</>}
                      </button>
                    </div>
                    <SchemaDetectionStep columns={wizard.detectedColumns} totalRows={wizard.parsedData.totalRows} fileType={wizard.parsedData.fileType ?? "csv"} selectedEntities={wizard.selectedEntities} onEntitiesChange={wizard.setEntities} />
                  </div>
                  )
                )}

                {wizard.currentStep === "mapping" && wizard.currentEntity && (
                  isTallyMultiEntity && tallyEntityParsedData[wizard.currentEntity!] ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 p-3 rounded-md bg-blue-50 border border-blue-200">
                        <FileCode className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-800">
                          Mapping {ENTITY_SCHEMAS[wizard.currentEntity]?.label ?? wizard.currentEntity} ({tallyEntityParsedData[wizard.currentEntity!].totalRows.toLocaleString()} rows)
                        </span>
                      </div>
                      <FieldMappingStep
                        entityType={wizard.currentEntity}
                        detectedColumns={(wizard.detectedColumns && wizard.detectedColumns.length > 0)
                          ? wizard.detectedColumns
                          : tallyEntityParsedData[wizard.currentEntity!].headers.map(h => ({ name: h, normalizedName: h, sampleValues: [], detectedType: 'string' as const, nullCount: 0, uniqueCount: 0 }))}
                        mappings={wizard.currentMappings}
                        onMappingsChange={m => wizard.setMappings(wizard.currentEntity!, m)}
                        detectedErp="tally"
                        onAIMapping={handleAIMapping}
                        isAILoading={isAILoading}
                      />
                    </div>
                  ) : (
                    <FieldMappingStep entityType={wizard.currentEntity} detectedColumns={wizard.detectedColumns} mappings={wizard.currentMappings} onMappingsChange={m => wizard.setMappings(wizard.currentEntity!, m)} detectedErp={detectedErp} onAIMapping={handleAIMapping} isAILoading={isAILoading} />
                  )
                )}

                {wizard.currentStep === "preview" && wizard.currentEntity && (
                  isTallyMultiEntity && tallyEntityParsedData[wizard.currentEntity!] ? (
                    <ValidationPreviewStep
                      entityType={wizard.currentEntity}
                      headers={tallyEntityParsedData[wizard.currentEntity!].headers}
                      rows={tallyEntityParsedData[wizard.currentEntity!].rows}
                      mappings={wizard.currentMappings}
                      validationResult={wizard.currentValidation ?? { totalRows: tallyEntityParsedData[wizard.currentEntity!].totalRows, validRows: tallyEntityParsedData[wizard.currentEntity!].totalRows, errorRows: 0, warningRows: 0, errors: [] }}
                      onValidate={() => {}}
                      isLastEntity={wizard.isLastEntity}
                      hasNextEntity={wizard.hasNextEntity}
                    />
                  ) : wizard.parsedData && (
                    <ValidationPreviewStep entityType={wizard.currentEntity} headers={wizard.parsedData.headers} rows={wizard.parsedData.rows} mappings={wizard.currentMappings} validationResult={wizard.currentValidation ?? { totalRows: wizard.parsedData.totalRows, validRows: wizard.parsedData.totalRows, errorRows: 0, warningRows: 0, errors: [] }} onValidate={() => {}} isLastEntity={wizard.isLastEntity} hasNextEntity={wizard.hasNextEntity} />
                  )
                )}

                {wizard.currentStep === "execute" && (
                  <ImportExecutionStep
                    isImporting={isImporting}
                    totalRows={(isTallyMultiEntity
                      ? wizard.selectedEntities.reduce((sum, e) => sum + (tallyEntityParsedData[e]?.totalRows ?? 0), 0)
                      : wizard.selectedEntities.length * (wizard.parsedData?.totalRows ?? 0))}
                    successRows={executionState.successRows}
                    failedRows={executionState.failedRows}
                    currentBatch={executionState.currentBatch}
                    totalBatches={executionState.totalBatches}
                    error={wizard.error}
                    jobId={currentJobId}
                    isRolledBack={isRolledBack}
                    onCancel={() => { setIsImporting(false); wizard.setError("Import cancelled"); }}
                    onRollback={handleRollback}
                  />
                )}
              </ImportWizard>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marg" className="mt-4">
          <MargListImport />
        </TabsContent>

        <TabsContent value="marg-master" className="mt-4">
          <ExistingDataGuard companyId={company?.id} scope="products">
            <MargMasterImport />
          </ExistingDataGuard>
        </TabsContent>

        <TabsContent value="marg-sales" className="mt-4">
          <ExistingDataGuard companyId={company?.id} scope="sales">
            <MargSalesImport />
          </ExistingDataGuard>
        </TabsContent>

        <TabsContent value="marg-purchase" className="mt-4">
          <ExistingDataGuard companyId={company?.id} scope="purchase">
            <MargPurchaseImport />
          </ExistingDataGuard>
        </TabsContent>

        <TabsContent value="marg-stock" className="mt-4">
          <ExistingDataGuard companyId={company?.id} scope="stock">
            <MargStockImport />
          </ExistingDataGuard>
        </TabsContent>

        <TabsContent value="marg-parties" className="mt-4">
          <MargPartyMasterImport />
        </TabsContent>

        <TabsContent value="marg-doctors" className="mt-4">
          <MargDoctorMapImport />
        </TabsContent>





        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Import History</CardTitle></CardHeader>
            <CardContent>
              <ImportHistoryTab jobs={history.jobs} isLoading={history.isLoading} error={history.error} onRefetch={history.refetch} onReimport={handleReimport} onRollback={handleRollback} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="fixed bottom-4 right-4 text-xs text-muted-foreground bg-background/90 backdrop-blur px-3 py-2 rounded-md border shadow-sm">
        <kbd className="px-1 py-0.5 rounded bg-muted text-xs font-mono">Tab</kbd> navigate •
        <kbd className="px-1 py-0.5 rounded bg-muted text-xs font-mono ml-2">Enter</kbd> next •
        <kbd className="px-1 py-0.5 rounded bg-muted text-xs font-mono ml-2">Shift+Enter</kbd> back
      </div>
    </div>
  );
}
