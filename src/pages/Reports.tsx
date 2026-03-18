import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, IndianRupee, ShoppingCart, Package, Truck, AlertCircle, ShieldAlert, Boxes } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, isWithinInterval, parseISO } from "date-fns";

type DateRange = "7days" | "30days" | "thisMonth" | "allTime";

const Reports = () => {
  const { isAdmin, loading } = useAuth();
  const { companyId } = useBusiness();
  const navigate = useNavigate();

  // Redirect non-admin users
  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAdmin, loading, navigate]);

  const [dateRange, setDateRange] = useState<DateRange>("30days");

  // Calculate date boundaries
  const dateFilter = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case "7days":
        return { start: subDays(now, 7), end: now };
      case "30days":
        return { start: subDays(now, 30), end: now };
      case "thisMonth":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "allTime":
      default:
        return { start: new Date(2020, 0, 1), end: now };
    }
  }, [dateRange]);

  // Fetch sales orders
  const { data: salesOrders = [] } = useQuery({
    queryKey: ["sales-orders-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("company_id", companyId!)
        .order("sale_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch sales order items with product info
  const { data: salesItems = [] } = useQuery({
    queryKey: ["sales-items-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_order_items")
        .select(`
          *,
          product:products(name, purchase_price, sale_price),
          sales_order:sales_orders(sale_date)
        `)
        .eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch purchase orders
  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["purchase-orders-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`
          *,
          supplier:suppliers(name)
        `)
        .eq("company_id", companyId!)
        .order("order_date", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch products for margin analysis
  const { data: products = [] } = useQuery({
    queryKey: ["products-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch inventory batches for total value
  const { data: inventoryBatches = [] } = useQuery({
    queryKey: ["inventory-batches-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_batches")
        .select("quantity, purchase_price, mrp")
        .eq("company_id", companyId!)
        .gt("quantity", 0);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const inventoryValue = useMemo(() => {
    const atCost = inventoryBatches.reduce((sum, b) => sum + (b.quantity * Number(b.purchase_price)), 0);
    const atMRP = inventoryBatches.reduce((sum, b) => sum + (b.quantity * Number(b.mrp)), 0);
    const totalUnits = inventoryBatches.reduce((sum, b) => sum + b.quantity, 0);
    return { atCost, atMRP, totalUnits };
  }, [inventoryBatches]);

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("is_active", true)
        .eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Filter data by date range
  const filteredSalesOrders = useMemo(() => {
    return salesOrders.filter((order) => {
      const orderDate = parseISO(order.sale_date);
      return isWithinInterval(orderDate, { start: dateFilter.start, end: dateFilter.end });
    });
  }, [salesOrders, dateFilter]);

  const filteredPurchaseOrders = useMemo(() => {
    return purchaseOrders.filter((order) => {
      const orderDate = parseISO(order.order_date);
      return isWithinInterval(orderDate, { start: dateFilter.start, end: dateFilter.end });
    });
  }, [purchaseOrders, dateFilter]);

  // Calculate key metrics
  const metrics = useMemo(() => {
    const totalSales = filteredSalesOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);
    const totalPurchases = filteredPurchaseOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);
    const totalGST = filteredSalesOrders.reduce((sum, order) => sum + Number(order.gst_amount), 0);
    const totalDiscount = filteredSalesOrders.reduce((sum, order) => sum + Number(order.discount_amount), 0);
    
    // Calculate cost of goods sold from sales items
    const cogs = salesItems.reduce((sum, item) => {
      const saleDate = item.sales_order?.sale_date;
      if (saleDate) {
        const orderDate = parseISO(saleDate);
        if (isWithinInterval(orderDate, { start: dateFilter.start, end: dateFilter.end })) {
          const purchasePrice = Number(item.product?.purchase_price || 0);
          return sum + (purchasePrice * item.quantity);
        }
      }
      return sum;
    }, 0);

    const grossProfit = totalSales - cogs;
    const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

    return {
      totalSales,
      totalPurchases,
      grossProfit,
      profitMargin,
      totalGST,
      totalDiscount,
      salesCount: filteredSalesOrders.length,
      purchaseCount: filteredPurchaseOrders.length,
    };
  }, [filteredSalesOrders, filteredPurchaseOrders, salesItems, dateFilter]);

  // Sales trend data (grouped by date)
  const salesTrendData = useMemo(() => {
    const grouped: Record<string, { date: string; sales: number; purchases: number }> = {};
    
    filteredSalesOrders.forEach((order) => {
      const date = format(parseISO(order.sale_date), "MMM dd");
      if (!grouped[date]) {
        grouped[date] = { date, sales: 0, purchases: 0 };
      }
      grouped[date].sales += Number(order.total_amount);
    });

    filteredPurchaseOrders.forEach((order) => {
      const date = format(parseISO(order.order_date), "MMM dd");
      if (!grouped[date]) {
        grouped[date] = { date, sales: 0, purchases: 0 };
      }
      grouped[date].purchases += Number(order.total_amount);
    });

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredSalesOrders, filteredPurchaseOrders]);

  // Top selling products
  const topProducts = useMemo(() => {
    const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
    
    salesItems.forEach((item) => {
      const saleDate = item.sales_order?.sale_date;
      if (saleDate) {
        const orderDate = parseISO(saleDate);
        if (isWithinInterval(orderDate, { start: dateFilter.start, end: dateFilter.end })) {
          const productName = item.product?.name || "Unknown";
          if (!productSales[productName]) {
            productSales[productName] = { name: productName, quantity: 0, revenue: 0 };
          }
          productSales[productName].quantity += item.quantity;
          productSales[productName].revenue += Number(item.total_price);
        }
      }
    });

    return Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [salesItems, dateFilter]);

  // Product profit margins
  const productMargins = useMemo(() => {
    return products
      .map((product) => {
        const purchasePrice = Number(product.purchase_price);
        const salePrice = Number(product.sale_price || product.mrp);
        const margin = purchasePrice > 0 ? ((salePrice - purchasePrice) / purchasePrice) * 100 : 0;
        return {
          name: product.name,
          purchasePrice,
          salePrice,
          mrp: Number(product.mrp),
          margin,
        };
      })
      .sort((a, b) => b.margin - a.margin);
  }, [products]);

  // Supplier performance
  const supplierPerformance = useMemo(() => {
    const performance: Record<string, { 
      name: string; 
      totalOrders: number; 
      totalValue: number; 
      deliveredOrders: number;
    }> = {};

    filteredPurchaseOrders.forEach((order) => {
      const supplierName = order.supplier?.name || "Unknown";
      if (!performance[supplierName]) {
        performance[supplierName] = { 
          name: supplierName, 
          totalOrders: 0, 
          totalValue: 0, 
          deliveredOrders: 0 
        };
      }
      performance[supplierName].totalOrders += 1;
      performance[supplierName].totalValue += Number(order.total_amount);
      if (order.status === "delivered") {
        performance[supplierName].deliveredOrders += 1;
      }
    });

    return Object.values(performance).map((s) => ({
      ...s,
      deliveryRate: s.totalOrders > 0 ? (s.deliveredOrders / s.totalOrders) * 100 : 0,
    }));
  }, [filteredPurchaseOrders]);

  // Chart configurations
  const salesChartConfig = {
    sales: { label: "Sales", color: "hsl(var(--chart-1))" },
    purchases: { label: "Purchases", color: "hsl(var(--chart-2))" },
  };

  const pieChartColors = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
  ];

  // Show access denied for non-admin
  if (!loading && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <ShieldAlert className="h-16 w-16 mb-4" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-sm">Only administrators can access reports</p>
      </div>
    );
  }

  const hasData = salesOrders.length > 0 || purchaseOrders.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Reports & Analytics"
          description="Business insights and performance metrics"
        />
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7days">Last 7 Days</SelectItem>
            <SelectItem value="30days">Last 30 Days</SelectItem>
            <SelectItem value="thisMonth">This Month</SelectItem>
            <SelectItem value="allTime">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{metrics.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.salesCount} orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Purchases</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{metrics.totalPurchases.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.purchaseCount} orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
            {metrics.grossProfit >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.grossProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
              ₹{metrics.grossProfit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">
              After cost of goods
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.profitMargin >= 20 ? "text-green-600" : metrics.profitMargin >= 10 ? "text-yellow-600" : "text-destructive"}`}>
              {metrics.profitMargin.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.profitMargin >= 20 ? "Healthy" : metrics.profitMargin >= 10 ? "Moderate" : "Low"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sales Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Sales & Purchase Trend</CardTitle>
            <CardDescription>Daily comparison of sales vs purchases</CardDescription>
          </CardHeader>
          <CardContent>
            {salesTrendData.length > 0 ? (
              <ChartContainer config={salesChartConfig} className="h-[300px] w-full">
                <AreaChart data={salesTrendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => `₹${v}`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stackId="1"
                    stroke="hsl(var(--chart-1))"
                    fill="hsl(var(--chart-1))"
                    fillOpacity={0.6}
                  />
                  <Area
                    type="monotone"
                    dataKey="purchases"
                    stackId="2"
                    stroke="hsl(var(--chart-2))"
                    fill="hsl(var(--chart-2))"
                    fillOpacity={0.6}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <AlertCircle className="h-12 w-12 mb-4" />
                <p>No transaction data available</p>
                <p className="text-sm">Start making sales to see trends</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Products Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top Selling Products</CardTitle>
            <CardDescription>Products by revenue generated</CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length > 0 ? (
              <ChartContainer config={{ revenue: { label: "Revenue", color: "hsl(var(--chart-3))" } }} className="h-[300px] w-full">
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => `₹${v}`} className="text-xs" />
                  <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="revenue" fill="hsl(var(--chart-3))" radius={4} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <Package className="h-12 w-12 mb-4" />
                <p>No sales data available</p>
                <p className="text-sm">Complete some sales to see top products</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Analytics Tables Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Product Profit Margins */}
        <Card>
          <CardHeader>
            <CardTitle>Product Profit Margins</CardTitle>
            <CardDescription>Margin analysis by product</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Purchase</TableHead>
                    <TableHead className="text-right">Sale Price</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productMargins.length > 0 ? (
                    productMargins.map((product) => (
                      <TableRow key={product.name}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="text-right">₹{product.purchasePrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          ₹{product.salePrice > 0 ? product.salePrice.toFixed(2) : product.mrp.toFixed(2)}
                          {product.salePrice === 0 && (
                            <span className="text-xs text-muted-foreground ml-1">(MRP)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={product.margin >= 20 ? "default" : product.margin >= 10 ? "secondary" : "destructive"}
                          >
                            {product.margin.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No products found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Supplier Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Supplier Performance</CardTitle>
            <CardDescription>Order volume and delivery rates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {supplierPerformance.length > 0 ? (
                <>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={supplierPerformance}
                          dataKey="totalValue"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        >
                          {supplierPerformance.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={pieChartColors[index % pieChartColors.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Delivery</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplierPerformance.map((supplier) => (
                        <TableRow key={supplier.name}>
                          <TableCell className="font-medium">{supplier.name}</TableCell>
                          <TableCell className="text-right">{supplier.totalOrders}</TableCell>
                          <TableCell className="text-right">₹{supplier.totalValue.toLocaleString("en-IN")}</TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={supplier.deliveryRate >= 80 ? "default" : supplier.deliveryRate >= 50 ? "secondary" : "destructive"}
                            >
                              <Truck className="h-3 w-3 mr-1" />
                              {supplier.deliveryRate.toFixed(0)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <Truck className="h-12 w-12 mb-4" />
                  <p>No supplier data available</p>
                  <p className="text-sm">Create purchase orders to see supplier analytics</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* GST Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Tax & Discount Summary</CardTitle>
          <CardDescription>GST collected and discounts given</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">GST Collected</p>
              <p className="text-2xl font-bold text-green-600">
                ₹{metrics.totalGST.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Discounts Given</p>
              <p className="text-2xl font-bold text-orange-600">
                ₹{metrics.totalDiscount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Net Revenue</p>
              <p className="text-2xl font-bold">
                ₹{(metrics.totalSales - metrics.totalGST).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
