import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { 
  Package, 
  AlertTriangle, 
  ShoppingCart, 
  TrendingUp,
  ArrowUpRight,
  Clock,
  Pill,
  DollarSign,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, addDays, isBefore } from "date-fns";

interface DashboardStats {
  totalProducts: number;
  lowStockItems: number;
  expiringItems: number;
  scheduledDrugs: number;
  todaySales: number;
  pendingOrders: number;
  totalCustomers: number;
}

interface ExpiringBatch {
  id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  product: {
    name: string;
  };
}

interface LowStockProduct {
  id: string;
  name: string;
  current_stock: number;
  reorder_level: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { config } = useBusiness();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    lowStockItems: 0,
    expiringItems: 0,
    scheduledDrugs: 0,
    todaySales: 0,
    pendingOrders: 0,
    totalCustomers: 0,
  });
  const [expiringBatches, setExpiringBatches] = useState<ExpiringBatch[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const { companyId } = useBusiness();

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!companyId) {
        setLoading(false);
        return;
      }
      try {
        // Fetch total products
        let productsQuery = supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true)
          .eq("company_id", companyId);
        const { count: productsCount } = await productsQuery;

        // Fetch scheduled drugs count (only for pharmacy)
        let scheduledCount = 0;
        if (config.hasDrugSchedule) {
          const { count } = await supabase
            .from("products")
            .select("*", { count: "exact", head: true })
            .neq("drug_schedule", "none")
            .eq("is_active", true)
            .eq("company_id", companyId);
          scheduledCount = count || 0;
        }

        // Fetch expiring batches (only for businesses with expiry tracking)
        let expiringCount = 0;
        let expiring: ExpiringBatch[] = [];
        if (config.hasExpiryTracking) {
          const ninetyDaysFromNow = addDays(new Date(), 90).toISOString().split("T")[0];
          const { data, count } = await supabase
            .from("inventory_batches")
            .select("id, batch_number, expiry_date, quantity, product:products(name)", { count: "exact" })
            .eq("company_id", companyId)
            .lte("expiry_date", ninetyDaysFromNow)
            .gt("quantity", 0)
            .order("expiry_date", { ascending: true })
            .limit(5);
          expiringCount = count || 0;
          expiring = (data as ExpiringBatch[]) || [];
        }

        // Fetch low stock products
        const { data: products } = await supabase
          .from("products")
          .select("id, name, reorder_level")
          .eq("is_active", true)
          .eq("company_id", companyId);

        let lowStockList: LowStockProduct[] = [];
        if (products) {
          for (const product of products) {
            const { data: batches } = await supabase
              .from("inventory_batches")
              .select("quantity")
              .eq("product_id", product.id)
              .eq("company_id", companyId);
            
            const totalStock = batches?.reduce((sum, b) => sum + (b.quantity || 0), 0) || 0;
            
            if (totalStock < product.reorder_level) {
              lowStockList.push({
                id: product.id,
                name: product.name,
                current_stock: totalStock,
                reorder_level: product.reorder_level,
              });
            }
          }
        }

        // Fetch pending orders
        const { count: pendingCount } = await supabase
          .from("purchase_orders")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")
          .eq("company_id", companyId);

        // Fetch today's sales
        const today = new Date().toISOString().split("T")[0];
        const { data: todaySalesData } = await supabase
          .from("sales_orders")
          .select("total_amount")
          .eq("sale_date", today)
          .eq("company_id", companyId);

        const todayTotal = todaySalesData?.reduce((sum, s) => sum + Number(s.total_amount), 0) || 0;

        // Fetch total customers
        const { count: customersCount } = await supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("company_id", companyId);

        setStats({
          totalProducts: productsCount || 0,
          lowStockItems: lowStockList.length,
          expiringItems: expiringCount,
          scheduledDrugs: scheduledCount,
          todaySales: todayTotal,
          pendingOrders: pendingCount || 0,
          totalCustomers: customersCount || 0,
        });

        setExpiringBatches(expiring);
        setLowStockProducts(lowStockList.slice(0, 5));
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [config, companyId]);

  // Build stat cards dynamically based on business config
  const statCards = [
    {
      title: `Total ${config.terms.products}`,
      value: stats.totalProducts,
      icon: Package,
      color: "text-primary",
      bgColor: "bg-primary/10",
      href: "/products",
    },
    {
      title: "Low Stock Items",
      value: stats.lowStockItems,
      icon: TrendingUp,
      color: "text-warning",
      bgColor: "bg-warning/10",
      href: "/inventory",
      alert: stats.lowStockItems > 0,
    },
    ...(config.hasExpiryTracking ? [{
      title: "Expiring Soon",
      value: stats.expiringItems,
      icon: AlertTriangle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      href: "/expiry",
      alert: stats.expiringItems > 0,
    }] : []),
    ...(config.hasDrugSchedule ? [{
      title: "Scheduled Drugs",
      value: stats.scheduledDrugs,
      icon: Pill,
      color: "text-chart-5",
      bgColor: "bg-chart-5/10",
      href: "/scheduled-drugs",
    }] : []),
    {
      title: "Today's Sales",
      value: `₹${stats.todaySales.toLocaleString()}`,
      icon: DollarSign,
      color: "text-success",
      bgColor: "bg-success/10",
      href: "/sales",
    },
    {
      title: "Pending Orders",
      value: stats.pendingOrders,
      icon: ShoppingCart,
      color: "text-info",
      bgColor: "bg-info/10",
      href: "/purchase-orders",
    },
    ...(config.requiresCustomerGST ? [{
      title: "Total Customers",
      value: stats.totalCustomers,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
      href: "/customers",
    }] : []),
  ];

  const getExpiryBadge = (expiryDate: string) => {
    const expiry = new Date(expiryDate);
    const today = new Date();
    const thirtyDays = addDays(today, 30);
    
    if (isBefore(expiry, today)) {
      return <Badge variant="destructive">Expired</Badge>;
    } else if (isBefore(expiry, thirtyDays)) {
      return <Badge className="bg-warning text-warning-foreground">Critical</Badge>;
    } else {
      return <Badge variant="secondary">Soon</Badge>;
    }
  };

  if (!companyId && !loading) {
    return (
      <div className="page-container">
        <PageHeader title="Dashboard" description="Welcome back!" />
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No company assigned. Please contact your administrator to assign you to a company.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader 
        title="Dashboard" 
        description={`Welcome back! Here's your ${config.label} overview.`}
      />

      {/* Stats Grid - Responsive */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
        {statCards.map((stat) => (
          <Card 
            key={stat.title} 
            className="stat-card cursor-pointer group"
            onClick={() => navigate(stat.href)}
          >
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{stat.title}</p>
                  <p className="text-lg sm:text-2xl font-bold mt-1 truncate">{stat.value}</p>
                </div>
                <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl ${stat.bgColor} shrink-0 ml-2`}>
                  <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1 mt-4 text-sm text-muted-foreground group-hover:text-primary transition-colors">
                <span>View details</span>
                <ArrowUpRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerts Section */}
      <div className={`grid gap-6 ${config.hasExpiryTracking ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
        {/* Expiring Soon - only for businesses with expiry tracking */}
        {config.hasExpiryTracking && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-destructive" />
                Expiring Soon
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/expiry")}>
                View All
              </Button>
            </CardHeader>
            <CardContent>
              {expiringBatches.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No items expiring soon
                </p>
              ) : (
                <div className="space-y-3">
                  {expiringBatches.map((batch) => (
                    <div 
                      key={batch.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div>
                        <p className="font-medium">{(batch.product as any)?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Batch: {batch.batch_number} • Qty: {batch.quantity}
                        </p>
                      </div>
                      <div className="text-right">
                        {getExpiryBadge(batch.expiry_date)}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(batch.expiry_date), "MMM dd, yyyy")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Low Stock Alert */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-warning" />
              Low Stock Alert
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/inventory")}>
              View All
            </Button>
          </CardHeader>
          <CardContent>
            {lowStockProducts.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                All items are well stocked
              </p>
            ) : (
              <div className="space-y-3">
                {lowStockProducts.map((product) => (
                  <div 
                    key={product.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Reorder at: {product.reorder_level}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge 
                        className={
                          product.current_stock === 0 
                            ? "bg-destructive" 
                            : "bg-warning text-warning-foreground"
                        }
                      >
                        {product.current_stock === 0 ? "Out of Stock" : "Low Stock"}
                      </Badge>
                      <p className="text-sm font-medium mt-1">
                        {product.current_stock} units
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
