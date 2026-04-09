import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard, Package, Boxes, AlertTriangle, ShoppingCart,
  FileText, Pill, Users, Settings, Shield, BarChart3, Zap,
  Search, ArrowRight, BookOpen, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortcut, SHORTCUTS, type ShortcutDef } from "@/lib/platform";
import { ShortcutHint } from "@/components/ui/shortcut-hint";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  shortcut?: ShortcutDef;
  /** Raw shortcut display override */
  shortcutLabel?: string;
  action: () => void;
  group: string;
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuickSale: () => void;
}

/** Simple fuzzy match: all characters in query appear in order in target */
function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function CommandPalette({ open, onOpenChange, onQuickSale }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const allCommands: CommandItem[] = useMemo(() => [
    {
      id: "quick-sale", label: "Quick Counter Sale",
      description: "Open counter sale dialog instantly",
      icon: Zap, shortcut: SHORTCUTS.QUICK_SALE,
      group: "Actions",
      keywords: ["counter", "billing", "fast"],
      action: () => { onOpenChange(false); onQuickSale(); },
    },
    {
      id: "dashboard", label: "Dashboard",
      description: "Overview and key metrics",
      icon: LayoutDashboard, shortcut: SHORTCUTS.NAV_DASHBOARD,
      group: "Navigate",
      action: () => { navigate("/"); onOpenChange(false); },
    },
    {
      id: "sales", label: "Sales & Billing",
      description: "Create invoices and manage sales",
      icon: FileText, shortcut: SHORTCUTS.NAV_SALES,
      group: "Navigate",
      keywords: ["invoice", "bill"],
      action: () => { navigate("/sales"); onOpenChange(false); },
    },
    {
      id: "purchase-orders", label: "Purchase Orders",
      description: "Manage supplier orders and challans",
      icon: ShoppingCart, shortcut: SHORTCUTS.NAV_PURCHASE,
      group: "Navigate",
      keywords: ["challan", "order", "buy"],
      action: () => { navigate("/purchase-orders"); onOpenChange(false); },
    },
    {
      id: "inventory", label: "Inventory",
      description: "View and manage stock batches",
      icon: Boxes, shortcut: SHORTCUTS.NAV_INVENTORY,
      group: "Navigate",
      keywords: ["stock", "batch"],
      action: () => { navigate("/inventory"); onOpenChange(false); },
    },
    {
      id: "products", label: "Products",
      description: "Manage product catalog",
      icon: Package, shortcut: SHORTCUTS.NAV_PRODUCTS,
      group: "Navigate",
      keywords: ["medicine", "drug", "item"],
      action: () => { navigate("/products"); onOpenChange(false); },
    },
    {
      id: "suppliers", label: "Suppliers",
      description: "Manage suppliers",
      icon: Users, shortcut: SHORTCUTS.NAV_SUPPLIERS,
      group: "Navigate",
      keywords: ["vendor", "distributor"],
      action: () => { navigate("/suppliers"); onOpenChange(false); },
    },
    {
      id: "customers", label: "Customers",
      description: "Manage customer records",
      icon: Users, group: "Navigate",
      keywords: ["patient", "client"],
      action: () => { navigate("/customers"); onOpenChange(false); },
    },
    {
      id: "accounts", label: "Accounts & Ledger",
      description: "View account balances and ledger",
      icon: Wallet, group: "Navigate",
      keywords: ["ledger", "payment", "outstanding"],
      action: () => { navigate("/accounts"); onOpenChange(false); },
    },
    {
      id: "expiry", label: "Expiry Tracking",
      description: "Monitor batch expiry dates",
      icon: AlertTriangle, group: "Navigate",
      action: () => { navigate("/expiry"); onOpenChange(false); },
    },
    {
      id: "scheduled-drugs", label: "Scheduled Drugs Register",
      description: "H/H1/X drug compliance register",
      icon: Pill, group: "Navigate",
      keywords: ["narcotic", "controlled"],
      action: () => { navigate("/scheduled-drugs"); onOpenChange(false); },
    },
    {
      id: "reports", label: "Reports",
      description: "Sales and purchase analytics",
      icon: BarChart3, group: "Navigate",
      keywords: ["analytics", "gst", "profit"],
      action: () => { navigate("/reports"); onOpenChange(false); },
    },
    {
      id: "notes", label: "Credit & Debit Notes",
      description: "Manage returns and adjustments",
      icon: BookOpen, group: "Navigate",
      keywords: ["return", "credit", "debit"],
      action: () => { navigate("/notes"); onOpenChange(false); },
    },
    {
      id: "settings", label: "Settings",
      description: "Application settings",
      icon: Settings, group: "Navigate",
      action: () => { navigate("/settings"); onOpenChange(false); },
    },
    {
      id: "admin", label: "User Management",
      description: "Manage users and roles",
      icon: Shield, group: "Navigate",
      action: () => { navigate("/admin"); onOpenChange(false); },
    },
  ], [navigate, onOpenChange, onQuickSale]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return allCommands;
    return allCommands.filter((cmd) =>
      fuzzyMatch(q, cmd.label) ||
      (cmd.description && fuzzyMatch(q, cmd.description)) ||
      cmd.keywords?.some((kw) => fuzzyMatch(q, kw))
    );
  }, [query, allCommands]);

  const groups = useMemo(() => {
    return filtered.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
      if (!acc[cmd.group]) acc[cmd.group] = [];
      acc[cmd.group].push(cmd);
      return acc;
    }, {});
  }, [filtered]);

  useEffect(() => { setActiveIndex(0); }, [query]);
  useEffect(() => { if (!open) { setQuery(""); setActiveIndex(0); } }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        filtered[activeIndex]?.action();
      }
    },
    [filtered, activeIndex]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden border shadow-2xl" aria-describedby={undefined}>
        <div className="flex items-center border-b px-3 gap-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="border-0 shadow-none focus-visible:ring-0 h-12 text-base px-1"
          />
          <kbd className="hidden sm:inline-flex shrink-0 h-5 items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No commands found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/30">
                  {group}
                </div>
                {items.map((cmd) => {
                  const globalIndex = filtered.indexOf(cmd);
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors",
                        globalIndex === activeIndex
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                      onClick={cmd.action}
                      onMouseEnter={() => setActiveIndex(globalIndex)}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{cmd.label}</div>
                        {cmd.description && (
                          <div className={cn(
                            "text-xs truncate",
                            globalIndex === activeIndex ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {cmd.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {cmd.shortcut && (
                          <kbd className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium border",
                            globalIndex === activeIndex
                              ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground"
                              : "border-border bg-muted text-muted-foreground"
                          )}>
                            {formatShortcut(cmd.shortcut.label)}
                          </kbd>
                        )}
                        <ArrowRight className={cn(
                          "h-3 w-3",
                          globalIndex === activeIndex ? "text-primary-foreground/50" : "text-muted-foreground/50"
                        )} />
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-t px-3 py-2 flex items-center gap-4 text-[10px] text-muted-foreground bg-muted/20">
          <span><kbd className="px-1 py-0.5 bg-muted rounded border">↑↓</kbd> Navigate</span>
          <span><kbd className="px-1 py-0.5 bg-muted rounded border">Enter</kbd> Open</span>
          <span><kbd className="px-1 py-0.5 bg-muted rounded border">Esc</kbd> Close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
