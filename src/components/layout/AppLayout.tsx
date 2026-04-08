import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Loader2, Zap, Keyboard } from "lucide-react";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { CounterSaleDialog } from "@/components/dialogs/CounterSaleDialog";
import { CommandPalette } from "@/components/CommandPalette";
import { Calculator } from "@/components/Calculator";
import { Badge } from "@/components/ui/badge";
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
  const [counterSaleOpen, setCounterSaleOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const lastFocusedInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Track last focused input/textarea for calculator value transfer
  useEffect(() => {
    const handler = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        lastFocusedInputRef.current = el as HTMLInputElement | HTMLTextAreaElement;
      }
    };
    document.addEventListener("focusin", handler);
    return () => document.removeEventListener("focusin", handler);
  }, []);

  const handleCalcTransfer = useCallback((value: string) => {
    const el = lastFocusedInputRef.current;
    if (el && document.body.contains(el)) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeInputValueSetter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      setTimeout(() => el.focus(), 50);
    }
  }, []);

  // Alt+A — Quick Counter Sale
  useKeyboardShortcut({ key: "a", modifiers: ["alt"], callback: () => setCounterSaleOpen(true), enabled: !!user });

  // Ctrl+K — Command Palette
  useKeyboardShortcut({ key: "k", modifiers: ["ctrl"], callback: () => setCommandPaletteOpen(true), enabled: !!user });

  // Alt+1-6 — Page shortcuts
  useKeyboardShortcut({ key: "1", modifiers: ["alt"], callback: () => navigate("/dashboard"), enabled: !!user });
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
                    <span className="hidden xs:inline sm:inline">{config.terms.counterSale}</span>
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
                    <p className="text-muted-foreground font-medium text-[10px] uppercase tracking-wider mt-1">Global</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Ctrl+K</kbd> Command palette</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Alt+A</kbd> Quick Counter Sale</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Alt+1–6</kbd> Navigate pages</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">/</kbd> Focus search bar</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">N</kbd> New sale / purchase</p>
                    <p className="text-muted-foreground font-medium text-[10px] uppercase tracking-wider mt-2">In any table</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">↑ ↓</kbd> Navigate rows</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">P</kbd> Print bill (on focused row)</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">E</kbd> Edit bill (on focused row)</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">R</kbd> Receive order (purchase)</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">D</kbd> Delete invoice (admin)</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">$</kbd> Open payment dialog</p>
                    <p className="text-muted-foreground font-medium text-[10px] uppercase tracking-wider mt-2">In Quick Sale / Counter</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Enter</kbd> Add product / Complete sale</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Ctrl+Enter</kbd> Force complete sale</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Alt+C</kbd> Cycle payment method</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Del</kbd> Remove focused cart row</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px]">Esc</kbd> Close dialogs</p>
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
