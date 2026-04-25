import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import {
  SHORTCUT_CATALOG,
  groupByCategory,
  type ShortcutCatalogEntry,
  type ShortcutCategory,
} from "@/lib/keyboard/shortcuts-registry";
import { Search, Keyboard } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Full searchable keyboard-shortcut reference.
 *
 * Triggered by `?` (Shift+/) globally via a shortcut registered in AppLayout.
 * The list is driven by SHORTCUT_CATALOG so adding a new shortcut makes it
 * discoverable automatically.
 */
export function KeyboardShortcutsDialog({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo<ShortcutCatalogEntry[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUT_CATALOG;
    return SHORTCUT_CATALOG.filter(
      (e) =>
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.shortcut.label.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q),
    );
  }, [query]);

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);

  // Stable display order.
  const categoryOrder: ShortcutCategory[] = [
    "Global",
    "Navigation",
    "Search",
    "Forms",
    "Tables",
    "Billing & Cart",
    "Dialogs",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Keyboard className="h-4 w-4" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-4 py-2 border-b">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shortcuts..."
            className="border-0 shadow-none focus-visible:ring-0 h-9"
          />
          <kbd className="hidden sm:inline-flex shrink-0 h-5 items-center rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="p-4 space-y-5">
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No shortcuts match &ldquo;{query}&rdquo;
              </p>
            ) : (
              categoryOrder
                .filter((c) => grouped[c]?.length)
                .map((category) => (
                  <section key={category}>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {category}
                    </h3>
                    <ul className="divide-y rounded-md border bg-card">
                      {grouped[category].map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-center justify-between px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-foreground">
                              {entry.description}
                            </div>
                            {entry.scopeLabel && (
                              <div className="text-[11px] text-muted-foreground">
                                {entry.scopeLabel}
                              </div>
                            )}
                          </div>
                          <ShortcutHint shortcut={entry.shortcut} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
            )}
          </div>
        </ScrollArea>

        <div className="border-t px-4 py-2 text-[11px] text-muted-foreground bg-muted/20 flex items-center justify-between">
          <span>
            Press <kbd className="px-1 py-0.5 bg-muted rounded border">?</kbd> anywhere to
            open this panel.
          </span>
          <span>{SHORTCUT_CATALOG.length} shortcuts</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
