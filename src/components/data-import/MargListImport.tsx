import { useState, useCallback, useMemo } from 'react';
import { useBusiness } from '@/contexts/BusinessContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { parseMargWorkbook, type MargRow } from '@/lib/import/margListParser';
import { importMargRows, type MargImportResult } from '@/services/margImport';

type Stage = 'idle' | 'parsing' | 'preview' | 'importing' | 'done';

export function MargListImport() {
  const { companyId } = useBusiness();
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>('idle');
  const [rows, setRows] = useState<MargRow[]>([]);
  const [filter, setFilter] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [importResult, setImportResult] = useState<MargImportResult | null>(null);
  const [fileName, setFileName] = useState('');

  const handleFile = useCallback(async (file: File) => {
    setStage('parsing');
    setFileName(file.name);
    try {
      const parsed = await parseMargWorkbook(file);
      if (parsed.length === 0) {
        toast({ title: 'No items detected', description: 'The file does not match the Marg List-of-Items format.', variant: 'destructive' });
        setStage('idle');
        return;
      }
      setRows(parsed);
      setStage('preview');
      toast({ title: 'Parsed', description: `${parsed.length} items extracted` });
    } catch (err) {
      toast({ title: 'Parse failed', description: (err as Error).message, variant: 'destructive' });
      setStage('idle');
    }
  }, [toast]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter(
      (r) =>
        r.brand.toLowerCase().includes(q) ||
        r.generic.toLowerCase().includes(q) ||
        (r.strength ?? '').toLowerCase().includes(q),
    );
  }, [rows, filter]);

  const selectedCount = rows.filter((r) => r.selected).length;
  const lowConfCount = rows.filter((r) => r.selected && r.confidence < 0.7).length;

  const toggleAll = (val: boolean) => setRows((rs) => rs.map((r) => ({ ...r, selected: val })));
  const toggleRow = (idx: number) =>
    setRows((rs) => rs.map((r) => (r.rowIndex === idx ? { ...r, selected: !r.selected } : r)));
  const updateField = (idx: number, field: keyof MargRow, value: unknown) =>
    setRows((rs) => rs.map((r) => (r.rowIndex === idx ? { ...r, [field]: value } : r)));

  const handleImport = useCallback(async () => {
    if (!companyId) {
      toast({ title: 'No company selected', variant: 'destructive' });
      return;
    }
    setStage('importing');
    setProgress({ done: 0, total: selectedCount });
    const res = await importMargRows(rows, companyId, (done, total) => setProgress({ done, total }));
    setImportResult(res);
    setStage('done');
    toast({
      title: 'Import finished',
      description: `${res.inserted} added, ${res.skipped} skipped, ${res.failed} failed`,
    });
  }, [companyId, rows, selectedCount, toast]);

  const reset = () => {
    setStage('idle');
    setRows([]);
    setImportResult(null);
    setFileName('');
    setFilter('');
  };

  return (
    <div className="space-y-4">
      {stage === 'idle' && (
        <Card>
          <CardHeader>
            <CardTitle>Marg "List of Items" Importer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a Marg-exported <code>.xls</code> / <code>.xlsx</code> "List of Items" report. The importer
              auto-detects the salt/generic group, brand name, strength, packing and conversion factor for each
              item.
            </p>
            <label
              htmlFor="marg-file"
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-muted/40"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="font-medium">Click to upload Marg item-list (.xls / .xlsx)</span>
              <span className="text-xs text-muted-foreground">Max 50 MB</span>
              <input
                id="marg-file"
                type="file"
                accept=".xls,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </CardContent>
        </Card>
      )}

      {stage === 'parsing' && (
        <Card>
          <CardContent className="flex items-center gap-3 py-10">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Parsing {fileName}…</span>
          </CardContent>
        </Card>
      )}

      {stage === 'preview' && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">{fileName}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {rows.length} items parsed · {selectedCount} selected
                  {lowConfCount > 0 && (
                    <span className="ml-2 text-amber-600">· {lowConfCount} need review</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
                <Button size="sm" disabled={selectedCount === 0} onClick={handleImport}>
                  Import {selectedCount} items
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-3">
                <Input
                  placeholder="Filter brand / generic / strength…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="max-w-sm"
                />
                <Button variant="ghost" size="sm" onClick={() => toggleAll(true)}>Select all</Button>
                <Button variant="ghost" size="sm" onClick={() => toggleAll(false)}>Deselect all</Button>
              </div>
              <div className="border rounded-md overflow-auto max-h-[60vh]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="p-2 w-8"></th>
                      <th className="p-2">Brand</th>
                      <th className="p-2">Generic</th>
                      <th className="p-2">Strength</th>
                      <th className="p-2">Form</th>
                      <th className="p-2">Pack</th>
                      <th className="p-2">Conv</th>
                      <th className="p-2 text-right">MRP</th>
                      <th className="p-2 text-right">Rate</th>
                      <th className="p-2 text-right">GST%</th>
                      <th className="p-2">Sched</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 500).map((r) => (
                      <tr
                        key={r.rowIndex}
                        className={`border-t hover:bg-muted/30 ${r.confidence < 0.7 ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}
                      >
                        <td className="p-2">
                          <Checkbox checked={r.selected} onCheckedChange={() => toggleRow(r.rowIndex)} />
                        </td>
                        <td className="p-2">
                          <Input
                            className="h-7 text-xs"
                            value={r.brand}
                            onChange={(e) => updateField(r.rowIndex, 'brand', e.target.value)}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className="h-7 text-xs"
                            value={r.generic}
                            onChange={(e) => updateField(r.rowIndex, 'generic', e.target.value)}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            className="h-7 text-xs w-20"
                            value={r.strength ?? ''}
                            onChange={(e) => updateField(r.rowIndex, 'strength', e.target.value)}
                          />
                        </td>
                        <td className="p-2">{r.form}</td>
                        <td className="p-2 whitespace-nowrap">{r.pack}</td>
                        <td className="p-2 whitespace-nowrap text-muted-foreground">
                          {r.conversion ? `1 ${r.secondaryUnit} = ${r.conversion} ${r.baseUnit}` : '—'}
                        </td>
                        <td className="p-2 text-right">{r.mrp.toFixed(2)}</td>
                        <td className="p-2 text-right">{r.purchase_price.toFixed(2)}</td>
                        <td className="p-2 text-right">{r.gst_percentage}</td>
                        <td className="p-2">
                          {r.schedule !== 'none' && (
                            <Badge variant="outline" className="text-[10px]">{r.schedule.replace('schedule_', 'H').toUpperCase()}</Badge>
                          )}
                        </td>
                        <td className="p-2">
                          {r.confidence < 0.7 && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 500 && (
                  <div className="p-2 text-xs text-center text-muted-foreground border-t">
                    Showing first 500 of {filtered.length}. Use the filter to narrow down.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {stage === 'importing' && (
        <Card>
          <CardContent className="space-y-3 py-10">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Importing {progress.done} / {progress.total}…</span>
            </div>
            <div className="w-full h-2 bg-muted rounded">
              <div
                className="h-2 bg-primary rounded transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {stage === 'done' && importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" /> Import finished
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Inserted" value={importResult.inserted} tone="success" />
              <Stat label="Skipped (duplicates)" value={importResult.skipped} tone="muted" />
              <Stat label="Failed" value={importResult.failed} tone={importResult.failed ? 'error' : 'muted'} />
            </div>
            {importResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <div className="font-medium mb-1">First errors:</div>
                  <ul className="text-xs list-disc pl-4 space-y-0.5">
                    {importResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <Button onClick={reset}>Import another file</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'success' | 'error' | 'muted' }) {
  const color =
    tone === 'success' ? 'text-green-600' : tone === 'error' ? 'text-destructive' : 'text-foreground';
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
