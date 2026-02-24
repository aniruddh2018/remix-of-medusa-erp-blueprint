import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit, Trash2, Phone, Mail, MapPin, Users, Building2, IndianRupee } from "lucide-react";
import { format } from "date-fns";

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
}

export default function Customers() {
  const { toast } = useToast();
  const { config, companyId } = useBusiness();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    gst_number: "",
  });

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });

  // Fetch outstanding balances per customer
  const { data: outstandingMap } = useQuery({
    queryKey: ["customer-outstandings"],
    queryFn: async () => {
      // Fetch all confirmed/delivered sales grouped by customer
      const { data: sales } = await supabase
        .from("sales_orders")
        .select("customer_id, total_amount")
        .not("customer_id", "is", null)
        .in("status", ["confirmed", "delivered", "pending", "shipped"]);

      // Fetch all payments for customers
      const { data: payments } = await supabase
        .from("payments")
        .select("reference_id, amount")
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

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (config.requiresCustomerGST && !data.gst_number.trim()) {
        throw new Error("GSTIN is required for B2B customers");
      }
      const { error } = await supabase.from("customers").insert({
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        notes: data.notes || null,
        gst_number: data.gst_number || null,
        company_id: companyId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Customer added successfully" });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      if (config.requiresCustomerGST && !data.gst_number.trim()) {
        throw new Error("GSTIN is required for B2B customers");
      }
      const { error } = await supabase
        .from("customers")
        .update({
          name: data.name,
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          notes: data.notes || null,
          gst_number: data.gst_number || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Customer updated successfully" });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
    setFormData({ name: "", phone: "", email: "", address: "", notes: "", gst_number: "" });
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      notes: customer.notes || "",
      gst_number: customer.gst_number || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (config.requiresCustomerGST && !formData.gst_number.trim()) {
      toast({ title: "GSTIN is required for B2B customers", variant: "destructive" });
      return;
    }

    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
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
                  <TableRow key={customer.id}>
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
                          <Badge className="bg-destructive text-destructive-foreground">₹{outstanding.toLocaleString()}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">₹0</Badge>
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
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Company / Customer name"
              />
            </div>
            {config.requiresCustomerGST && (
              <div className="space-y-2">
                <Label>GSTIN {config.requiresCustomerGST ? "*" : ""}</Label>
                <Input
                  value={formData.gst_number}
                  onChange={(e) => setFormData((prev) => ({ ...prev, gst_number: e.target.value.toUpperCase() }))}
                  placeholder="e.g. 22AAAAA0000A1Z5"
                  maxLength={15}
                  className="font-mono"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="Phone number"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="Email address"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Full address"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Any additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingCustomer
                ? "Update"
                : "Add Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
