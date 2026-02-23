import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Supplier = Tables<"suppliers">;
type SupplierInsert = TablesInsert<"suppliers">;

interface SupplierFormData {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  gst_number: string;
  drug_license_number: string;
  is_active: boolean;
}

const initialFormData: SupplierFormData = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  gst_number: "",
  drug_license_number: "",
  is_active: true,
};

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSupplier?: Supplier | null;
  onSuccess?: (supplierId: string) => void;
}

export function SupplierFormDialog({
  open,
  onOpenChange,
  editingSupplier,
  onSuccess,
}: SupplierFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { companyId, config } = useBusiness();
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData);

  useEffect(() => {
    if (editingSupplier) {
      setFormData({
        name: editingSupplier.name,
        contact_person: editingSupplier.contact_person || "",
        phone: editingSupplier.phone || "",
        email: editingSupplier.email || "",
        address: editingSupplier.address || "",
        gst_number: editingSupplier.gst_number || "",
        drug_license_number: editingSupplier.drug_license_number || "",
        is_active: editingSupplier.is_active,
      });
    } else if (!open) {
      setFormData(initialFormData);
    }
  }, [editingSupplier, open]);

  const createMutation = useMutation({
    mutationFn: async (data: SupplierInsert) => {
      const { data: supplier, error } = await supabase
        .from("suppliers")
        .insert({ ...data, company_id: companyId })
        .select()
        .single();
      if (error) throw error;
      return supplier;
    },
    onSuccess: (supplier) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-active"] });
      toast({ title: "Supplier created successfully" });
      onOpenChange(false);
      onSuccess?.(supplier.id);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TablesUpdate<"suppliers"> }) => {
      const { data: supplier, error } = await supabase
        .from("suppliers")
        .update(data)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return supplier;
    },
    onSuccess: (supplier) => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-active"] });
      toast({ title: "Supplier updated successfully" });
      onOpenChange(false);
      onSuccess?.(supplier.id);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast({ title: "Please enter supplier name", variant: "destructive" });
      return;
    }

    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
          <DialogDescription>
            {editingSupplier ? "Update supplier information" : "Add a new supplier to your directory"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Company Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input
                id="contact_person"
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gst_number">GST Number</Label>
              <Input
                id="gst_number"
                placeholder="e.g., 27AABCU9603R1ZM"
                value={formData.gst_number}
                onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
              />
            </div>
            {config.type !== "b2b_electronics" && (
              <div className="space-y-2">
                <Label htmlFor="drug_license_number">Drug License Number</Label>
                <Input
                  id="drug_license_number"
                  value={formData.drug_license_number}
                  onChange={(e) => setFormData({ ...formData, drug_license_number: e.target.value })}
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={3}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
            <Label htmlFor="is_active">Active Supplier</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingSupplier ? "Update" : "Add"} Supplier
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
