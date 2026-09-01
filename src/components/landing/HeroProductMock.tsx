import {
  Package, TrendingUp, AlertTriangle, DollarSign, ShoppingCart,
  Clock, ArrowUpRight, LayoutDashboard, Boxes, FileText, Bot, Wallet,
} from "lucide-react";
import { ProductFrame } from "./ProductFrame";

const STATS = [
  { label: "Total Products", value: "1,284", icon: Package, tone: "text-primary", bg: "bg-primary/10" },
  { label: "Low Stock Items", value: "6", icon: TrendingUp, tone: "text-warning", bg: "bg-warning/10", alert: true },
  { label: "Expiring Soon", value: "3", icon: AlertTriangle, tone: "text-destructive", bg: "bg-destructive/10", alert: true },
  { label: "Today's Sales", value: "₹48,260", icon: DollarSign, tone: "text-success", bg: "bg-success/10" },
  { label: "Pending Orders", value: "4", icon: ShoppingCart, tone: "text-info", bg: "bg-info/10" },
];

const SIDEBAR_ITEMS = [
  { icon: LayoutDashboard, active: true },
  { icon: Bot },
  { icon: Boxes },
  { icon: FileText },
  { icon: Wallet },
];

/**
 * A recreation of the real Dashboard.tsx screen — same stat-card layout,
 * same "Expiring Soon" pattern, same colour tokens — used as the hero
 * visual so the first thing a visitor sees is the actual product
 * experience rather than an illustration standing in for it.
 */
export function HeroProductMock() {
  return (
    <ProductFrame label="MedikaRP — Dashboard">
      <div className="flex">
        {/* Sidebar sliver for context — not meant to be operable */}
        <div className="hidden sm:flex w-12 flex-col items-center gap-3 bg-sidebar py-4 shrink-0">
          {SIDEBAR_ITEMS.map((item, i) => (
            <div
              key={i}
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                item.active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/50"
              }`}
            >
              <item.icon className="h-4 w-4" />
            </div>
          ))}
        </div>

        <div className="flex-1 min-w-0 p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Dashboard</p>
            <p className="text-sm sm:text-base font-semibold text-foreground">Welcome back — here's your pharmacy overview.</p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {STATS.map((s) => (
              <div key={s.label} className="stat-card">
                <div className="p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-xs font-medium text-muted-foreground leading-tight">{s.label}</p>
                      <p className="text-base sm:text-xl font-bold mt-1">{s.value}</p>
                    </div>
                    <div className={`p-1.5 sm:p-2 rounded-lg ${s.bg} shrink-0`}>
                      <s.icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${s.tone}`} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Clock className="h-3.5 w-3.5 text-destructive" />
                Expiring Soon
              </div>
              <span className="flex items-center gap-1 text-xs text-primary font-medium">
                View all <ArrowUpRight className="h-3 w-3" />
              </span>
            </div>
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Amoxicillin 500mg</p>
                  <p className="text-xs text-muted-foreground">Batch B4521 · Qty 340</p>
                </div>
                <span className="rounded-full bg-warning text-warning-foreground text-[10px] font-semibold px-2 py-0.5 shrink-0">
                  12 days
                </span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Cefixime 200mg</p>
                  <p className="text-xs text-muted-foreground">Batch C1187 · Qty 120</p>
                </div>
                <span className="rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold px-2 py-0.5 shrink-0">
                  Expired
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProductFrame>
  );
}
