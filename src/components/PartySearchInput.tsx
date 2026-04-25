import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Search, X, Check, UserPlus, Phone, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface PartyRecord {
  id: string;
  name: string;
  phone?: string | null;
  gst_number?: string | null;
  address?: string | null;
}

export interface PartySearchHandle {
  focus: () => void;
  clear: () => void;
}

interface Props {
  parties: PartyRecord[] | undefined;
  selectedId: string | null;
  selectedName: string;
  onSelect: (party: PartyRecord) => void;
  onClear: () => void;
  /** Called when the user opts to create a new entry. Receives whatever they typed
   *  so the form can be pre-seeded (name OR phone). */
  onCreateNew: (seed: { name?: string; phone?: string }) => void;
  /** Called when the user wants to edit the currently-selected party (pencil icon or Ctrl+E). */
  onEditSelected?: (party: PartyRecord) => void;
  placeholder?: string;
  /** Label used in the "create new" prompt, e.g. 'customer' or 'supplier' */
  entityLabel?: string;
  /** Adds the data attribute used by Enter-navigation */
  enterNavInclude?: boolean;
  /** Marks this selector as required for Enter-navigation validation. */
  required?: boolean;
  className?: string;
}

const isProbablyPhone = (s: string) => /^[\d+\-\s]{4,}$/.test(s.trim());

export const PartySearchInput = forwardRef<PartySearchHandle, Props>(function PartySearchInput(
  { parties, selectedId, selectedName, onSelect, onClear, onCreateNew, onEditSelected, placeholder = "Type name or phone…", entityLabel = "customer", enterNavInclude = false, required = false, className },
  ref
) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => { setQuery(""); setOpen(false); },
  }));

  const results = useMemo(() => {
    if (!parties) return [];
    const q = query.trim().toLowerCase();
    if (!q) return parties.slice(0, 30);
    return parties
      .filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.phone && p.phone.toLowerCase().includes(q)) ||
        (p.gst_number && p.gst_number.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [parties, query]);

  // Total options including the synthetic "Create new" row when query has no exact match
  const showCreateRow = query.trim().length > 0 &&
    !results.some(r => r.name.toLowerCase() === query.trim().toLowerCase() ||
                       (r.phone && r.phone === query.trim()));
  const totalOptions = results.length + (showCreateRow ? 1 : 0);

  useEffect(() => { setHighlight(0); }, [query, open]);

  // Outside-click closes
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Scroll highlighted into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const triggerCreate = () => {
    const q = query.trim();
    onCreateNew(isProbablyPhone(q) ? { phone: q } : { name: q });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd+N opens create-new even while typing
    if ((e.key === "n" || e.key === "N") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      triggerCreate();
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown") { setOpen(true); e.preventDefault(); }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlight(h => Math.min(h + 1, totalOptions - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlight(h => Math.max(h - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (showCreateRow && highlight === results.length) {
          triggerCreate();
        } else if (results[highlight]) {
          handleSelect(results[highlight]);
        } else if (showCreateRow) {
          triggerCreate();
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        if (results[highlight]) handleSelect(results[highlight]);
        setOpen(false);
        break;
    }
  };

  const handleSelect = (p: PartyRecord) => {
    onSelect(p);
    setQuery("");
    setOpen(false);
  };

  const clearSelection = () => {
    onClear();
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  return (
    <div ref={containerRef} className={`relative ${className || ""}`} data-field-required={required ? "true" : undefined}>
      {selectedId && !query ? (
        <div
          className="flex items-center h-8 w-full rounded-md border border-input bg-background px-3 text-sm cursor-text group"
          onClick={() => { onClear(); setTimeout(() => inputRef.current?.focus(), 10); }}
          tabIndex={0}
          role="textbox"
          aria-label={`Selected ${entityLabel}: ${selectedName}. Press Enter to continue, Backspace to clear.`}
          aria-required={required || undefined}
          data-field-value={selectedName || selectedId || ""}
          {...(enterNavInclude ? { "data-enter-nav-include": "true" } : {})}
          onKeyDown={(e) => {
            if ((e.key === "n" || e.key === "N") && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onCreateNew({});
            } else if ((e.key === "e" || e.key === "E") && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              const sel = parties?.find(p => p.id === selectedId);
              if (sel && onEditSelected) onEditSelected(sel);
            } else if (e.key === "Backspace" || e.key === "Delete") {
              e.preventDefault();
              clearSelection();
            }
          }}
        >
          <span className="truncate flex-1">{selectedName}</span>
          {onEditSelected && (
            <Pencil
              className="h-3.5 w-3.5 mr-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-pointer shrink-0 hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                const sel = parties?.find(p => p.id === selectedId);
                if (sel) onEditSelected(sel);
              }}
              aria-label={`Edit ${entityLabel}`}
            />
          )}
          <X
            className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-pointer shrink-0"
            onClick={(e) => { e.stopPropagation(); clearSelection(); }}
          />
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="h-8 pl-8 pr-3 text-sm"
            autoComplete="off"
            spellCheck={false}
            required={required}
            aria-required={required || undefined}
            data-field-value={query || ""}
            {...(enterNavInclude ? { "data-enter-nav-include": "true" } : {})}
          />
        </div>
      )}

      {open && (results.length > 0 || showCreateRow) && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full min-w-[280px] max-h-[280px] overflow-y-auto rounded-md border bg-popover shadow-lg"
        >
          {results.map((p, idx) => (
            <div
              key={p.id}
              className={`flex items-start justify-between px-3 py-2 text-sm cursor-pointer transition-colors ${
                idx === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
              }`}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
              onMouseEnter={() => setHighlight(idx)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {selectedId === p.id && <Check className="h-3 w-3 shrink-0 text-primary" />}
                  <span className="truncate font-medium">{p.name}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {p.phone && (<span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{p.phone}</span>)}
                  {p.gst_number && <span>{p.gst_number}</span>}
                </div>
              </div>
            </div>
          ))}
          {showCreateRow && (
            <div
              className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer border-t ${
                highlight === results.length ? "bg-primary/15 text-primary" : "hover:bg-accent/50 text-primary"
              }`}
              onMouseDown={(e) => { e.preventDefault(); triggerCreate(); }}
              onMouseEnter={() => setHighlight(results.length)}
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span className="font-medium">
                Create new {entityLabel} "<span className="font-semibold">{query.trim()}</span>"
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+N</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
