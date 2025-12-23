import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, AlertTriangle, Clock, Loader2, Calendar } from "lucide-react";
import { format, addDays, isBefore, differenceInDays } from "date-fns";

interface ExpiryItem {
  id: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  mrp: number;
  product: {
    id: string;
    name: string;
    manufacturer: string;
  };
}

type ExpiryFilter = "all" | "expired" | "30days" | "90days" | "180days";

export default function Expiry() {
  const { toast } = useToast();
  const [items, setItems] = useState<ExpiryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<ExpiryFilter>("90days");

  const fetchExpiryItems = async () => {
    try {
      let query = supabase
        .from("inventory_batches")
        .select(`
          id,
          batch_number,
          quantity,
          expiry_date,
          mrp,
          product:products(id, name, manufacturer)
        `)
        .gt("quantity", 0)
        .order("expiry_date", { ascending: true });

      const { data, error } = await query;
      if (error) throw error;
      setItems(data as ExpiryItem[] || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpiryItems();
  }, []);

  const today = new Date();

  const filteredItems = items.filter((item) => {
    const expiryDate = new Date(item.expiry_date);
    const matchesSearch =
      item.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.batch_number.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    switch (filter) {
      case "expired":
        return isBefore(expiryDate, today);
      case "30days":
        return isBefore(expiryDate, addDays(today, 30));
      case "90days":
        return isBefore(expiryDate, addDays(today, 90));
      case "180days":
        return isBefore(expiryDate, addDays(today, 180));
      default:
        return true;
    }
  });

  const getExpiryStatus = (expiryDate: string) => {
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = differenceInDays(expiry, today);

    if (daysUntilExpiry < 0) {
      return { label: "Expired", color: "bg-destructive text-destructive-foreground", days: daysUntilExpiry };
    } else if (daysUntilExpiry <= 30) {
      return { label: "Critical", color: "bg-destructive text-destructive-foreground", days: daysUntilExpiry };
    } else if (daysUntilExpiry <= 90) {
      return { label: "Warning", color: "bg-warning text-warning-foreground", days: daysUntilExpiry };
    } else if (daysUntilExpiry <= 180) {
      return { label: "Monitor", color: "bg-info text-info-foreground", days: daysUntilExpiry };
    }
    return { label: "Good", color: "bg-success text-success-foreground", days: daysUntilExpiry };
  };

  const stats = {
    expired: items.filter((i) => isBefore(new Date(i.expiry_date), today)).length,
    critical: items.filter((i) => {
      const d = new Date(i.expiry_date);
      return !isBefore(d, today) && isBefore(d, addDays(today, 30));
    }).length,
    warning: items.filter((i) => {
      const d = new Date(i.expiry_date);
      return !isBefore(d, addDays(today, 30)) && isBefore(d, addDays(today, 90));
    }).length,
    totalValue: filteredItems.reduce((sum, i) => sum + i.quantity * Number(i.mrp), 0),
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Expiry Tracking</h1>
        <p className="text-muted-foreground">Monitor and manage expiring inventory</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-destructive/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Expired</p>
                <p className="text-2xl font-bold text-destructive">{stats.expired}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-destructive/10">
                <Clock className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Critical (&lt;30 days)</p>
                <p className="text-2xl font-bold">{stats.critical}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-warning/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-warning/10">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Warning (&lt;90 days)</p>
                <p className="text-2xl font-bold">{stats.warning}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-info/10">
                <Calendar className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">At Risk Value</p>
                <p className="text-2xl font-bold">₹{stats.totalValue.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products or batches..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filter} onValueChange={(v: ExpiryFilter) => setFilter(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by expiry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="30days">Within 30 Days</SelectItem>
                <SelectItem value="90days">Within 90 Days</SelectItem>
                <SelectItem value="180days">Within 180 Days</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary">{filteredItems.length} items</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No items matching your criteria</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Batch No.</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Value (MRP)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Days Left</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const status = getExpiryStatus(item.expiry_date);
                    return (
                      <TableRow key={item.id} className="table-hover-row">
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.product.name}</p>
                            <p className="text-sm text-muted-foreground">{item.product.manufacturer}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{item.batch_number}</TableCell>
                        <TableCell>{format(new Date(item.expiry_date), "MMM dd, yyyy")}</TableCell>
                        <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono">
                          ₹{(item.quantity * Number(item.mrp)).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={status.color}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {status.days < 0 ? (
                            <span className="text-destructive">{Math.abs(status.days)} days ago</span>
                          ) : (
                            `${status.days} days`
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
