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

  // Alt+A keyboard shortcut for counter sale
  useKeyboardShortcut({
    key: "a",
    modifiers: ["alt"],
    callback: () => setCounterSaleOpen(true),
    enabled: !!user,
  });

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

  if (!user) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col">
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
            <SidebarTrigger className="-ml-2 hover:bg-muted rounded-lg" />
            <Separator orientation="vertical" className="h-4 mx-2" />
            
            {/* Quick Actions */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={() => setCounterSaleOpen(true)}
                    className="gap-2 bg-primary hover:bg-primary/90 shadow-md"
                    size="sm"
                  >
                    <Zap className="h-4 w-4" />
                    <span className="hidden sm:inline">Quick Sale</span>
                    <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0 hidden md:inline-flex">
                      Alt+A
                    </Badge>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Quick Counter Sale <kbd className="ml-2 px-1.5 py-0.5 bg-muted rounded text-xs">Alt+A</kbd></p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="flex-1" />

            {/* Keyboard shortcuts hint */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="text-xs space-y-1">
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded">Alt+A</kbd> Quick Counter Sale</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded">Enter</kbd> Add item in dialogs</p>
                    <p><kbd className="px-1.5 py-0.5 bg-muted rounded">Esc</kbd> Close dialogs</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </header>
          <main className="flex-1 overflow-auto p-6 bg-muted/30">
            <div className="max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </div>
      
      {/* Counter Sale Dialog - accessible via Alt+A */}
      <CounterSaleDialog open={counterSaleOpen} onOpenChange={setCounterSaleOpen} />
    </SidebarProvider>
  );
}
