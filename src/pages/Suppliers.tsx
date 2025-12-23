import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, Phone, Mail, Users } from "lucide-react";
import { SupplierFormDialog } from "@/components/forms/SupplierFormDialog";
import type { Tables } from "@/integrations/supabase/types";

type Supplier = Tables<"suppliers">;

export default function Suppliers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast({ title: "Supplier deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingSupplier(null);
    }
  };

  const filteredSuppliers = suppliers?.filter(
    (supplier) =>
      supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.contact_person?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.gst_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="text-responsive-xl font-bold">Suppliers</h1>
          <p className="text-muted-foreground text-responsive-sm">Manage your supplier directory</p>
        </div>
        <Button className="gap-2 mobile-full" onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Supplier
        </Button>
      </div>

      <Card>
        <CardHeader className="p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search suppliers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="secondary" className="self-start">{filteredSuppliers?.length || 0} suppliers</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading suppliers...</div>
          ) : filteredSuppliers?.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No suppliers found. Add your first supplier to get started.</p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="mobile-card-table">
                {filteredSuppliers?.map((supplier) => (
                  <div key={supplier.id} className="mobile-card">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium">{supplier.name}</span>
                        {supplier.contact_person && (
                          <p className="text-xs text-muted-foreground">{supplier.contact_person}</p>
                        )}
                      </div>
                      <Badge variant={supplier.is_active ? "default" : "secondary"} className="badge-responsive">
                        {supplier.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-sm">
                      {supplier.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          <a href={`tel:${supplier.phone}`}>{supplier.phone}</a>
                        </div>
                      )}
                      {supplier.gst_number && (
                        <div className="text-xs text-muted-foreground">GST: {supplier.gst_number}</div>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 mt-2 pt-2 border-t">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(supplier)}>
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this supplier?")) {
                            deleteMutation.mutate(supplier.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="desktop-table rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead className="tablet-hide">Licenses</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuppliers?.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{supplier.name}</div>
                            {supplier.contact_person && (
                              <div className="text-sm text-muted-foreground">{supplier.contact_person}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {supplier.phone && (
                              <div className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3" />
                                {supplier.phone}
                              </div>
                            )}
                            {supplier.email && (
                              <div className="flex items-center gap-1 text-sm">
                                <Mail className="h-3 w-3" />
                                {supplier.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="tablet-hide">
                          <div className="space-y-1">
                            {supplier.gst_number && (
                              <div className="text-sm">
                                <span className="text-muted-foreground">GST:</span> {supplier.gst_number}
                              </div>
                            )}
                            {supplier.drug_license_number && (
                              <div className="text-sm">
                                <span className="text-muted-foreground">DL:</span> {supplier.drug_license_number}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={supplier.is_active ? "default" : "secondary"}>
                            {supplier.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(supplier)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this supplier?")) {
                                  deleteMutation.mutate(supplier.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <SupplierFormDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        editingSupplier={editingSupplier}
      />
    </div>
  );
}
