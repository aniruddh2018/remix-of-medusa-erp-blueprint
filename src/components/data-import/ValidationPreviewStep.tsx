import { useState, useMemo } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import type { ImportEntityType, FieldMapping, ValidationResult } from '@/types/dataImport';
import { PreviewTable } from './PreviewTable';
import { QualityScoreDashboard } from './QualityScoreDashboard';
import { AiFixSuggestion, generateSmartFixes } from './AiFixSuggestion';
import { calculateQualityMetrics, detectAnomalies } from '@/services/importValidators';
import type { AnomalyFlag } from '@/services/importValidators';

interface ValidationPreviewStepProps {
  entityType: ImportEntityType;
  headers: string[];
  rows: Record<string, unknown>[];
  mappings: FieldMapping[];
  validationResult: ValidationResult;
  onValidate: () => void;
  isLastEntity: boolean;
  hasNextEntity: boolean;
  onAnomaliesChange?: (anomalies: AnomalyFlag[]) => void;
  onApplyFix?: (field: string, value: string) => void;
}

export function ValidationPreviewStep({
  entityType,
  headers,
  rows,
  mappings,
  validationResult,
  onValidate,
  isLastEntity,
  hasNextEntity,
  onAnomaliesChange,
  onApplyFix,
}: ValidationPreviewStepProps) {
  const [filter, setFilter] = useState<'all' | 'valid' | 'error' | 'warning'>('all');
  const [isFixing, setIsFixing] = useState(false);

  const metrics = useMemo(
    () => calculateQualityMetrics(rows, validationResult, entityType, mappings),
    [rows, validationResult, entityType, mappings]
  );

  const anomalies = useMemo(() => {
    const a = detectAnomalies(entityType, rows, mappings);
    onAnomaliesChange?.(a);
    return a;
  }, [entityType, rows, mappings, onAnomaliesChange]);

  const fixSuggestions = useMemo(
    () => generateSmartFixes(rows, mappings),
    [rows, mappings]
  );

  const handleApplyFix = (field: string, value: string) => {
    onApplyFix?.(field, value);
    setIsFixing(true);
    setTimeout(() => setIsFixing(false), 300);
  };

  return (
    <div className="space-y-4">
      <QualityScoreDashboard metrics={metrics} />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Validated: {entityType.replace('_', ' ')} ({validationResult.totalRows} rows)
        </h3>
        <div className="flex items-center gap-2">
          {fixSuggestions.length > 0 && (
            <AiFixSuggestion
              suggestions={fixSuggestions}
              onApplyFix={handleApplyFix}
              isLoading={isFixing}
            />
          )}
          <div className={`text-lg font-bold ${
            metrics.overall >= 90 ? 'text-green-600' : metrics.overall >= 70 ? 'text-amber-600' : 'text-red-600'
          }`}>
            {metrics.overall}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-md border border-green-200 bg-green-50">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-700">Valid</span>
          </div>
          <p className="text-2xl font-bold text-green-700">{validationResult.validRows}</p>
        </div>
        <div className="p-3 rounded-md border border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">Warnings</span>
          </div>
          <p className="text-2xl font-bold text-amber-700">{validationResult.warningRows}</p>
        </div>
        <div className="p-3 rounded-md border border-red-200 bg-red-50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-red-700">Errors</span>
          </div>
          <p className="text-2xl font-bold text-red-700">{validationResult.errorRows}</p>
        </div>
      </div>

      {anomalies.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">
              {anomalies.length} Anomal{anomalies.length === 1 ? 'y' : 'ies'} Detected
            </span>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {anomalies.slice(0, 10).map((a, i) => (
              <div key={i} className="text-xs text-amber-700">
                <span className="font-medium">Row {a.rowIndex + 1}:</span> {a.detail}
              </div>
            ))}
            {anomalies.length > 10 && (
              <p className="text-xs text-muted-foreground">+{anomalies.length - 10} more</p>
            )}
          </div>
        </div>
      )}

      {validationResult.errors.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {validationResult.errors.slice(0, 20).map((err, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                err.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {err.severity === 'error' ? (
                <span className="text-red-500">✗</span>
              ) : (
                <AlertTriangle className="w-3 h-3 text-amber-500" />
              )}
              <span>Row {err.rowIndex + 1}:</span>
              <span>{err.message}</span>
            </div>
          ))}
          {validationResult.errors.length > 20 && (
            <p className="text-xs text-muted-foreground px-3">+{validationResult.errors.length - 20} more</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filter:</span>
        {(['all', 'valid', 'warning', 'error'] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-2 py-1 text-xs rounded border ${filter === f ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-muted'}`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <PreviewTable
        headers={headers}
        rows={rows}
        validationResult={validationResult}
        mappings={mappings}
        filter={filter}
      />
    </div>
  );
}
