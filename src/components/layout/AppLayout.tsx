import { useEffect, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Loader2, Zap, Keyboard } from "lucide-react";
import { usePlatformShortcut } from "@/hooks/usePlatformShortcut";
import { useShortcut } from "@/hooks/useShortcut";
import { SHORTCUTS, formatShortcut } from "@/lib/platform";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { SkipToContent } from "@/components/ui/skip-to-content";
import { Badge } from "@/components/ui/badge";
import { useFocus } from "@/contexts/FocusContext";
import { useOverdueLoginToast } from "@/hooks/useOverdueLoginToast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AppLayout() {
  const { user, loading } = useAuth();
  const { config, needsOnboarding, isLoading: bizLoading } = useBusiness();
  const navigate = useNavigate();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);

  // Intelligent focus recovery (flow-aware)
  const { recoverFocus } = useFocus();

  // One-time per-session overdue invoices toast
  useOverdueLoginToast();

  // Platform-aware shortcuts
  usePlatformShortcut({ shortcut: SHORTCUTS.QUICK_SALE, callback: () => navigate("/counter-sales"), enabled: !!user });
  usePlatformShortcut({ shortcut: SHORTCUTS.COMMAND_PALETTE, callback: () => setCommandPaletteOpen(true), enabled: !!user });
  usePlatformShortcut({ shortcut: SHORTCUTS.NAV_DASHBOARD, callback: () => navigate("/dashboard"), enabled: !!user });
  usePlatformShortcut({ shortcut: SHORTCUTS.NAV_SALES, callback: () => navigate("/sales"), enabled: !!user });
  usePlatformShortcut({ shortcut: SHORTCUTS.NAV_PURCHASE, callback: () => navigate("/purchase-orders"), enabled: !!user });
  usePlatformShortcut({ shortcut: SHORTCUTS.NAV_INVENTORY, callback: () => navigate("/inventory"), enabled: !!user });
  usePlatformShortcut({ shortcut: SHORTCUTS.NAV_PRODUCTS, callback: () => navigate("/products"), enabled: !!user });
  usePlatformShortcut({ shortcut: SHORTCUTS.NAV_SUPPLIERS, callback: () => navigate("/suppliers"), enabled: !!user });

  // Intelligent focus recovery — backtick (`) restores last meaningful field or entry point
  usePlatformShortcut({
    shortcut: SHORTCUTS.RESTORE_FOCUS,
    callback: () => recoverFocus(),
    enabled: !!user,
    allowInInput: true,
  });

  // Shift+? opens the full keyboard shortcut reference (via central manager).
  useShortcut({
    id: "help",
    callback: () => setShortcutsDialogOpen(true),
    enabled: !!user,
    inputBehavior: "never",
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!loading && !bizLoading && user && needsOnboarding) {
      navigate("/onboarding", { replace: true });
    }
  }, [loading, bizLoading, user, needsOnboarding, navigate]);

  if (loading || bizLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <SidebarProvider>
      <SkipToContent targetId="main-content" />
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col">
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-3 sm:px-6 safe-top">
            <SidebarTrigger className="-ml-1 sm:-ml-2 hover:bg-muted rounded-lg touch-target" />
            <Separator orientation="vertical" className="h-4 mx-1 sm:mx-2 hidden sm:block" />

            {/* Quick Sale button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => navigate("/counter-sales")}
                    className="gap-1 sm:gap-2 bg-primary hover:bg-primary/90 shadow-md h-9 px-3 sm:px-4"
                    size="sm"
                  >
                    <Zap className="h-4 w-4" />
                    <span className="hidden xs:inline sm:inline">{config.terms.counterSale}</span>
                    <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0 hidden lg:inline-flex">
                      {formatShortcut(SHORTCUTS.QUICK_SALE.label)}
                    </Badge>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Quick Counter Sale <ShortcutHint shortcut={SHORTCUTS.QUICK_SALE} className="ml-2" /></p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Command Palette button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCommandPaletteOpen(true)}
                    className="hidden sm:flex items-center gap-2 text-muted-foreground h-9 px-3"
                  >
                    <span className="text-sm">Search commands...</span>
                    <ShortcutHint shortcut={SHORTCUTS.COMMAND_PALETTE} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open command palette</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="flex-1" />

            {/* Keyboard shortcuts — click for full searchable dialog, hover for quick hints */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShortcutsDialogOpen(true)}
                    aria-label="Open keyboard shortcuts"
                    className="text-muted-foreground hover:text-foreground hidden sm:flex"
                  >
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="text-xs space-y-1.5 py-1">
                    <p className="font-semibold text-foreground mb-1">
                      Keyboard Shortcuts
                    </p>
                    <p className="text-[10px] text-muted-foreground mb-2">
                      Press <kbd className="px-1 py-0.5 bg-muted rounded border">?</kbd>{" "}
                      for the full list
                    </p>
                    <p className="text-muted-foreground font-medium text-[10px] uppercase tracking-wider mt-1">Global</p>
                    <p><ShortcutHint shortcut={SHORTCUTS.COMMAND_PALETTE} /> Command palette</p>
                    <p><ShortcutHint shortcut={SHORTCUTS.QUICK_SALE} /> Quick Counter Sale</p>
                    <p><ShortcutHint shortcut="SECONDARY+1–6" variant="badge" /> Navigate pages</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">/</kbd> Focus search bar</p>
                    <p><ShortcutHint shortcut={SHORTCUTS.FOCUS_CART} /> Jump to cart (1st row)</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">N</kbd> New sale / purchase</p>
                    <p className="text-muted-foreground font-medium text-[10px] uppercase tracking-wider mt-2">In any table</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">↑ ↓</kbd> Navigate rows</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">P</kbd> Print bill</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">E</kbd> Edit bill</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">R</kbd> Receive order</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">D</kbd> Delete invoice</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">$</kbd> Open payment</p>
                    <p className="text-muted-foreground font-medium text-[10px] uppercase tracking-wider mt-2">In Quick Sale / Counter</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Enter</kbd> Add / Complete sale</p>
                    <p><ShortcutHint shortcut={SHORTCUTS.CONFIRM} /> Force complete sale</p>
                    <p><ShortcutHint shortcut={SHORTCUTS.CYCLE_PAYMENT} /> Cycle payment method</p>
                    <p><ShortcutHint shortcut={SHORTCUTS.CHANGE_PAYMENT_TYPE} /> Change payment type</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Del</kbd> Remove cart row</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Esc</kbd> Close dialogs</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30 safe-bottom focus:outline-none"
          >
            <div className="max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onQuickSale={() => navigate("/counter-sales")}
      />

      <KeyboardShortcutsDialog
        open={shortcutsDialogOpen}
        onOpenChange={setShortcutsDialogOpen}
      />
    </SidebarProvider>
  );
}
