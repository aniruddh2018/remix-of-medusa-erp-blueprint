import { Check, X, AlertTriangle } from 'lucide-react';
import type { ValidationResult } from '@/types/dataImport';
import { getRowErrors, getRowStatus } from '@/services/importValidators';
import { AnomalyBadge, hasAnomaly } from './AnomalyBadge';
import type { AnomalyFlag } from '@/services/importValidators';

interface PreviewTableProps {
  headers: string[];
  rows: Record<string, unknown>[];
  validationResult: ValidationResult;
  mappings?: { sourceField: string; targetField: string }[];
  filter?: 'all' | 'valid' | 'error' | 'warning';
  maxRows?: number;
  anomalies?: AnomalyFlag[];
}

export function PreviewTable({
  headers,
  rows,
  validationResult,
  filter = 'all',
  maxRows = 100,
  anomalies = [],
}: PreviewTableProps) {
  const displayRows = rows.slice(0, maxRows);

  const filteredRows = displayRows.map((row, idx) => {
    const status = getRowStatus(validationResult, idx);
    return { row, idx, status };
  }).filter(({ status }) => {
    if (filter === 'all') return true;
    if (filter === 'valid') return status === 'valid';
    if (filter === 'error') return status === 'error';
    if (filter === 'warning') return status === 'warning';
    return true;
  });

  const getCellError = (rowIndex: number, header: string) => {
    const errors = getRowErrors(validationResult, rowIndex);
    return errors.find(e => e.field === header);
  };

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto" data-kb-grid>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-8">#</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-8">Status</th>
              {anomalies.length > 0 && (
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-10">Anom</th>
              )}
              {headers.map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground truncate max-w-[180px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(({ row, idx, status }) => (
              <tr
                key={idx}
                className={`border-b hover:bg-muted/50 ${status === 'error' ? 'bg-red-50/50' : status === 'warning' ? 'bg-amber-50/50' : ''} ${hasAnomaly(anomalies, idx) ? 'ring-1 ring-amber-200' : ''}`}
                data-kb-row
                tabIndex={0}
              >
                <td className="px-2 py-1.5 text-muted-foreground text-xs">{idx + 1}</td>
                <td className="px-2 py-1.5">
                  {status === 'valid' && <Check className="w-4 h-4 text-green-500" />}
                  {status === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                  {status === 'error' && <X className="w-4 h-4 text-red-500" />}
                </td>
                {anomalies.length > 0 && (
                  <td className="px-2 py-1.5">
                    <AnomalyBadge anomalies={anomalies} rowIndex={idx} />
                  </td>
                )}
                {headers.map(h => {
                  const cellError = getCellError(idx, h);
                  const cellAnomaly = anomalies.find(a => a.rowIndex === idx && a.field === h);
                  return (
                    <td
                      key={h}
                      className={`px-3 py-1.5 truncate max-w-[180px] ${cellError ? 'border border-red-300 bg-red-50 rounded-sm' : ''} ${cellAnomaly ? 'relative' : ''}`}
                      data-kb-cell
                      title={cellError?.message || cellAnomaly?.detail}
                    >
                      <span>{String(row[h] ?? '')}</span>
                      {cellError && (
                        <span className="ml-1 text-xs text-red-600">
                          {cellError.severity === 'error' ? '✗' : '⚠'}
                        </span>
                      )}
                      {cellAnomaly && (
                        <span className="ml-1 inline-flex items-center" title={cellAnomaly.detail}>
                          <AlertTriangle className={`w-3 h-3 ${cellAnomaly.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`} />
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={headers.length + (anomalies.length > 0 ? 3 : 2)} className="px-3 py-8 text-center text-muted-foreground">
                  No rows match the current filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
        <span>Showing {filteredRows.length} of {displayRows.length} rows{rows.length > maxRows && ` (${rows.length} total)`}</span>
        <span>✓ {validationResult.validRows} | ⚠ {validationResult.warningRows} | ✗ {validationResult.errorRows}{anomalies.length > 0 && ` | 🔍 ${anomalies.length}`}</span>
      </div>
    </div>
  );
}
