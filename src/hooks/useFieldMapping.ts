import { useCallback, useMemo } from 'react';
import type { ImportEntityType, FieldMapping, DetectedColumn } from '@/types/dataImport';
import { ENTITY_SCHEMAS } from '@/types/dataImport';

export function useFieldMapping(
  entityType: ImportEntityType | null,
  detectedColumns: DetectedColumn[],
  aiMappings?: FieldMapping[]
) {
  const targetFields = useMemo(() => {
    if (!entityType) return [];
    return ENTITY_SCHEMAS[entityType].fields;
  }, [entityType]);

  const generateInitialMappings = useCallback((): FieldMapping[] => {
    if (!entityType) return [];

    const sourceNames = new Set(detectedColumns.map(c => c.normalizedName));
    const mappings: FieldMapping[] = [];

    for (const col of detectedColumns) {
      let bestMatch: { field: string; confidence: number } | null = null;

      if (aiMappings) {
        const aiMatch = aiMappings.find(m => m.sourceField === col.name);
        if (aiMatch) {
          bestMatch = { field: aiMatch.targetField, confidence: aiMatch.confidence ?? 60 };
        }
      }

      if (!bestMatch) {
        for (const field of targetFields) {
          const fieldNorm = field.key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          if (col.normalizedName === fieldNorm) {
            bestMatch = { field: field.key, confidence: 95 };
            break;
          }
        }
      }

      if (!bestMatch) {
        for (const field of targetFields) {
          const fieldNorm = field.key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          if (
            col.normalizedName.includes(fieldNorm) ||
            fieldNorm.includes(col.normalizedName)
          ) {
            bestMatch = { field: field.key, confidence: 75 };
            break;
          }
        }
      }

      mappings.push({
        sourceField: col.name,
        targetField: bestMatch?.field ?? '',
        confidence: bestMatch?.confidence,
        isAiGenerated: aiMappings ? aiMappings.some(m => m.sourceField === col.name) : false,
      });
    }

    return mappings;
  }, [entityType, detectedColumns, targetFields, aiMappings]);

  const getMissingRequiredFields = useCallback(
    (mappings: FieldMapping[]) => {
      const mappedTargets = new Set(mappings.filter(m => m.targetField).map(m => m.targetField));
      return targetFields.filter(f => f.required && !mappedTargets.has(f.key));
    },
    [targetFields]
  );

  const getConfidenceLevel = useCallback((confidence: number | undefined): 'high' | 'medium' | 'low' => {
    if (!confidence) return 'low';
    if (confidence >= 99) return 'high';
    if (confidence >= 90) return 'medium';
    return 'low';
  }, []);

  return {
    targetFields,
    generateInitialMappings,
    getMissingRequiredFields,
    getConfidenceLevel,
  };
}
