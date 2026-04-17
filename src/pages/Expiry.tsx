import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, AlertTriangle, Clock, Loader2, Calendar, Trash2, TrendingDown } from "lucide-react";
import { format, addDays, isBefore, differenceInDays } from "date-fns";

interface ExpiryItem {
  id: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  mrp: number;
  purchase_price: number;
  product: {
    id: string;
    name: string;
    manufacturer: string;
  };
}

interface LossRow {
  product_id: string;
  product_name: string;
  manufacturer: string;
  total_qty: number;
  loss_value: number;
}

type ExpiryFilter = "all" | "expired" | "30days" | "90days" | "180days";

export default function Expiry() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const [items, setItems] = useState<ExpiryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<ExpiryFilter>("90days");
  const [disposing, setDisposing] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ExpiryItem | null>(null);
  const [disposeQty, setDisposeQty] = useState<string>("");
  const [lossRows, setLossRows] = useState<LossRow[]>([]);
  const [lossLoading, setLossLoading] = useState(false);

  const fetchExpiryItems = async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("inventory_batches")
        .select(`
          id,
          batch_number,
          quantity,
          expiry_date,
          mrp,
          purchase_price,
          product:products(id, name, manufacturer)
        `)
        .eq("company_id", companyId)
        .gt("quantity", 0)
        .order("expiry_date", { ascending: true });

      if (error) throw error;
      setItems(data as any || []);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchLossSummary = async () => {
    if (!companyId) return;
    setLossLoading(true);
    try {
      const { data, error } = await supabase
        .from("inventory_transactions")
        .select("product_id, quantity, rate, products(name, manufacturer)")
        .eq("company_id", companyId)
        .eq("transaction_type", "expiry_loss");
      if (error) throw error;
      const map = new Map<string, LossRow>();
      (data || []).forEach((r: any) => {
        const qty = Math.abs(Number(r.quantity) || 0);
        const value = qty * (Number(r.rate) || 0);
        const existing = map.get(r.product_id);
        if (existing) {
          existing.total_qty += qty;
          existing.loss_value += value;
        } else {
          map.set(r.product_id, {
            product_id: r.product_id,
            product_name: r.products?.name || "Unknown",
            manufacturer: r.products?.manufacturer || "",
            total_qty: qty,
            loss_value: value,
          });
        }
      });
      setLossRows(Array.from(map.values()).sort((a, b) => b.loss_value - a.loss_value));
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLossLoading(false);
    }
  };

  useEffect(() => {
    fetchExpiryItems();
    fetchLossSummary();
  }, [companyId]);

  const today = new Date();

  const filteredItems = items.filter((item) => {
    const expiryDate = new Date(item.expiry_date);
    const matchesSearch =
      item.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.batch_number.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    switch (filter) {
      case "expired": return isBefore(expiryDate, today);
      case "30days": return isBefore(expiryDate, addDays(today, 30));
      case "90days": return isBefore(expiryDate, addDays(today, 90));
      case "180days": return isBefore(expiryDate, addDays(today, 180));
      default: return true;
    }
  });

  const getExpiryStatus = (expiryDate: string) => {
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = differenceInDays(expiry, today);
    if (daysUntilExpiry < 0) return { label: "Expired", color: "bg-destructive text-destructive-foreground", days: daysUntilExpiry, isExpired: true };
    if (daysUntilExpiry <= 30) return { label: "Critical", color: "bg-destructive text-destructive-foreground", days: daysUntilExpiry, isExpired: false };
    if (daysUntilExpiry <= 90) return { label: "Warning", color: "bg-warning text-warning-foreground", days: daysUntilExpiry, isExpired: false };
    if (daysUntilExpiry <= 180) return { label: "Monitor", color: "bg-info text-info-foreground", days: daysUntilExpiry, isExpired: false };
    return { label: "Good", color: "bg-success text-success-foreground", days: daysUntilExpiry, isExpired: false };
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
    totalLoss: lossRows.reduce((sum, r) => sum + r.loss_value, 0),
  };

  const openDispose = (item: ExpiryItem) => {
    setConfirmTarget(item);
    setDisposeQty(String(item.quantity));
  };

  const handleDispose = async () => {
    if (!confirmTarget) return;
    const qty = parseInt(disposeQty, 10);
    if (!qty || qty <= 0 || qty > confirmTarget.quantity) {
      toast({ variant: "destructive", title: "Invalid quantity", description: `Enter a number between 1 and ${confirmTarget.quantity}` });
      return;
    }
    setDisposing(confirmTarget.id);
    try {
      const { error } = await supabase.rpc("dispose_expired_batch" as any, {
        _batch_id: confirmTarget.id,
        _quantity: qty,
        _notes: `Disposed expired batch ${confirmTarget.batch_number}`,
      });
      if (error) throw error;
      toast({
        title: "Disposed",
        description: `${qty} units of ${confirmTarget.product.name} written off as expiry loss`,
      });
      setConfirmTarget(null);
      setDisposeQty("");
      await Promise.all([fetchExpiryItems(), fetchLossSummary()]);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Disposal failed", description: error.message });
    } finally {
      setDisposing(null);
    }
  };

  return (
    <div className="page-container">
      <div>
        <h1 className="text-responsive-xl font-bold">Expiry Tracking</h1>
        <p className="text-muted-foreground text-responsive-sm">Monitor expiring inventory and track regulatory disposal losses</p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Card className="border-destructive/50">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 sm:p-3 rounded-xl bg-destructive/10">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Expired</p>
                <p className="text-lg sm:text-2xl font-bold text-destructive">{stats.expired}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 sm:p-3 rounded-xl bg-destructive/10">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">&lt;30 days</p>
                <p className="text-lg sm:text-2xl font-bold">{stats.critical}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-warning/30">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 sm:p-3 rounded-xl bg-warning/10">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">&lt;90 days</p>
                <p className="text-lg sm:text-2xl font-bold">{stats.warning}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 sm:p-3 rounded-xl bg-info/10">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-info" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">At Risk</p>
                <p className="text-base sm:text-xl font-bold">₹{stats.totalValue.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-destructive/40 col-span-2 lg:col-span-1">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 sm:p-3 rounded-xl bg-destructive/10">
                <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Expiry Loss (cost)</p>
                <p className="text-base sm:text-xl font-bold text-destructive">₹{stats.totalLoss.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="batches">
        <TabsList>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="loss">Loss Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="batches" className="mt-3">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products or batches..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={filter} onValueChange={(v: ExpiryFilter) => setFilter(v)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
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
                <Badge variant="secondary" className="self-start">{filteredItems.length} items</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
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
                        <TableHead className="text-right tablet-hide">Value (MRP)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Days</TableHead>
                        <TableHead className="text-right sticky right-0 bg-background shadow-[-4px_0_8px_-4px_hsl(var(--border))]">Action</TableHead>
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
                            <TableCell className="text-right font-mono tablet-hide">
                              ₹{(item.quantity * Number(item.mrp)).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge className={status.color}>{status.label}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {status.days < 0 ? (
                                <span className="text-destructive">{Math.abs(status.days)}d ago</span>
                              ) : (
                                `${status.days}d`
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {status.isExpired ? (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={disposing === item.id}
                                  onClick={() => openDispose(item)}
                                  className="h-7 px-2 text-xs"
                                >
                                  {disposing === item.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <><Trash2 className="h-3 w-3 mr-1" /> Dispose</>
                                  )}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
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
        </TabsContent>

        <TabsContent value="loss" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expiry Loss by Product</CardTitle>
              <p className="text-xs text-muted-foreground">Cumulative disposed quantity and cost-value loss per product (regulatory record)</p>
            </CardHeader>
            <CardContent>
              {lossLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : lossRows.length === 0 ? (
                <div className="text-center py-8">
                  <TrendingDown className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No expiry disposals recorded yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Manufacturer</TableHead>
                        <TableHead className="text-right">Disposed Qty</TableHead>
                        <TableHead className="text-right">Loss Value (cost)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lossRows.map((r) => (
                        <TableRow key={r.product_id}>
                          <TableCell className="font-medium">{r.product_name}</TableCell>
                          <TableCell className="text-muted-foreground">{r.manufacturer}</TableCell>
                          <TableCell className="text-right font-mono">{r.total_qty}</TableCell>
                          <TableCell className="text-right font-mono text-destructive">
                            ₹{r.loss_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-semibold">
                        <TableCell colSpan={2}>Total</TableCell>
                        <TableCell className="text-right font-mono">
                          {lossRows.reduce((s, r) => s + r.total_qty, 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-destructive">
                          ₹{stats.totalLoss.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => { if (!open) { setConfirmTarget(null); setDisposeQty(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dispose Expired Stock?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  <strong>{confirmTarget?.product.name}</strong> · Batch <span className="font-mono">{confirmTarget?.batch_number}</span>
                </div>
                <div className="text-xs">
                  Available: {confirmTarget?.quantity} · Expired on {confirmTarget && format(new Date(confirmTarget.expiry_date), "MMM dd, yyyy")}
                </div>
                <div className="text-xs text-destructive">
                  Stock will be reduced and recorded as an expiry loss in the inventory ledger. This is irreversible.
                </div>
                <div className="pt-2">
                  <label className="text-xs text-muted-foreground block mb-1">Quantity to dispose</label>
                  <Input
                    type="number"
                    min={1}
                    max={confirmTarget?.quantity}
                    value={disposeQty}
                    onChange={(e) => setDisposeQty(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDispose(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disposing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Disposal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
