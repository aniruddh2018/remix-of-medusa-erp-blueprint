import { useEffect, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { CounterSaleDialog } from "@/components/dialogs/CounterSaleDialog";

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
            <div className="flex-1" />
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
