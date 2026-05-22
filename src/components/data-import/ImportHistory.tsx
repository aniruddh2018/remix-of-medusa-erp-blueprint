import { useState } from 'react';
import { RotateCcw, Download, Eye, X, RefreshCw, AlertTriangle, Check, Clock } from 'lucide-react';
import type { ImportJob, ImportEntityType, FieldMapping } from '@/types/dataImport';
import { ENTITY_SCHEMAS } from '@/types/dataImport';

interface ImportHistoryProps {
  jobs: ImportJob[];
  isLoading: boolean;
  error: string | null;
  onRefetch: () => void;
  onReimport?: (job: ImportJob) => void;
  onRollback?: (jobId: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  importing: { label: 'Importing', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: RefreshCw },
  completed: { label: 'Completed', className: 'bg-green-50 text-green-700 border-green-200', icon: Check },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700 border-red-200', icon: X },
  rolled_back: { label: 'Rolled Back', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle },
  uploaded: { label: 'Pending', className: 'bg-muted text-muted-foreground border-input', icon: Clock },
};

function downloadErrorReport(job: ImportJob) {
  const errors = job.errorLog ?? [];
  const content = [
    `Import Error Report — Job ${job.id}`,
    `Entity: ${job.entityType}`,
    `Date: ${job.createdAt}`,
    `Total: ${job.totalRows} | Success: ${job.successRows} | Failed: ${job.failedRows}`,
    '',
    '--- Errors ---',
    ...errors,
  ].join('\n');

  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `import-errors-${job.id.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportHistory({
  jobs,
  isLoading,
  error,
  onRefetch,
  onReimport,
  onRollback,
}: ImportHistoryProps) {
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  if (isLoading && jobs.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading import history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
        {error}
        <button onClick={onRefetch} className="ml-2 underline">Retry</button>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No imports yet. Start by uploading a file in the Import tab.
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Entity</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">File</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Success</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Failed</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => {
              const isExpanded = expandedJob === job.id;
              const statusConfig = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.uploaded;
              const StatusIcon = statusConfig.icon;
              const entityLabel = ENTITY_SCHEMAS[job.entityType as ImportEntityType]?.label ?? job.entityType;
              return (
                <>
                  <tr key={job.id} className="border-b hover:bg-muted/50" data-kb-row tabIndex={0}>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">{entityLabel}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[180px]">
                      {job.fileName || '—'}
                    </td>
                    <td className="px-3 py-2 text-right">{job.totalRows}</td>
                    <td className="px-3 py-2 text-right text-green-600">{job.successRows}</td>
                    <td className="px-3 py-2 text-right text-red-600">{job.failedRows}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${statusConfig.className}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                          className="p-1 rounded hover:bg-muted"
                          title="View details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {job.status !== 'importing' && onReimport && (
                          <button
                            type="button"
                            onClick={() => onReimport(job)}
                            className="p-1 rounded hover:bg-muted"
                            title="Re-import"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {job.failedRows > 0 && job.errorLog?.length && (
                          <button
                            type="button"
                            onClick={() => downloadErrorReport(job)}
                            className="p-1 rounded hover:bg-muted"
                            title="Download error report"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(job.status === 'completed' || job.status === 'importing') && onRollback && (
                          <button
                            type="button"
                            onClick={() => onRollback(job.id)}
                            className="p-1 rounded hover:bg-red-100 text-red-600"
                            title="Rollback import"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${job.id}-detail`} className="border-b bg-muted/20">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="space-y-2 text-xs">
                          <div className="flex gap-4">
                            <span><strong>Job ID:</strong> {job.id.slice(0, 8)}...</span>
                            <span><strong>Type:</strong> {job.fileType.toUpperCase()}</span>
                            <span><strong>Mappings:</strong> {job.mappingConfig.length} fields</span>
                          </div>
                          {job.errorLog && job.errorLog.length > 0 && (
                            <div className="max-h-32 overflow-y-auto space-y-0.5">
                              <strong>Errors:</strong>
                              {job.errorLog.slice(0, 10).map((err, i) => (
                                <div key={i} className="text-red-600 font-mono pl-2">{err}</div>
                              ))}
                              {job.errorLog.length > 10 && (
                                <div className="text-muted-foreground pl-2">+{job.errorLog.length - 10} more</div>
                              )}
                            </div>
                          )}
                          {job.mappingConfig.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              <strong>Fields:</strong>
                              {job.mappingConfig.map(m => (
                                <span key={m.sourceField} className="px-1.5 py-0.5 rounded bg-muted text-[10px]">
                                  {m.sourceField} → {m.targetField}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
