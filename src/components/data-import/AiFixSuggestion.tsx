import { useState } from 'react';
import { Wand2, Check } from 'lucide-react';

interface FixSuggestion {
  field: string;
  currentValue: unknown;
  suggestedValue: string;
  reason: string;
}

interface AiFixSuggestionProps {
  suggestions: FixSuggestion[];
  onApplyFix: (field: string, value: string) => void;
  isLoading: boolean;
}

export function AiFixSuggestion({ suggestions, onApplyFix, isLoading }: AiFixSuggestionProps) {
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);

  if (suggestions.length === 0 && !isLoading) return null;

  const pending = suggestions.filter(s => !applied.has(s.field));

  const handleApply = (field: string, value: string) => {
    onApplyFix(field, value);
    setApplied(prev => new Set(prev).add(field));
  };

  const handleApplyAll = () => {
    for (const s of pending) {
      onApplyFix(s.field, s.suggestedValue);
    }
    setApplied(new Set(suggestions.map(s => s.field)));
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading || pending.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            Getting suggestions...
          </>
        ) : (
          <>
            <Wand2 className="w-3.5 h-3.5" />
            AI Fixes
            {pending.length > 0 && (
              <span className="bg-purple-200 text-purple-800 px-1 rounded text-[10px]">{pending.length}</span>
            )}
          </>
        )}
      </button>

      {isOpen && pending.length > 0 && (
        <div className="absolute top-full mt-1 right-0 w-80 z-50 rounded-md border bg-popover shadow-lg">
          <div className="p-3 border-b flex items-center justify-between">
            <p className="text-sm font-medium">Suggested Fixes</p>
            <button onClick={handleApplyAll} className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800">
              <Check className="w-3 h-3" />
              Apply All
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-2 space-y-2">
            {pending.map((s, i) => (
              <div key={i} className="p-2 rounded-md bg-muted/50 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium font-mono">{s.field}</span>
                  <button
                    onClick={() => handleApply(s.field, s.suggestedValue)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-100 text-purple-700 hover:bg-purple-200"
                  >
                    <Wand2 className="w-3 h-3" />
                    Fix
                  </button>
                </div>
                <p className="text-muted-foreground">
                  <span className="line-through text-red-400">{String(s.currentValue)}</span>
                  {' → '}
                  <span className="text-green-600">{s.suggestedValue}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">{s.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Generate AI fix suggestions client-side (no LLM needed for common cases) ─

export function generateSmartFixes(
  rows: Record<string, unknown>[],
  mappings?: { sourceField: string; targetField: string }[]
): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];
  const fieldMap = new Map<string, string>();
  if (mappings) {
    for (const m of mappings) fieldMap.set(m.targetField, m.sourceField);
  }

  const resolveField = (field: string) => fieldMap.get(field) ?? field;

  for (const row of rows) {
    // Date format fix: detect DD/MM/YYYY patterns
    const dateKeys = ['expiry_date', 'manufacturing_date', 'order_date', 'payment_date'];
    for (const key of dateKeys) {
      const src = resolveField(key);
      const val = String(row[src] ?? '');
      const match = val.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      if (match) {
        const [, d, m, y] = match;
        const iso = `${y}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
        if (iso !== val && !suggestions.some(s => s.field === src)) {
          suggestions.push({
            field: src,
            currentValue: val,
            suggestedValue: iso,
            reason: 'Convert date to ISO format (YYYY-MM-DD)',
          });
        }
      }
    }

    // Phone format fix: strip spaces and add +91
    const phoneKeys = ['phone', 'customer_phone'];
    for (const key of phoneKeys) {
      const src = resolveField(key);
      const val = String(row[src] ?? '').replace(/[\s\-\(\)]/g, '');
      if (val && val.length === 10 && /^\d{10}$/.test(val) && !val.startsWith('+91')) {
        const fixed = `+91${val}`;
        if (!suggestions.some(s => s.field === src)) {
          suggestions.push({ field: src, currentValue: row[src], suggestedValue: fixed, reason: 'Add +91 country code' });
        }
      }
    }

    // GST format fix: uppercase + strip whitespace
    const gstKeys = ['gst_number', 'gstin'];
    for (const key of gstKeys) {
      const src = resolveField(key);
      const val = String(row[src] ?? '').replace(/[\s\-]/g, '');
      const upper = val.toUpperCase();
      if (upper !== String(row[src] ?? '') && upper.length >= 15) {
        if (!suggestions.some(s => s.field === src)) {
          suggestions.push({ field: src, currentValue: row[src], suggestedValue: upper, reason: 'Normalize GST format (uppercase, no spaces)' });
        }
      }
    }
  }

  return suggestions;
}
