import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { detectDuplicates } from "@/utils/duplicateDetection";
import { DuplicateProductsBanner } from "@/components/DuplicateProductsBanner";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Edit, Trash2, Package, Loader2, Check, X, History, Merge } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { ProductHistoryDialog } from "@/components/dialogs/ProductHistoryDialog";
import { MergeProductsDialog } from "@/components/dialogs/MergeProductsDialog";
import { ProductConversionsEditor } from "@/components/forms/ProductConversionsEditor";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { useRepoList } from "@/offline/hooks";
import { productRepo } from "@/offline/repo";
import { SyncManager } from "@/offline/sync/SyncManager";

type Product = Database["public"]["Tables"]["products"]["Row"];
type DrugSchedule = Database["public"]["Enums"]["drug_schedule"];

const drugScheduleLabels: Record<DrugSchedule, string> = {
  none: "None",
  schedule_h: "Schedule H",
  schedule_h1: "Schedule H1",
  schedule_x: "Schedule X",
  narcotic: "Narcotic",
};

const drugScheduleColors: Record<DrugSchedule, string> = {
  none: "bg-muted text-muted-foreground",
  schedule_h: "bg-schedule-h text-white",
  schedule_h1: "bg-schedule-h1 text-white",
  schedule_x: "bg-schedule-x text-white",
  narcotic: "bg-schedule-narcotic text-white",
};

