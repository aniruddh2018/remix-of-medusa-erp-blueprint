import { useRef, useCallback } from 'react';
import { Upload, FileSpreadsheet, FileJson, FileText, FileCode } from 'lucide-react';
import type { ParsedData } from '@/types/dataImport';
import { parseFile, detectFileType } from '@/services/fileParsers';

interface FileUploadStepProps {
  onParsed: (data: ParsedData) => void;
  onError: (error: string) => void;
}

function getFileIcon(fileType: string | null) {
  switch (fileType) {
    case 'csv':
      return <FileText className="w-8 h-8 text-green-600" />;
    case 'xlsx':
    case 'xls':
      return <FileSpreadsheet className="w-8 h-8 text-green-600" />;
    case 'json':
      return <FileJson className="w-8 h-8 text-green-600" />;
    case 'xml':
      return <FileCode className="w-8 h-8 text-blue-600" />;
    default:
      return <Upload className="w-8 h-8 text-muted-foreground" />;
  }
}

export function FileUploadStep({ onParsed, onError }: FileUploadStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [preview, setPreview] = useState<ParsedData | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const type = detectFileType(file.name);
      if (!type) {
        onError('Unsupported file type. Please upload CSV, Excel (.xlsx), JSON, or XML files.');
        return;
      }

      setFileName(file.name);
      setFileType(type);
      setIsParsing(true);

      try {
        const data = await parseFile(file);
        setPreview(data);
        onParsed(data);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Failed to parse file');
      } finally {
        setIsParsing(false);
      }
    },
    [onParsed, onError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-6">
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
        role="button"
        tabIndex={0}
        data-enter-nav-focus="true"
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.json,.xml"
          onChange={handleChange}
          className="hidden"
        />

        {isParsing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground">Parsing file...</p>
          </div>
        ) : fileName ? (
          <div className="flex flex-col items-center gap-3">
            {getFileIcon(fileType)}
            <p className="font-medium">{fileName}</p>
            <p className="text-sm text-muted-foreground">
              {preview ? `${preview.totalRows} rows, ${preview.headers.length} columns` : ''}
            </p>
            <p className="text-xs text-primary">Click or drop to replace</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-10 h-10 text-muted-foreground" />
            <p className="font-medium">Drop your file here or click to browse</p>
            <p className="text-sm text-muted-foreground">
              Supports CSV, Excel (.xlsx), JSON, and XML (Tally) files
            </p>
          </div>
        )}
      </div>

      {preview && (
        <div className="rounded-md border overflow-hidden">
          <div className="bg-muted px-4 py-2 text-sm font-medium">
            Preview (first {Math.min(5, preview.rows.length)} rows)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                  {preview.headers.slice(0, 6).map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground truncate max-w-[150px]">
                      {h}
                    </th>
                  ))}
                  {preview.headers.length > 6 && (
                    <th className="px-3 py-2 text-left text-xs text-muted-foreground">
                      +{preview.headers.length - 6} more
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    {preview.headers.slice(0, 6).map(h => (
                      <td key={h} className="px-3 py-1.5 truncate max-w-[150px]">
                        {String(row[h] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
