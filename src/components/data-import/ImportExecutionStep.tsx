import { Check, X, Loader2, AlertTriangle } from 'lucide-react';

interface ImportExecutionStepProps {
  isImporting: boolean;
  totalRows: number;
  successRows: number;
  failedRows: number;
  currentBatch: number;
  totalBatches: number;
  error: string | null;
  jobId?: string | null;
  isRolledBack: boolean;
  onCancel: () => void;
  onRollback?: () => void;
}

export function ImportExecutionStep({
  isImporting,
  totalRows,
  successRows,
  failedRows,
  currentBatch,
  totalBatches,
  error,
  jobId,
  isRolledBack,
  onCancel,
  onRollback,
}: ImportExecutionStepProps) {
  const isComplete = !isImporting && !isRolledBack && totalRows > 0 && !error;
  const percent = totalRows > 0 ? Math.round((successRows + failedRows) / totalRows * 100) : 0;
  const failureRate = successRows + failedRows > 0 ? failedRows / (successRows + failedRows) : 0;

  return (
    <div className="space-y-6">
      <div className="text-center py-6">
        {isImporting ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <div>
              <h3 className="text-lg font-medium">Importing data...</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Processing batch {currentBatch} of {totalBatches} • {successRows.toLocaleString()} successful
              </p>
            </div>
          </div>
        ) : isRolledBack ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-amber-700">Import Rolled Back</h3>
              <p className="text-sm text-muted-foreground mt-1">
                All imported data has been removed. Failure rate exceeded 30%.
              </p>
            </div>
          </div>
        ) : isComplete ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-green-700">Import Complete</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {successRows.toLocaleString()} of {totalRows.toLocaleString()} rows imported
                {failedRows > 0 && ` (${failedRows} failed)`}
              </p>
              {failureRate > 0.2 && (
                <p className="text-xs text-amber-600 mt-1">
                  High failure rate — you may want to rollback and review errors
                </p>
              )}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <X className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-red-700">Import Failed</h3>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-medium">Ready to Import</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {totalRows.toLocaleString()} rows will be imported across {totalBatches} entit{totalBatches === 1 ? 'y' : 'ies'}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="w-full h-4 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isRolledBack ? 'bg-amber-500' : error ? 'bg-red-500' : 'bg-primary'
            }`}
            style={{ width: `${isRolledBack || isComplete ? 100 : percent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{isRolledBack ? 'Rolled back' : `${percent}%`}</span>
          {jobId && <span className="font-mono text-[10px]">{jobId.slice(0, 8)}</span>}
        </div>
      </div>

      {(isImporting || isComplete || isRolledBack) && (
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-md bg-muted text-center">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-lg font-bold">{totalRows.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-md bg-green-50 text-center">
            <p className="text-sm text-green-600">Success</p>
            <p className="text-lg font-bold text-green-700">{successRows.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-md bg-red-50 text-center">
            <p className="text-sm text-red-600">Failed</p>
            <p className="text-lg font-bold text-red-700">{failedRows.toLocaleString()}</p>
          </div>
        </div>
      )}

      <div className="flex justify-center gap-3">
        {isImporting && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-md border border-red-300 text-red-700 bg-red-50 hover:bg-red-100"
          >
            Cancel Import
          </button>
        )}
        {(isComplete || failureRate > 0.2) && !isRolledBack && onRollback && (
          <button
            type="button"
            onClick={onRollback}
            className="px-4 py-2 text-sm font-medium rounded-md border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
          >
            Rollback Import
          </button>
        )}
      </div>
    </div>
  );
}
