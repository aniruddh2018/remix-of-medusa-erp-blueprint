import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Search, Pill, Loader2, FileText, ClipboardList, Download, Plus } from "lucide-react";
import { format } from "date-fns";
import { generateScheduledRegisterPdf } from "@/utils/scheduledRegisterPdf";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const scheduleLabels: Record<string, string> = {
  schedule_h: "Schedule H",
  schedule_h1: "Schedule H1",
  schedule_x: "Schedule X",
  narcotic: "Narcotic",
};

const scheduleColors: Record<string, string> = {
  schedule_h: "bg-schedule-h text-white",
  schedule_h1: "bg-schedule-h1 text-white",
  schedule_x: "bg-schedule-x text-white",
  narcotic: "bg-schedule-narcotic text-white",
};

export default function ScheduledDrugs() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState<string>("all");

  // Fetch scheduled drug products
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["scheduled-products", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("company_id", companyId!)
        .neq("drug_schedule", "none")
        .eq("is_active", true)
        .order("drug_schedule", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  // Fetch drug register entries
  const { data: registerEntries, isLoading: registerLoading } = useQuery({
    queryKey: ["scheduled-drug-register", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_drug_register")
        .select(`
          *,
          products (name, strength, drug_schedule),
          inventory_batches (batch_number)
        `)
        .eq("company_id", companyId!)
        .order("transaction_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const filteredProducts = products?.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSchedule = scheduleFilter === "all" || p.drug_schedule === scheduleFilter;
    return matchesSearch && matchesSchedule;
  });

  const filteredRegister = registerEntries?.filter((entry) => {
    const product = entry.products as any;
    const matchesSearch = 
      product?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.doctor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.prescription_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSchedule = scheduleFilter === "all" || product?.drug_schedule === scheduleFilter;
    return matchesSearch && matchesSchedule;
  });

  return (
    <div className="page-container">
      <div>
        <h1 className="text-responsive-xl font-bold">Scheduled Drugs</h1>
        <p className="text-muted-foreground text-responsive-sm">Manage controlled substances and compliance register</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products, patients, doctors..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={scheduleFilter} onValueChange={setScheduleFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by schedule" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schedules</SelectItem>
            <SelectItem value="schedule_h">Schedule H</SelectItem>
            <SelectItem value="schedule_h1">Schedule H1</SelectItem>
            <SelectItem value="schedule_x">Schedule X</SelectItem>
            <SelectItem value="narcotic">Narcotic</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="register" className="space-y-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="register" className="gap-2 flex-1 sm:flex-none">
            <ClipboardList className="h-4 w-4" />
            <span className="mobile-hide">Drug Register</span>
            <span className="mobile-show">Register</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-2 flex-1 sm:flex-none">
            <Pill className="h-4 w-4" />
            Products
          </TabsTrigger>
        </TabsList>

        <TabsContent value="register">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-responsive-base flex items-center justify-between">
                <span>Transaction Register</span>
                <Badge variant="secondary" className="badge-responsive">{filteredRegister?.length || 0} entries</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              {registerLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : !filteredRegister || filteredRegister.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No register entries found</p>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="mobile-card-table">
                    {filteredRegister.map((entry) => {
                      const product = entry.products as any;
                      const batch = entry.inventory_batches as any;
                      return (
                        <div key={entry.id} className="mobile-card">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(entry.transaction_date), "dd MMM yyyy")}
                            </span>
                            <Badge variant={entry.transaction_type === "sale" ? "default" : "secondary"} className="badge-responsive">
                              {entry.transaction_type === "sale" ? "Sale" : "Receipt"}
                            </Badge>
                          </div>
                          <div className="font-medium text-sm mb-1">
                            {product?.name}{product?.strength ? ` ${product.strength}` : ""}
                          </div>
                          <Badge className={`${scheduleColors[product?.drug_schedule] || ""} badge-responsive mb-2`}>
                            {scheduleLabels[product?.drug_schedule] || product?.drug_schedule}
                          </Badge>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div><span className="text-muted-foreground">Batch:</span> {batch?.batch_number}</div>
                            <div><span className="text-muted-foreground">Qty:</span> {entry.transaction_type === "sale" ? "-" : "+"}{entry.quantity}</div>
                            <div><span className="text-muted-foreground">Balance:</span> {entry.balance_quantity}</div>
                            <div><span className="text-muted-foreground">Rx#:</span> {entry.prescription_number || "-"}</div>
                            {entry.patient_name && <div className="col-span-2"><span className="text-muted-foreground">Patient:</span> {entry.patient_name}</div>}
                            {entry.doctor_name && <div className="col-span-2"><span className="text-muted-foreground">Doctor:</span> {entry.doctor_name}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Table View */}
                  <div className="desktop-table overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Batch</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead className="tablet-hide">Prescription</TableHead>
                          <TableHead className="tablet-hide">Patient</TableHead>
                          <TableHead className="tablet-hide">Doctor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRegister.map((entry) => {
                          const product = entry.products as any;
                          const batch = entry.inventory_batches as any;
                          return (
                            <TableRow key={entry.id}>
                              <TableCell className="whitespace-nowrap">
                                {format(new Date(entry.transaction_date), "dd MMM yyyy")}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {product?.name}{product?.strength ? ` ${product.strength}` : ""}
                                  </span>
                                  <Badge className={scheduleColors[product?.drug_schedule] || ""}>
                                    {scheduleLabels[product?.drug_schedule] || product?.drug_schedule}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-sm">{batch?.batch_number}</TableCell>
                              <TableCell>
                                <Badge variant={entry.transaction_type === "sale" ? "default" : "secondary"}>
                                  {entry.transaction_type === "sale" ? "Sale" : "Receipt"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {entry.transaction_type === "sale" ? "-" : "+"}{entry.quantity}
                              </TableCell>
                              <TableCell className="text-right font-mono font-medium">
                                {entry.balance_quantity}
                              </TableCell>
                              <TableCell className="font-mono text-sm tablet-hide">
                                {entry.prescription_number || "-"}
                              </TableCell>
                              <TableCell className="tablet-hide">{entry.patient_name || "-"}</TableCell>
                              <TableCell className="tablet-hide">
                                <div>
                                  <span>{entry.doctor_name || "-"}</span>
                                  {entry.doctor_registration_number && (
                                    <span className="text-xs text-muted-foreground block">
                                      Reg: {entry.doctor_registration_number}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-responsive-base flex items-center justify-between">
                <span>Scheduled Drug Products</span>
                <Badge variant="secondary" className="badge-responsive">{filteredProducts?.length || 0} products</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              {productsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : !filteredProducts || filteredProducts.length === 0 ? (
                <div className="text-center py-8">
                  <Pill className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No scheduled drugs found</p>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="mobile-card-table">
                    {filteredProducts.map((product) => (
                      <div key={product.id} className="mobile-card">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">
                            {product.name}
                            {product.strength && <span className="text-muted-foreground ml-1">{product.strength}</span>}
                          </span>
                          <Badge className={scheduleColors[product.drug_schedule]}>
                            {scheduleLabels[product.drug_schedule]}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">{product.manufacturer}</div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t text-sm">
                          <span className="text-muted-foreground">{product.composition || "-"}</span>
                          <span className="font-mono font-medium">₹{Number(product.mrp).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="desktop-table overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Manufacturer</TableHead>
                          <TableHead>Schedule</TableHead>
                          <TableHead className="tablet-hide">Composition</TableHead>
                          <TableHead className="text-right">MRP</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProducts.map((product) => (
                          <TableRow key={product.id}>
                            <TableCell>
                              <span className="font-medium">{product.name}</span>
                              {product.strength && (
                                <span className="text-muted-foreground ml-1">{product.strength}</span>
                              )}
                            </TableCell>
                            <TableCell>{product.manufacturer}</TableCell>
                            <TableCell>
                              <Badge className={scheduleColors[product.drug_schedule]}>
                                {scheduleLabels[product.drug_schedule]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-xs truncate tablet-hide">
                              {product.composition || "-"}
                            </TableCell>
                            <TableCell className="text-right font-mono">₹{Number(product.mrp).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