export default function Products() {
  const { isPharmacist } = useAuth();
  const { toast } = useToast();
  const { companyId, config } = useBusiness();
  const localProducts = useRepoList(productRepo, companyId);
  const products = (localProducts ?? []) as unknown as Product[];
  const loading = localProducts === undefined;
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcut({ key: "/", callback: () => { searchRef.current?.focus(); searchRef.current?.select(); } });
  useKeyboardShortcut({ key: "n", callback: () => setDialogOpen(true), enabled: !dialogOpen && isPharmacist });

  const duplicateGroups = useMemo(() => detectDuplicates(products), [products]);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    generic_name: "",
    manufacturer: "",
    category: "",
    drug_schedule: "none" as DrugSchedule,
    hsn_code: "",
    unit: "pcs",
    min_stock_level: 10,
    max_stock_level: 1000,
    reorder_level: 20,
    mrp: 0,
    purchase_price: 0,
    sale_price: 0,
    gst_percentage: 12,
    strength: "",
    composition: "",
  });

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  // List comes from the offline repo (Dexie live query). After server-side
  // mutations we just kick the sync engine; the live query re-renders
  // automatically once new rows are pulled.
  const fetchProducts = async () => {
    try {
      await SyncManager.forceSync();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Sync failed", description: error.message });
    }
  };

  useEffect(() => {
    // No-op on mount: useRepoList already subscribes. Kept for compatibility.
  }, [companyId]);

  const resetForm = () => {
    setFormData({
      name: "",
      generic_name: "",
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
      strength: "",
      composition: "",
    });
    setEditingProduct(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingProduct) {
        await productRepo.upsert({ ...formData, id: editingProduct.id, company_id: companyId } as any);
        toast({ title: "Product updated successfully" });
      } else {
        await productRepo.upsert({ ...formData, company_id: companyId } as any);
        toast({ title: "Product added successfully" });
      }

      setDialogOpen(false);
      resetForm();
      void SyncManager.forceSync();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      generic_name: product.generic_name || "",
      manufacturer: product.manufacturer,
      category: product.category || "",
      drug_schedule: product.drug_schedule,
      hsn_code: product.hsn_code || "",
      unit: product.unit,
      min_stock_level: product.min_stock_level,
      max_stock_level: product.max_stock_level,
      reorder_level: product.reorder_level,
      mrp: Number(product.mrp),
      purchase_price: Number(product.purchase_price),
      sale_price: Number(product.sale_price || 0),
      gst_percentage: Number(product.gst_percentage),
      strength: product.strength || "",
      composition: product.composition || "",
    });
    setDialogOpen(true);
  };

  // Inline edit handlers
  const startInlineEdit = (productId: string, field: string, currentValue: string | number) => {
    setEditingCell({ id: productId, field });
    setEditValue(String(currentValue));
  };

  const saveInlineEdit = async () => {
    if (!editingCell) return;

    try {
      const value = ["mrp", "purchase_price", "sale_price", "gst_percentage"].includes(editingCell.field)
        ? parseFloat(editValue) || 0
        : editValue;

      await productRepo.upsert({ id: editingCell.id, [editingCell.field]: value, company_id: companyId } as any);

      toast({ title: "Updated successfully" });
      void SyncManager.forceSync();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setEditingCell(null);
      setEditValue("");
    }
  };

  const cancelInlineEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;

    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Product deleted successfully" });
      fetchProducts();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("products").delete().in("id", ids);
      if (error) throw error;
      toast({ title: `${ids.length} product(s) deleted` });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      fetchProducts();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setBulkDeleting(false);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.generic_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.manufacturer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-container">
      <PageHeader 
        title="Products" 
        description="Manage your medicine catalog"
        breadcrumbs={[{ label: "Products" }]}
        actions={
          isPharmacist && (
            <div className="flex gap-2">
              {selectedIds.size > 0 && (
                <Button variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected ({selectedIds.size})
                </Button>
              )}
              <Button variant="outline" onClick={() => setMergeOpen(true)}>
                <Merge className="h-4 w-4 mr-2" />
                Merge Duplicates
              </Button>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </div>
          )
        }
      />

      {isPharmacist && duplicateGroups.length > 0 && (
        <DuplicateProductsBanner
          groups={duplicateGroups}
          onMergeComplete={fetchProducts}
          onOpenMergeDialog={() => setMergeOpen(true)}
        />
      )}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Edit Product" : "Add New Product"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              {config.hasGenericName && (
                <div className="space-y-2">
                  <Label htmlFor="generic_name">Generic Name</Label>
                  <Input
                    id="generic_name"
                    value={formData.generic_name}
                    onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="manufacturer">{config.terms.manufacturer} *</Label>
                <Input
                  id="manufacturer"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">{config.terms.category}</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>
              {config.hasDrugSchedule && (
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
              )}
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
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mrp">MRP (₹) *</Label>
                <Input
                  id="mrp"
                  type="number"
                  step="0.01"
                  value={formData.mrp}
                  onChange={(e) => setFormData({ ...formData, mrp: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase_price">Purchase Price (₹) *</Label>
                <Input
                  id="purchase_price"
                  type="number"
                  step="0.01"
                  value={formData.purchase_price}
                  onChange={(e) => setFormData({ ...formData, purchase_price: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sale_price">Sale Price (₹)</Label>
                <Input
                  id="sale_price"
                  type="number"
                  step="0.01"
                  value={formData.sale_price}
                  onChange={(e) => setFormData({ ...formData, sale_price: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gst_percentage">GST %</Label>
                <Input
                  id="gst_percentage"
                  type="number"
                  step="0.01"
                  value={formData.gst_percentage}
                  onChange={(e) => setFormData({ ...formData, gst_percentage: parseFloat(e.target.value) || 0 })}
                />
              </div>
              {config.hasStrength && (
                <div className="space-y-2">
                  <Label htmlFor="strength">Strength</Label>
                  <Input
                    id="strength"
                    placeholder="e.g., 500mg, 10ml"
                    value={formData.strength}
                    onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                  />
                </div>
              )}
              {config.hasComposition && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="composition">Composition</Label>
                  <Input
                    id="composition"
                    placeholder="Active ingredients"
                    value={formData.composition}
                    onChange={(e) => setFormData({ ...formData, composition: e.target.value })}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="hsn_code">HSN Code</Label>
                <Input
                  id="hsn_code"
                  value={formData.hsn_code}
                  onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reorder_level">Reorder Level</Label>
                <Input
                  id="reorder_level"
                  type="number"
                  value={formData.reorder_level}
                  onChange={(e) => setFormData({ ...formData, reorder_level: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="min_stock_level">Min Stock Level</Label>
                <Input
                  id="min_stock_level"
                  type="number"
                  value={formData.min_stock_level}
                  onChange={(e) => setFormData({ ...formData, min_stock_level: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            {editingProduct && companyId ? (
              <ProductConversionsEditor
                productId={editingProduct.id}
                companyId={companyId}
                baseUnit={(editingProduct as any).base_unit || editingProduct.unit || "pcs"}
              />
            ) : (
              <div className="border rounded-md p-3 bg-muted/30 text-xs text-muted-foreground">
                💡 <span className="font-semibold">Pack Conversions</span> (e.g. 1 Strip = 10 Tablets) can be added after saving — reopen this product with the edit button to configure them.
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingProduct ? "Update" : "Add"} Product
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="secondary">{filteredProducts.length} products</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No products found</p>
              {isPharmacist && (
                <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first product
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isPharmacist && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            filteredProducts.length > 0 &&
                            filteredProducts.every((p) => selectedIds.has(p.id))
                          }
                          onCheckedChange={(checked) =>
                            toggleSelectAll(filteredProducts.map((p) => p.id), !!checked)
                          }
                          aria-label="Select all"
                        />
                      </TableHead>
                    )}
                    <TableHead>Name</TableHead>
                    {config.hasStrength && <TableHead>Strength</TableHead>}
                    <TableHead>{config.terms.manufacturer}</TableHead>
                    {config.hasDrugSchedule && <TableHead>Schedule</TableHead>}
                    <TableHead className="text-right">{config.terms.mrp}</TableHead>
                    <TableHead className="text-right">Purchase</TableHead>
                    <TableHead className="text-right">Sale</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                    {isPharmacist && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id} tabIndex={0} data-kb-row
                      className="table-hover-row cursor-pointer focus:bg-accent"
                      onClick={() => setHistoryProduct(product)}
                      onKeyDown={(e) => {
                        const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-kb-row]"));
                        const pos = rows.indexOf(e.currentTarget);
                        if (e.key === "ArrowDown") { e.preventDefault(); rows[pos + 1]?.focus(); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); rows[pos - 1]?.focus(); }
                        else if (e.key === "Enter") { e.preventDefault(); setHistoryProduct(product); }
                        else if ((e.key === "e" || e.key === "E") && isPharmacist) { e.preventDefault(); handleEdit(product); }
                      }}>
                      {isPharmacist && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(product.id)}
                            onCheckedChange={() => toggleSelect(product.id)}
                            aria-label={`Select ${product.name}`}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          {product.generic_name && (
                            <p className="text-sm text-muted-foreground">{product.generic_name}</p>
                          )}
                          {product.composition && (
                            <p className="text-xs text-muted-foreground/70 truncate max-w-[200px]" title={product.composition}>
                              {product.composition}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      {config.hasStrength && (
                        <TableCell className="text-muted-foreground">{product.strength || "-"}</TableCell>
                      )}
                      <TableCell>{product.manufacturer}</TableCell>
                      {config.hasDrugSchedule && (
                        <TableCell>
                          <Badge className={drugScheduleColors[product.drug_schedule]}>
                            {drugScheduleLabels[product.drug_schedule]}
                          </Badge>
                        </TableCell>
                      )}
                      {/* Inline editable MRP */}
                      <TableCell className="text-right font-mono">
                        {editingCell?.id === product.id && editingCell?.field === "mrp" ? (
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              type="number"
                              step="0.01"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-20 h-7 text-right"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveInlineEdit();
                                if (e.key === "Escape") cancelInlineEdit();
                              }}
                            />
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveInlineEdit}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelInlineEdit}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <span 
                            className={isPharmacist ? "cursor-pointer hover:bg-muted px-1 rounded" : ""}
                            onClick={() => isPharmacist && startInlineEdit(product.id, "mrp", product.mrp)}
                          >
                            ₹{Number(product.mrp).toFixed(2)}
                          </span>
                        )}
                      </TableCell>
                      {/* Inline editable Purchase Price */}
                      <TableCell className="text-right font-mono">
                        {editingCell?.id === product.id && editingCell?.field === "purchase_price" ? (
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              type="number"
                              step="0.01"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-20 h-7 text-right"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveInlineEdit();
                                if (e.key === "Escape") cancelInlineEdit();
                              }}
                            />
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveInlineEdit}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelInlineEdit}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <span 
                            className={isPharmacist ? "cursor-pointer hover:bg-muted px-1 rounded" : ""}
                            onClick={() => isPharmacist && startInlineEdit(product.id, "purchase_price", product.purchase_price)}
                          >
                            ₹{Number(product.purchase_price).toFixed(2)}
                          </span>
                        )}
                      </TableCell>
                      {/* Inline editable Sale Price */}
                      <TableCell className="text-right font-mono">
                        {editingCell?.id === product.id && editingCell?.field === "sale_price" ? (
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              type="number"
                              step="0.01"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-20 h-7 text-right"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveInlineEdit();
                                if (e.key === "Escape") cancelInlineEdit();
                              }}
                            />
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={saveInlineEdit}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelInlineEdit}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <span 
                            className={isPharmacist ? "cursor-pointer hover:bg-muted px-1 rounded" : ""}
                            onClick={() => isPharmacist && startInlineEdit(product.id, "sale_price", product.sale_price || 0)}
                          >
                            ₹{Number(product.sale_price || 0).toFixed(2)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{product.gst_percentage}%</TableCell>
                      {isPharmacist && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(product)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handleDelete(product.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ProductHistoryDialog
        open={!!historyProduct}
        onOpenChange={(open) => !open && setHistoryProduct(null)}
        productId={historyProduct?.id || null}
        productName={historyProduct?.name || ""}
      />

      <MergeProductsDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        products={products}
        onMergeComplete={fetchProducts}
      />

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} product(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Review the products below. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 overflow-y-auto border rounded-md p-3 text-sm space-y-1">
            {products
              .filter((p) => selectedIds.has(p.id))
              .map((p) => (
                <div key={p.id} className="flex justify-between gap-2">
                  <span className="font-medium truncate">{p.name}</span>
                  <span className="text-muted-foreground text-xs truncate">{p.manufacturer}</span>
                </div>
              ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleBulkDelete();
              }}
              disabled={bulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
