import { AlertTriangle, XCircle } from 'lucide-react';
import type { AnomalyFlag } from '@/services/importValidators';

interface AnomalyBadgeProps {
  anomalies: AnomalyFlag[];
  rowIndex: number;
}

export function AnomalyBadge({ anomalies, rowIndex }: AnomalyBadgeProps) {
  const rowAnomalies = anomalies.filter(a => a.rowIndex === rowIndex);
  if (rowAnomalies.length === 0) return null;

  const hasError = rowAnomalies.some(a => a.severity === 'error');
  const Icon = hasError ? XCircle : AlertTriangle;

  return (
    <div className="relative inline-flex group" data-kb-cell tabIndex={0}>
      <span
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
          hasError
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}
      >
        <Icon className="w-3 h-3" />
        {rowAnomalies.length}
      </span>

      <div className="absolute bottom-full left-0 mb-1 w-60 z-50 hidden group-hover:block">
        <div className="rounded-md border bg-popover shadow-lg p-2 space-y-1">
          {rowAnomalies.map((a, i) => (
            <div key={i} className={`text-xs ${a.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
              <span className="font-medium">{a.type}:</span> {a.detail}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function getRowAnomalies(anomalies: AnomalyFlag[], rowIndex: number): AnomalyFlag[] {
  return anomalies.filter(a => a.rowIndex === rowIndex);
}

export function hasAnomaly(anomalies: AnomalyFlag[], rowIndex: number): boolean {
  return anomalies.some(a => a.rowIndex === rowIndex);
}
