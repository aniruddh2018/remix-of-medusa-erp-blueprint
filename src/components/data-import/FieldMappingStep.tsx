import { AlertTriangle } from 'lucide-react';
import type { ImportEntityType, FieldMapping, DetectedColumn } from '@/types/dataImport';
import { ENTITY_SCHEMAS } from '@/types/dataImport';
import { ConfidenceBadge } from './ConfidenceBadge';

interface FieldMappingStepProps {
  entityType: ImportEntityType;
  detectedColumns: DetectedColumn[];
  mappings: FieldMapping[];
  onMappingsChange: (mappings: FieldMapping[]) => void;
  detectedErp?: string | null;
  onAIMapping?: () => void;
  isAILoading?: boolean;
}

const TRANSFORM_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'cast:number', label: 'Cast → Number' },
  { value: 'cast:date', label: 'Cast → Date' },
  { value: 'cast:boolean', label: 'Cast → Boolean' },
  { value: 'trim', label: 'Trim whitespace' },
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'lowercase', label: 'lowercase' },
];

export function FieldMappingStep({
  entityType,
  detectedColumns,
  mappings,
  onMappingsChange,
  detectedErp,
  onAIMapping,
  isAILoading,
}: FieldMappingStepProps) {
  const schema = ENTITY_SCHEMAS[entityType];
  const targetFields = schema.fields;
  const mappedTargets = new Set(mappings.filter(m => m.targetField).map(m => m.targetField));
  const missingRequired = targetFields.filter(f => f.required && !mappedTargets.has(f.key));

  const updateMapping = (sourceField: string, targetField: string) => {
    onMappingsChange(
      mappings.map(m =>
        m.sourceField === sourceField
          ? { ...m, targetField, confidence: targetField ? 100 : undefined }
          : m
      )
    );
  };

  const updateTransform = (sourceField: string, transformation: string) => {
    onMappingsChange(
      mappings.map(m =>
        m.sourceField === sourceField
          ? { ...m, transformation: transformation || undefined }
          : m
      )
    );
  };

  const getConfidenceBg = (confidence: number | undefined) => {
    if (!confidence) return 'bg-muted';
    if (confidence >= 99) return 'bg-green-50 border-green-200';
    if (confidence >= 90) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h3 className="text-sm font-medium">
          Map {detectedColumns.length} source columns → {schema.label} fields
        </h3>
        {missingRequired.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-red-600">
            <AlertTriangle className="w-3 h-3" />
            {missingRequired.length} required field{missingRequired.length > 1 ? 's' : ''} unmapped
          </span>
        )}
        {onAIMapping && (
          <button
            type="button"
            onClick={onAIMapping}
            disabled={isAILoading}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 text-purple-700 hover:from-purple-100 hover:to-blue-100 disabled:opacity-50"
          >
            {isAILoading ? (
              <>
                <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                ✨ AI Auto-Map
              </>
            )}
          </button>
        )}
      </div>

      {detectedErp && (
        <div className="text-xs text-muted-foreground">
          Detected source system: <span className="font-medium uppercase">{detectedErp}</span>
        </div>
      )}

      {missingRequired.length > 0 && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
          <strong>Missing required fields:</strong>{' '}
          {missingRequired.map(f => f.label).join(', ')}. These cannot be empty.
        </div>
      )}

      <div className="space-y-2" data-enter-nav>
        {mappings.map(mapping => {
          const col = detectedColumns.find(c => c.name === mapping.sourceField);
          return (
            <div
              key={mapping.sourceField}
              className={`flex items-center gap-3 p-3 rounded-md border ${getConfidenceBg(mapping.confidence)}`}
            >
              <div className="w-1/3 min-w-0">
                <p className="text-sm font-medium truncate">{mapping.sourceField}</p>
                <p className="text-xs text-muted-foreground">
                  {col?.detectedType ?? 'unknown'} • {col?.sampleValues[0] ?? ''}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">→</span>
                <ConfidenceBadge
                  confidence={mapping.confidence}
                  isAiGenerated={mapping.isAiGenerated}
                  size="sm"
                />
              </div>

              <select
                value={mapping.targetField}
                onChange={e => updateMapping(mapping.sourceField, e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-input rounded-md bg-background"
                data-enter-nav-focus="true"
              >
                <option value="">-- Skip --</option>
                <optgroup label="Required">
                  {targetFields.filter(f => f.required).map(f => (
                    <option key={f.key} value={f.key}>
                      {f.label} *
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Optional">
                  {targetFields.filter(f => !f.required).map(f => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              </select>

              <select
                value={mapping.transformation ?? ''}
                onChange={e => updateTransform(mapping.sourceField, e.target.value)}
                className="w-40 px-2 py-1.5 text-sm border border-input rounded-md bg-background"
              >
                {TRANSFORM_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
