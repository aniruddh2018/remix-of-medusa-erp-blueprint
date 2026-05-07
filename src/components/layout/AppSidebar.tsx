import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  Package,
  Boxes,
  AlertTriangle,
  ShoppingCart,
  FileText,
  Pill,
  LogOut,
  Users,
  Settings,
  Shield,
  BarChart3,
  History,
  RotateCcw,
  Wallet,
  Upload,
  ScanLine,
  Stethoscope,
  Zap,
  Bot,
} from "lucide-react";
import logo from "@/assets/logo.png";

interface MenuItem {
  title: string;
  icon: React.ElementType;
  path: string;
  shortcut?: string | null;
}

const allMainMenuItems: MenuItem[] = [
  { title: "Dashboard", icon: LayoutDashboard, path: "/dashboard", shortcut: "Alt+1" },
  { title: "Automation Chat", icon: Bot, path: "/chat", shortcut: null },
  { title: "Products", icon: Package, path: "/products", shortcut: "Alt+5" },
  { title: "Inventory", icon: Boxes, path: "/inventory", shortcut: "Alt+6" },
  { title: "Expiry Tracking", icon: AlertTriangle, path: "/expiry", shortcut: null },
];

const allOrderMenuItems: MenuItem[] = [
  { title: "Purchase Orders", icon: ShoppingCart, path: "/purchase-orders", shortcut: "Alt+4" },
  { title: "Sales Orders", icon: FileText, path: "/sales", shortcut: "Alt+2" },
  { title: "Counter Sales", icon: Zap, path: "/counter-sales", shortcut: "Alt+3" },
  { title: "Scan Invoice", icon: ScanLine, path: "/scan-invoice", shortcut: null },
];

const allComplianceMenuItems: MenuItem[] = [
  { title: "Scheduled Drugs", icon: Pill, path: "/scheduled-drugs", shortcut: null },
  { title: "Credit & Debit Notes", icon: RotateCcw, path: "/notes" },
  { title: "Accounts", icon: Wallet, path: "/accounts" },
];

const allManagementMenuItems: MenuItem[] = [
  { title: "Suppliers", icon: Users, path: "/suppliers", shortcut: "Alt+6" },
  { title: "Customers", icon: Users, path: "/customers", shortcut: null },
  { title: "Doctors", icon: Stethoscope, path: "/doctors", shortcut: null },
];

const allAdminMenuItems: MenuItem[] = [
  { title: "Reports", icon: BarChart3, path: "/reports" },
  { title: "Audit Logs", icon: History, path: "/audit-logs" },
  { title: "User Management", icon: Shield, path: "/admin" },
  { title: "Settings", icon: Settings, path: "/settings" },
];

const superAdminMenuItems: MenuItem[] = [
  { title: "Super Admin", icon: Shield, path: "/super-admin" },
  { title: "Data Import", icon: Upload, path: "/data-import" },
];

function filterItems(items: MenuItem[], visiblePages: string[]): MenuItem[] {
  return items.filter((item) => visiblePages.includes(item.path));
}

function MenuSection({ items, label }: { items: MenuItem[]; label: string }) {
  const location = useLocation();
  const navigate = useNavigate();

  if (items.length === 0) return null;

  return (
    <>
      <SidebarSeparator />
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location.pathname === item.path}
                  onClick={() => navigate(item.path)}
                  tooltip={item.shortcut ? `${item.title} (${item.shortcut})` : item.title}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1">{item.title}</span>
                  {item.shortcut && (
                    <span className="text-[10px] text-sidebar-foreground/40 hidden group-data-[collapsible=icon]:hidden">
                      {item.shortcut}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, isAdmin, isSuperAdmin } = useAuth();
  const { config } = useBusiness();

  const visiblePages = config.visiblePages;

  const mainItems = filterItems(allMainMenuItems, visiblePages);
  const orderItems = filterItems(allOrderMenuItems, visiblePages);
  const complianceItems = filterItems(allComplianceMenuItems, visiblePages);
  const managementItems = filterItems(allManagementMenuItems, visiblePages);
  const adminItems = filterItems(allAdminMenuItems, visiblePages);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      navigate("/", { replace: true });
    }
  };

  const getInitials = (email: string) => email.slice(0, 2).toUpperCase();

  return (
    <Sidebar className="border-r-0 gradient-sidebar">
      <SidebarHeader className="p-4 border-b border-sidebar-border/50">
        <div className="flex items-center gap-3">
          <img src={logo} alt={config.terms.appName} className="w-10 h-10 rounded-lg object-contain bg-white" />
          <div>
            <h1 className="font-bold text-sidebar-foreground text-base">{config.terms.appName}</h1>
            <p className="text-xs text-sidebar-foreground/50">{config.terms.tagline}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* Main — no separator before first group */}
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={location.pathname === item.path}
                    onClick={() => navigate(item.path)}
                    tooltip={item.shortcut ? `${item.title} (${item.shortcut})` : item.title}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{item.title}</span>
                    {item.shortcut && (
                      <span className="text-[10px] text-sidebar-foreground/40 hidden group-data-[collapsible=icon]:hidden">
                        {item.shortcut}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <MenuSection items={orderItems} label="Orders" />
        <MenuSection items={complianceItems} label="Compliance" />
        <MenuSection items={managementItems} label="Management" />

        {isAdmin && adminItems.length > 0 && (
          <MenuSection items={adminItems} label="Admin" />
        )}

        {isSuperAdmin && (
          <MenuSection items={superAdminMenuItems} label="Platform" />
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border/50 bg-sidebar-accent/30">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 ring-2 ring-sidebar-border/50">
            <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary text-primary-foreground text-sm font-medium">
              {user?.email ? getInitials(user.email) : "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.email}</p>
            <p className="text-xs text-sidebar-foreground/50">Logged in</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            className="shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
