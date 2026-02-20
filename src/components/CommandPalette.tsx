import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard,
  Package,
  Boxes,
  AlertTriangle,
  ShoppingCart,
  FileText,
  Pill,
  Users,
  Settings,
  Shield,
  BarChart3,
  Zap,
  Search,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
  group: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQuickSale: () => void;
}

export function CommandPalette({ open, onOpenChange, onQuickSale }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const allCommands: CommandItem[] = [
    {
      id: "quick-sale",
      label: "Quick Counter Sale",
      description: "Open counter sale dialog instantly",
      icon: Zap,
      shortcut: "Alt+A",
      group: "Actions",
      action: () => { onOpenChange(false); onQuickSale(); },
    },
    {
      id: "dashboard",
      label: "Dashboard",
      description: "Overview and key metrics",
      icon: LayoutDashboard,
      shortcut: "Alt+1",
      group: "Navigate",
      action: () => { navigate("/"); onOpenChange(false); },
    },
    {
      id: "sales",
      label: "Sales & Billing",
      description: "Create invoices and manage sales",
      icon: FileText,
      shortcut: "Alt+2",
      group: "Navigate",
      action: () => { navigate("/sales"); onOpenChange(false); },
    },
    {
      id: "purchase-orders",
      label: "Purchase Orders",
      description: "Manage supplier orders and challans",
      icon: ShoppingCart,
      shortcut: "Alt+3",
      group: "Navigate",
      action: () => { navigate("/purchase-orders"); onOpenChange(false); },
    },
    {
      id: "inventory",
      label: "Inventory",
      description: "View and manage stock batches",
      icon: Boxes,
      shortcut: "Alt+4",
      group: "Navigate",
      action: () => { navigate("/inventory"); onOpenChange(false); },
    },
    {
      id: "products",
      label: "Products",
      description: "Manage product catalog",
      icon: Package,
      shortcut: "Alt+5",
      group: "Navigate",
      action: () => { navigate("/products"); onOpenChange(false); },
    },
    {
      id: "suppliers",
      label: "Suppliers",
      description: "Manage suppliers",
      icon: Users,
      shortcut: "Alt+6",
      group: "Navigate",
      action: () => { navigate("/suppliers"); onOpenChange(false); },
    },
    {
      id: "customers",
      label: "Customers",
      description: "Manage customer records",
      icon: Users,
      group: "Navigate",
      action: () => { navigate("/customers"); onOpenChange(false); },
    },
    {
      id: "expiry",
      label: "Expiry Tracking",
      description: "Monitor batch expiry dates",
      icon: AlertTriangle,
      group: "Navigate",
      action: () => { navigate("/expiry"); onOpenChange(false); },
    },
    {
      id: "scheduled-drugs",
      label: "Scheduled Drugs Register",
      description: "H/H1/X drug compliance register",
      icon: Pill,
      group: "Navigate",
      action: () => { navigate("/scheduled-drugs"); onOpenChange(false); },
    },
    {
      id: "reports",
      label: "Reports",
      description: "Sales and purchase analytics",
      icon: BarChart3,
      group: "Navigate",
      action: () => { navigate("/reports"); onOpenChange(false); },
    },
    {
      id: "settings",
      label: "Settings",
      description: "Application settings",
      icon: Settings,
      group: "Navigate",
      action: () => { navigate("/settings"); onOpenChange(false); },
    },
    {
      id: "admin",
      label: "User Management",
      description: "Manage users and roles",
      icon: Shield,
      group: "Navigate",
      action: () => { navigate("/admin"); onOpenChange(false); },
    },
  ];

  const filtered = query.trim()
    ? allCommands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(query.toLowerCase()) ||
          cmd.description?.toLowerCase().includes(query.toLowerCase())
      )
    : allCommands;

  // Group the filtered commands
  const groups = filtered.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
    if (!acc[cmd.group]) acc[cmd.group] = [];
    acc[cmd.group].push(cmd);
    return acc;
  }, {});

  // Flat list for keyboard navigation
  const flatFiltered = filtered;

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        flatFiltered[activeIndex]?.action();
      }
    },
    [flatFiltered, activeIndex]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden border shadow-2xl" aria-describedby={undefined}>
        {/* Search bar */}
        <div className="flex items-center border-b px-3 gap-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or navigate..."
            className="border-0 shadow-none focus-visible:ring-0 h-12 text-base px-1"
          />
          <kbd className="hidden sm:inline-flex shrink-0 h-5 items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {flatFiltered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No commands found for "{query}"
            </div>
          ) : (
            Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/30">
                  {group}
                </div>
                {items.map((cmd) => {
                  const globalIndex = flatFiltered.indexOf(cmd);
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
                          <div
                            className={cn(
                              "text-xs truncate",
                              globalIndex === activeIndex
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground"
                            )}
                          >
                            {cmd.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {cmd.shortcut && (
                          <kbd
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-medium border",
                              globalIndex === activeIndex
                                ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground"
                                : "border-border bg-muted text-muted-foreground"
                            )}
                          >
                            {cmd.shortcut}
                          </kbd>
                        )}
                        <ArrowRight
                          className={cn(
                            "h-3 w-3",
                            globalIndex === activeIndex
                              ? "text-primary-foreground/50"
                              : "text-muted-foreground/50"
                          )}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t px-3 py-2 flex items-center gap-4 text-[10px] text-muted-foreground bg-muted/20">
          <span><kbd className="px-1 py-0.5 bg-muted rounded border">↑↓</kbd> Navigate</span>
          <span><kbd className="px-1 py-0.5 bg-muted rounded border">Enter</kbd> Open</span>
          <span><kbd className="px-1 py-0.5 bg-muted rounded border">Esc</kbd> Close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
