import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, Phone, Mail, MapPin, Users, Building2, IndianRupee, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { CustomerOutstandingDialog } from "@/components/dialogs/CustomerOutstandingDialog";
import { CustomerFormDialog } from "@/components/forms/CustomerFormDialog";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { CreditCustomersTab } from "@/components/CreditCustomersTab";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  gst_number: string | null;
  total_purchases: number;
  created_at: string;
  updated_at: string;
  company_id: string | null;
}

export default function Customers() {
  const { toast } = useToast();
  const { config, companyId } = useBusiness();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [outstandingCustomer, setOutstandingCustomer] = useState<Customer | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcut({ key: "/", callback: () => { searchRef.current?.focus(); searchRef.current?.select(); } });
  useKeyboardShortcut({ key: "n", callback: () => setDialogOpen(true), enabled: !dialogOpen });

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!companyId,
  });

  // Fetch outstanding balances per customer
  const { data: outstandingMap } = useQuery({
    queryKey: ["customer-outstandings", companyId],
    queryFn: async () => {
      // Fetch all confirmed/delivered sales grouped by customer
      const { data: sales } = await supabase
        .from("sales_orders")
        .select("customer_id, total_amount")
        .eq("company_id", companyId!)
        .not("customer_id", "is", null)
        .in("status", ["confirmed", "delivered", "pending", "shipped"]);

      // Fetch all payments for customers
      const { data: payments } = await supabase
        .from("payments")
        .select("reference_id, amount")
        .eq("company_id", companyId!)
        .eq("party_type", "customer")
        .eq("payment_type", "received");

      const salesByCustomer: Record<string, number> = {};
      sales?.forEach((s) => {
        if (s.customer_id) {
          salesByCustomer[s.customer_id] = (salesByCustomer[s.customer_id] || 0) + Number(s.total_amount);
        }
      });

      const paymentsByRef: Record<string, number> = {};
      payments?.forEach((p) => {
        paymentsByRef[p.reference_id] = (paymentsByRef[p.reference_id] || 0) + Number(p.amount);
      });

      // Outstanding = total sales - total payments received
      const map: Record<string, number> = {};
      for (const custId of Object.keys(salesByCustomer)) {
        map[custId] = salesByCustomer[custId] - (paymentsByRef[custId] || 0);
      }
      return map;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Customer deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingCustomer(null);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setDialogOpen(true);
  };

  const filteredCustomers = customers?.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone?.includes(searchQuery) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.gst_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Customers"
        description={config.requiresCustomerGST ? "Manage your B2B customer database with GST details" : "Manage your customer database"}
      />

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder={config.requiresCustomerGST ? "Search by name, phone, email, or GSTIN..." : "Search by name, phone, or email..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Customer</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{customers?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Total Customers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {config.requiresCustomerGST && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{customers?.filter(c => c.gst_number).length || 0}</p>
                  <p className="text-xs text-muted-foreground">With GSTIN</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <IndianRupee className="h-8 w-8 text-warning" />
              <div>
                <p className="text-2xl font-bold">
                  ₹{Object.values(outstandingMap || {}).reduce((sum, v) => sum + Math.max(0, v), 0).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Total Outstanding</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table - Desktop */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {config.requiresCustomerGST && <TableHead>GSTIN</TableHead>}
                <TableHead>Contact</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="text-right">Total Purchases</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Since</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={config.requiresCustomerGST ? 8 : 7} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredCustomers?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={config.requiresCustomerGST ? 8 : 7} className="text-center py-8 text-muted-foreground">
                    No customers found
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers?.map((customer) => (
                  <TableRow key={customer.id} tabIndex={0} data-kb-row data-id={customer.id}
                    className="cursor-pointer focus:bg-accent"
                    onKeyDown={(e) => {
                      const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-kb-row]"));
                      const pos = rows.indexOf(e.currentTarget);
                      if (e.key === "ArrowDown") { e.preventDefault(); rows[pos + 1]?.focus(); }
                      else if (e.key === "ArrowUp") { e.preventDefault(); rows[pos - 1]?.focus(); }
                      else if (e.key === "Enter" || e.key === "e" || e.key === "E") { e.preventDefault(); handleEdit(customer); }
                      else if (e.key === "d" || e.key === "D") { e.preventDefault(); if (confirm("Delete this customer?")) deleteMutation.mutate(customer.id); }
                    }}>
                    <TableCell>
                      <span className="font-medium">{customer.name}</span>
                    </TableCell>
                    {config.requiresCustomerGST && (
                      <TableCell>
                        {customer.gst_number ? (
                          <Badge variant="outline" className="font-mono text-xs">
                            {customer.gst_number}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="space-y-1">
                        {customer.phone && (
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3" />
                            {customer.phone}
                          </div>
                        )}
                        {customer.email && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {customer.address && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate max-w-[200px]">{customer.address}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">₹{customer.total_purchases.toFixed(2)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const outstanding = outstandingMap?.[customer.id] || 0;
                        return outstanding > 0 ? (
                          <Badge className="bg-destructive text-destructive-foreground cursor-pointer" onClick={() => setOutstandingCustomer(customer)}>₹{outstanding.toLocaleString()}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground cursor-pointer" onClick={() => setOutstandingCustomer(customer)}>₹0</Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(customer.created_at), "MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(customer)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Delete this customer?")) {
                              deleteMutation.mutate(customer.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Loading...</p>
        ) : filteredCustomers?.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No customers found</p>
        ) : (
          filteredCustomers?.map((customer) => (
            <Card key={customer.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h3 className="font-medium">{customer.name}</h3>
                    {config.requiresCustomerGST && customer.gst_number && (
                      <Badge variant="outline" className="font-mono text-xs">
                        {customer.gst_number}
                      </Badge>
                    )}
                    {customer.phone && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {customer.phone}
                      </div>
                    )}
                    {customer.email && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {customer.email}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(customer)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Delete this customer?")) {
                          deleteMutation.mutate(customer.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <span className="text-xs text-muted-foreground">
                    Customer since {format(new Date(customer.created_at), "MMM yyyy")}
                  </span>
                  <div className="flex gap-2 items-center">
                    <Badge variant="secondary">₹{customer.total_purchases.toFixed(2)}</Badge>
                    {(() => {
                      const outstanding = outstandingMap?.[customer.id] || 0;
                      return outstanding > 0 ? (
                        <Badge className="bg-destructive text-destructive-foreground">Due: ₹{outstanding.toLocaleString()}</Badge>
                      ) : null;
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add/Edit Dialog */}
      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseDialog();
          else setDialogOpen(true);
        }}
        editingCustomer={editingCustomer}
        onSuccess={() => {
          handleCloseDialog();
        }}
      />

      <CustomerOutstandingDialog
        open={!!outstandingCustomer}
        onOpenChange={(open) => !open && setOutstandingCustomer(null)}
        customerId={outstandingCustomer?.id || null}
        customerName={outstandingCustomer?.name || ""}
      />
    </div>
  );
}
