import { useState, useEffect, useCallback, useMemo } from 'react';
import { Save, Trash2, ChevronDown, Lock, Globe, Search, Sparkles } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { ImportEntityType, ImportTemplate } from '@/types/dataImport';
import {
  listTemplates,
  saveTemplate,
  deleteTemplate,
  loadTemplate,
} from '@/services/importTemplates';

interface TemplateSelectorProps {
  supabase: SupabaseClient<Database>;
  companyId: string;
  entityType: ImportEntityType;
  onTemplateSelected: (template: ImportTemplate) => void;
  onSaveAsTemplate: (name: string) => void;
}

const SOURCE_SYSTEM_LABELS: Record<string, string> = {
  tally: 'Tally',
  sap: 'SAP B1',
  zoho: 'Zoho Books',
  quickbooks: 'QuickBooks',
  odoo: 'Odoo',
  erpnext: 'ERPNext',
  generic: 'Generic',
};

export function TemplateSelector({
  supabase,
  companyId,
  entityType,
  onTemplateSelected,
  onSaveAsTemplate,
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listTemplates(supabase, companyId, entityType);
      setTemplates(result);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [supabase, companyId, entityType]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      t =>
        t.name.toLowerCase().includes(q) ||
        t.sourceSystem.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }, [templates, search]);

  const systemTemplates = filtered.filter(t => t.isSystem);
  const userTemplates = filtered.filter(t => !t.isSystem);

  const handleSelect = async (id: string) => {
    const template = await loadTemplate(supabase, id);
    if (template) {
      onTemplateSelected(template);
      setIsOpen(false);
      setSearch('');
    }
  };

  const handleSave = () => {
    if (saveName.trim()) {
      onSaveAsTemplate(saveName.trim());
      setSaveName('');
      setShowSaveDialog(false);
      fetchTemplates();
    }
  };

  const handleDelete = async (id: string) => {
    await deleteTemplate(supabase, id);
    fetchTemplates();
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-muted"
        >
          <Globe className="w-3.5 h-3.5" />
          Templates
          {templates.length > 0 && (
            <span className="text-[10px] text-muted-foreground">({templates.length})</span>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => setShowSaveDialog(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-input bg-background hover:bg-muted"
          title="Save current mapping as template"
        >
          <Save className="w-4 h-4" />
          Save
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full mt-1 w-80 z-50 rounded-md border bg-popover shadow-lg">
          <div className="p-2 border-b">
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="flex-1 bg-transparent text-sm outline-none"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {isLoading && (
              <p className="text-xs text-muted-foreground p-2">Loading...</p>
            )}

            {systemTemplates.length > 0 && (
              <>
                <p className="text-[10px] uppercase text-muted-foreground px-2 py-1.5 font-semibold tracking-wider">
                  System Templates
                </p>
                {systemTemplates.map(t => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between px-2 py-2 rounded-sm hover:bg-muted cursor-pointer"
                    onClick={() => handleSelect(t.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{t.name}</span>
                        <Lock className="w-3 h-3 text-muted-foreground opacity-50" />
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span className="uppercase bg-muted px-1 rounded">{SOURCE_SYSTEM_LABELS[t.sourceSystem] ?? t.sourceSystem}</span>
                        {t.description && <span className="truncate">{t.description}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {userTemplates.length > 0 && (
              <>
                <p className="text-[10px] uppercase text-muted-foreground px-2 py-1.5 font-semibold tracking-wider mt-1">
                  My Templates
                </p>
                {userTemplates.map(t => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between px-2 py-2 rounded-sm hover:bg-muted cursor-pointer group"
                    onClick={() => handleSelect(t.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{t.name}</span>
                        <Sparkles className="w-3 h-3 text-purple-400 opacity-60" />
                      </div>
                      {t.description && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{t.description}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                      className="ml-2 p-1 opacity-0 group-hover:opacity-100 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-all"
                      title="Delete template"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </>
            )}

            {filtered.length === 0 && !isLoading && (
              <p className="text-xs text-muted-foreground p-2">
                {search ? 'No matching templates' : 'No templates yet'}
              </p>
            )}
          </div>
        </div>
      )}

      {showSaveDialog && (
        <div className="absolute top-full mt-1 right-0 w-72 z-50 rounded-md border bg-popover shadow-lg p-3">
          <p className="text-sm font-medium mb-2">Save as Template</p>
          <input
            type="text"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Template name..."
            className="w-full px-2 py-1.5 text-sm border border-input rounded-md mb-2"
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveDialog(false); }}
          />
          <p className="text-[10px] text-muted-foreground mb-2">
            Saves current {entityType.replace('_', ' ')} mappings for reuse
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowSaveDialog(false)} className="px-2 py-1 text-xs rounded border border-input hover:bg-muted">Cancel</button>
            <button onClick={handleSave} disabled={!saveName.trim()} className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
