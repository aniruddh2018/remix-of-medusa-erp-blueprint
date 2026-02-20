import { useEffect, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Loader2, Zap, Keyboard } from "lucide-react";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { CounterSaleDialog } from "@/components/dialogs/CounterSaleDialog";
import { CommandPalette } from "@/components/CommandPalette";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [counterSaleOpen, setCounterSaleOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Alt+A — Quick Counter Sale
  useKeyboardShortcut({ key: "a", modifiers: ["alt"], callback: () => setCounterSaleOpen(true), enabled: !!user });

  // Ctrl+K — Command Palette
  useKeyboardShortcut({ key: "k", modifiers: ["ctrl"], callback: () => setCommandPaletteOpen(true), enabled: !!user });

  // Alt+1-6 — Page shortcuts
  useKeyboardShortcut({ key: "1", modifiers: ["alt"], callback: () => navigate("/"), enabled: !!user });
  useKeyboardShortcut({ key: "2", modifiers: ["alt"], callback: () => navigate("/sales"), enabled: !!user });
  useKeyboardShortcut({ key: "3", modifiers: ["alt"], callback: () => navigate("/purchase-orders"), enabled: !!user });
  useKeyboardShortcut({ key: "4", modifiers: ["alt"], callback: () => navigate("/inventory"), enabled: !!user });
  useKeyboardShortcut({ key: "5", modifiers: ["alt"], callback: () => navigate("/products"), enabled: !!user });
  useKeyboardShortcut({ key: "6", modifiers: ["alt"], callback: () => navigate("/suppliers"), enabled: !!user });

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading) {
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
                    onClick={() => setCounterSaleOpen(true)}
                    className="gap-1 sm:gap-2 bg-primary hover:bg-primary/90 shadow-md h-9 px-3 sm:px-4"
                    size="sm"
                  >
                    <Zap className="h-4 w-4" />
                    <span className="hidden xs:inline sm:inline">Quick Sale</span>
                    <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0 hidden lg:inline-flex">
                      Alt+A
                    </Badge>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Quick Counter Sale <kbd className="ml-2 px-1.5 py-0.5 bg-muted rounded text-xs">Alt+A</kbd></p>
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
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                      Ctrl+K
                    </kbd>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open command palette</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="flex-1" />

            {/* Keyboard shortcuts cheatsheet */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hidden sm:flex">
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="text-xs space-y-1.5 py-1">
                    <p className="font-semibold text-foreground mb-2">Keyboard Shortcuts</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Ctrl+K</kbd> Command palette</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Alt+A</kbd> Quick Counter Sale</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Alt+1</kbd> Dashboard</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Alt+2</kbd> Sales & Billing</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Alt+3</kbd> Purchase Orders</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Alt+4</kbd> Inventory</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Alt+5</kbd> Products</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Alt+6</kbd> Suppliers</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">/</kbd> Focus search (on any list page)</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Esc</kbd> Close dialogs</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Enter</kbd> Submit / Add item</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </header>

          <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30 safe-bottom">
            <div className="max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </div>

      <CounterSaleDialog open={counterSaleOpen} onOpenChange={setCounterSaleOpen} />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onQuickSale={() => setCounterSaleOpen(true)}
      />
    </SidebarProvider>
  );
}
