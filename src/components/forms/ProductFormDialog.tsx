import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type DrugSchedule = Database["public"]["Enums"]["drug_schedule"];

const drugScheduleLabels: Record<DrugSchedule, string> = {
  none: "None",
  schedule_h: "Schedule H",
  schedule_h1: "Schedule H1",
  schedule_x: "Schedule X",
  narcotic: "Narcotic",
};

// Common GST rates for pharmaceuticals in India
const GST_RATES = [
  { value: 0, label: "0% (Exempt)" },
  { value: 5, label: "5% GST" },
  { value: 12, label: "12% GST" },
  { value: 18, label: "18% GST" },
  { value: 28, label: "28% GST" },
];

// Common drug categories
const DRUG_CATEGORIES = [
  "Tablets",
  "Capsules",
  "Syrups",
  "Injections",
  "Ointments",
  "Drops",
  "Inhalers",
  "Powders",
  "Sachets",
  "Suppositories",
  "Patches",
  "Other",
];

interface ProductFormData {
  name: string;
  generic_name: string;
  strength: string;
  composition: string;
  manufacturer: string;
  category: string;
  drug_schedule: DrugSchedule;
  hsn_code: string;
  unit: string;
  min_stock_level: number;
  max_stock_level: number;
  reorder_level: number;
  mrp: number;
  purchase_price: number;
  sale_price: number;
  gst_percentage: number;
}

const initialFormData: ProductFormData = {
  name: "",
  generic_name: "",
  strength: "",
  composition: "",
  manufacturer: "",
  category: "",
  drug_schedule: "none",
  hsn_code: "",
  unit: "pcs",
  min_stock_level: 10,
  max_stock_level: 1000,
  reorder_level: 20,
  mrp: 0,
  purchase_price: 0,
  sale_price: 0,
  gst_percentage: 12,
};

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (productId: string) => void;
}

export function ProductFormDialog({ open, onOpenChange, onSuccess }: ProductFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);

  useEffect(() => {
    if (!open) {
      setFormData(initialFormData);
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const { data: product, error } = await supabase
        .from("products")
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return product;
    },
    onSuccess: (product) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-active"] });
      queryClient.invalidateQueries({ queryKey: ["products-for-sale"] });
      toast({ title: "Product created successfully" });
      onOpenChange(false);
      onSuccess?.(product.id);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.manufacturer || formData.mrp <= 0 || formData.purchase_price <= 0) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Brand/Product Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Brand Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Lipitor, Atorva"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            {/* Generic/Drug Name */}
            <div className="space-y-2">
              <Label htmlFor="generic_name">Drug Name (Generic)</Label>
              <Input
                id="generic_name"
                placeholder="e.g., Atorvastatin"
                value={formData.generic_name}
                onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
              />
            </div>

            {/* Strength */}
            <div className="space-y-2">
              <Label htmlFor="strength">Strength</Label>
              <Input
                id="strength"
                placeholder="e.g., 40mg, 500mg"
                value={formData.strength}
                onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
              />
            </div>

            {/* Composition/Combination */}
            <div className="space-y-2">
              <Label htmlFor="composition">Composition / Combination</Label>
              <Input
                id="composition"
                placeholder="e.g., Atorvastatin 40mg + Aspirin 75mg"
                value={formData.composition}
                onChange={(e) => setFormData({ ...formData, composition: e.target.value })}
              />
            </div>

            {/* Manufacturer */}
            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer *</Label>
              <Input
                id="manufacturer"
                placeholder="e.g., Pfizer, Sun Pharma"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                required
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {DRUG_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Drug Schedule */}
            <div className="space-y-2">
              <Label htmlFor="drug_schedule">Drug Schedule *</Label>
              <Select
                value={formData.drug_schedule}
                onValueChange={(value: DrugSchedule) =>
                  setFormData({ ...formData, drug_schedule: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(drugScheduleLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* HSN Code */}
            <div className="space-y-2">
              <Label htmlFor="hsn_code">HSN Code</Label>
              <Input
                id="hsn_code"
                placeholder="e.g., 3004"
                value={formData.hsn_code}
                onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
              />
            </div>

            {/* GST Rate */}
            <div className="space-y-2">
              <Label htmlFor="gst_percentage">GST Rate</Label>
              <Select
                value={formData.gst_percentage.toString()}
                onValueChange={(value) =>
                  setFormData({ ...formData, gst_percentage: parseFloat(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GST_RATES.map((rate) => (
                    <SelectItem key={rate.value} value={rate.value.toString()}>
                      {rate.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Unit */}
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Select
                value={formData.unit}
                onValueChange={(value) => setFormData({ ...formData, unit: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pcs">Pieces</SelectItem>
                  <SelectItem value="strip">Strip</SelectItem>
                  <SelectItem value="bottle">Bottle</SelectItem>
                  <SelectItem value="box">Box</SelectItem>
                  <SelectItem value="tube">Tube</SelectItem>
                  <SelectItem value="vial">Vial</SelectItem>
                  <SelectItem value="amp">Ampoule</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* MRP */}
            <div className="space-y-2">
              <Label htmlFor="mrp">MRP (₹) *</Label>
              <Input
                id="mrp"
                type="number"
                step="0.01"
                min="0"
                value={formData.mrp || ""}
                onChange={(e) => setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            {/* Purchase Price */}
            <div className="space-y-2">
              <Label htmlFor="purchase_price">Purchase Price (₹) *</Label>
              <Input
                id="purchase_price"
                type="number"
                step="0.01"
                min="0"
                value={formData.purchase_price || ""}
                onChange={(e) =>
                  setFormData({ ...formData, purchase_price: parseFloat(e.target.value) || 0 })
                }
                required
              />
            </div>

            {/* Sale Price */}
            <div className="space-y-2">
              <Label htmlFor="sale_price">Sale Price (₹)</Label>
              <Input
                id="sale_price"
                type="number"
                step="0.01"
                min="0"
                value={formData.sale_price || ""}
                onChange={(e) =>
                  setFormData({ ...formData, sale_price: parseFloat(e.target.value) || 0 })
                }
                placeholder="Optional - defaults to MRP"
              />
            </div>

            {/* Reorder Level */}
            <div className="space-y-2">
              <Label htmlFor="reorder_level">Reorder Level</Label>
              <Input
                id="reorder_level"
                type="number"
                min="0"
                value={formData.reorder_level}
                onChange={(e) =>
                  setFormData({ ...formData, reorder_level: parseInt(e.target.value) || 0 })
                }
              />
            </div>

            {/* Min Stock Level */}
            <div className="space-y-2">
              <Label htmlFor="min_stock_level">Min Stock Level</Label>
              <Input
                id="min_stock_level"
                type="number"
                min="0"
                value={formData.min_stock_level}
                onChange={(e) =>
                  setFormData({ ...formData, min_stock_level: parseInt(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Product
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
