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
import { History, Upload, RefreshCw } from "lucide-react";

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

import {
  detectSchemaClient,
  detectSchemaAI,
  suggestMappingsAI,
  convertAIMappingsToFieldMappings,
  executeImport,
  rollbackImport,
} from "@/services/dataImport";
import { validateRows } from "@/services/importValidators";
import { saveTemplate } from "@/services/importTemplates";
import { ENTITY_SCHEMAS, topologicalSort } from "@/types/dataImport";
import type { FieldMapping, ImportJob } from "@/types/dataImport";

export default function DataImport() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const { company } = useBusiness();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"import" | "history">("import");
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
        wizard.setDetectedColumns(detectSchemaClient(wizard.parsedData.rows));
        wizard.setStep("schema");
        break;
      }
      case "schema": {
        if (wizard.selectedEntities.length === 0) {
          toast({ title: "Select entities", description: "Please select at least one entity type", variant: "destructive" });
          return;
        }
        wizard.setEntities(topologicalSort(wizard.selectedEntities));
        wizard.setStep("mapping");
        setDetectedErp(null);
        break;
      }
      case "mapping": {
        if (!wizard.currentEntity || !wizard.parsedData) return;
        const mappings = wizard.currentMappings.length > 0 ? wizard.currentMappings : fieldMapping.generateInitialMappings();
        wizard.setMappings(wizard.currentEntity, mappings);
        wizard.setValidationResult(wizard.currentEntity, validateRows(wizard.currentEntity, wizard.parsedData.rows, mappings));
        wizard.setStep("preview");
        break;
      }
      case "preview": {
        if (wizard.hasNextEntity) { wizard.nextEntity(); wizard.setStep("mapping"); setDetectedErp(null); }
        else wizard.setStep("execute");
        break;
      }
      case "execute": {
        if (!wizard.parsedData || wizard.selectedEntities.length === 0) return;
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
          try {
            const result = await executeImport(supabase, {
              companyId: company?.id ?? "", entityType: entity,
              rows: wizard.parsedData!.rows, mappings: wizard.fieldMappings[entity] ?? [], batchSize: 500,
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

  if (!authLoading && !isSuperAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6">
      <PageHeader title="Data Import" description="Import data from CSV, Excel, or JSON files" />

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "import" | "history")}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="import" className="flex items-center gap-2"><Upload className="w-4 h-4" />Import</TabsTrigger>
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
              <ImportWizard currentStep={wizard.currentStep} setStep={wizard.setStep} canGoBack={canGoBack} canGoForward={canGoForward()} onNext={handleNext} onBack={handleBack}>
                {wizard.currentStep === "upload" && <FileUploadStep onParsed={wizard.setParsedData} onError={wizard.setError} />}

                {wizard.currentStep === "schema" && wizard.parsedData && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">AI can improve column type detection</span>
                      <button onClick={handleAISchema} disabled={isAILoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 text-purple-700 hover:from-purple-100 hover:to-blue-100 disabled:opacity-50">
                        {isAILoading ? <><div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />Analyzing...</> : <>✨ AI Analyze</>}
                      </button>
                    </div>
                    <SchemaDetectionStep columns={wizard.detectedColumns} totalRows={wizard.parsedData.totalRows} fileType={wizard.parsedData.fileType ?? "csv"} selectedEntities={wizard.selectedEntities} onEntitiesChange={wizard.setEntities} />
                  </div>
                )}

                {wizard.currentStep === "mapping" && wizard.currentEntity && (
                  <FieldMappingStep entityType={wizard.currentEntity} detectedColumns={wizard.detectedColumns} mappings={wizard.currentMappings} onMappingsChange={m => wizard.setMappings(wizard.currentEntity!, m)} detectedErp={detectedErp} onAIMapping={handleAIMapping} isAILoading={isAILoading} />
                )}

                {wizard.currentStep === "preview" && wizard.currentEntity && wizard.parsedData && (
                  <ValidationPreviewStep entityType={wizard.currentEntity} headers={wizard.parsedData.headers} rows={wizard.parsedData.rows} mappings={wizard.currentMappings} validationResult={wizard.currentValidation ?? { totalRows: wizard.parsedData.totalRows, validRows: wizard.parsedData.totalRows, errorRows: 0, warningRows: 0, errors: [] }} onValidate={() => {}} isLastEntity={wizard.isLastEntity} hasNextEntity={wizard.hasNextEntity} />
                )}

                {wizard.currentStep === "execute" && wizard.parsedData && (
                  <ImportExecutionStep isImporting={isImporting} totalRows={wizard.parsedData.totalRows * wizard.selectedEntities.length} successRows={executionState.successRows} failedRows={executionState.failedRows} currentBatch={executionState.currentBatch} totalBatches={executionState.totalBatches} error={wizard.error} jobId={currentJobId} isRolledBack={isRolledBack} onCancel={() => { setIsImporting(false); wizard.setError("Import cancelled"); }} onRollback={handleRollback} />
                )}
              </ImportWizard>
            </CardContent>
          </Card>
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
