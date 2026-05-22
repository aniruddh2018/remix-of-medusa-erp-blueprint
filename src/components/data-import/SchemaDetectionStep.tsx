import { Check, AlertTriangle, Hash, Calendar, Mail, Phone, Type, DollarSign } from 'lucide-react';
import type { DetectedColumn, ImportEntityType } from '@/types/dataImport';
import { ENTITY_SCHEMAS } from '@/types/dataImport';

interface SchemaDetectionStepProps {
  columns: DetectedColumn[];
  totalRows: number;
  fileType: string;
  selectedEntities: ImportEntityType[];
  onEntitiesChange: (entities: ImportEntityType[]) => void;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  string: Type,
  number: Hash,
  date: Calendar,
  email: Mail,
  phone: Phone,
  gst: DollarSign,
  boolean: Check,
  unknown: AlertTriangle,
};

export function SchemaDetectionStep({
  columns,
  totalRows,
  fileType,
  selectedEntities,
  onEntitiesChange,
}: SchemaDetectionStepProps) {
  const toggleEntity = (entity: ImportEntityType) => {
    if (selectedEntities.includes(entity)) {
      onEntitiesChange(selectedEntities.filter(e => e !== entity));
    } else {
      onEntitiesChange([...selectedEntities, entity]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{totalRows.toLocaleString()} rows</span>
        <span>•</span>
        <span>{columns.length} columns detected</span>
        <span>•</span>
        <span className="uppercase">{fileType}</span>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-3">Select entity types to import</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {Object.values(ENTITY_SCHEMAS).map(schema => {
            const isSelected = selectedEntities.includes(schema.entityType);
            return (
              <button
                key={schema.entityType}
                type="button"
                onClick={() => toggleEntity(schema.entityType)}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition-colors
                  ${isSelected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input hover:bg-muted'
                  }
                `}
                data-enter-nav-focus="true"
              >
                <span>{schema.label}</span>
                {isSelected && <Check className="w-4 h-4 ml-auto" />}
              </button>
            );
          })}
        </div>
        {selectedEntities.length === 0 && (
          <p className="text-sm text-muted-foreground mt-2">Select at least one entity type</p>
        )}
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="bg-muted px-4 py-2 text-sm font-medium">Column Analysis</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-enter-nav>
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Column</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Sample Values</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Nulls</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Unique</th>
              </tr>
            </thead>
            <tbody>
              {columns.map(col => {
                const Icon = TYPE_ICONS[col.detectedType] || Type;
                return (
                  <tr key={col.name} className="border-b" data-enter-nav-focus="true">
                    <td className="px-3 py-2 font-medium truncate max-w-[200px]">{col.name}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted">
                        <Icon className="w-3 h-3" />
                        {col.detectedType}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[300px]">
                      {col.sampleValues.slice(0, 3).join(', ')}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {col.nullCount > 0 && (
                        <span className="text-amber-600">{col.nullCount}</span>
                      )}
                      {col.nullCount === 0 && <span className="text-green-600">0</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{col.uniqueCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
