import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Merge, ArrowRight, AlertTriangle } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Product = Database["public"]["Tables"]["products"]["Row"];

interface MergeProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  onMergeComplete: () => void;
}

export function MergeProductsDialog({
  open,
  onOpenChange,
  products,
  onMergeComplete,
}: MergeProductsDialogProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [step, setStep] = useState<"select" | "confirm">("select");

  const activeProducts = products.filter((p) => p.is_active);

  const filtered = activeProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.manufacturer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.generic_name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  const toggleProduct = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
      if (primaryId === id) setPrimaryId(null);
    } else {
      next.add(id);
      if (!primaryId) setPrimaryId(id);
    }
    setSelectedIds(next);
  };

  const selectedProducts = activeProducts.filter((p) => selectedIds.has(p.id));
  const duplicateIds = [...selectedIds].filter((id) => id !== primaryId);
  const primaryProduct = activeProducts.find((p) => p.id === primaryId);

  const handleMerge = async () => {
    if (!primaryId || duplicateIds.length === 0) return;
    setMerging(true);

    try {
      const { data, error } = await supabase.functions.invoke("merge-products", {
        body: {
          primary_product_id: primaryId,
          duplicate_product_ids: duplicateIds,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Products merged successfully",
        description: `${duplicateIds.length} duplicate(s) merged into "${primaryProduct?.name}"`,
      });

      resetState();
      onOpenChange(false);
      onMergeComplete();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Merge failed",
        description: error.message,
      });
    } finally {
      setMerging(false);
    }
  };

  const resetState = () => {
    setSelectedIds(new Set());
    setPrimaryId(null);
    setSearchTerm("");
    setStep("select");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetState();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge Duplicate Products
          </DialogTitle>
          <DialogDescription>
            {step === "select"
              ? "Select 2 or more duplicate products, then choose which one to keep as primary."
              : "Review the merge. All inventory, sales, and purchase records will be moved to the primary product."}
          </DialogDescription>
        </DialogHeader>

        {step === "select" ? (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products to merge..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {selectedIds.size > 0 && (
              <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50 border">
                <span className="text-sm text-muted-foreground mr-1 self-center">Selected:</span>
                {selectedProducts.map((p) => (
                  <Badge
                    key={p.id}
                    variant={p.id === primaryId ? "default" : "secondary"}
                    className="cursor-pointer"
                    onClick={() => setPrimaryId(p.id)}
                  >
                    {p.id === primaryId && "★ "}
                    {p.name}
                    {p.id === primaryId && " (Primary)"}
                  </Badge>
                ))}
                <p className="w-full text-xs text-muted-foreground mt-1">
                  Click a badge to set it as primary (the one to keep)
                </p>
              </div>
            )}

            <ScrollArea className="flex-1 max-h-[350px] border rounded-lg">
              <div className="divide-y">
                {filtered.map((product) => (
                  <label
                    key={product.id}
                    className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selectedIds.has(product.id)}
                      onCheckedChange={() => toggleProduct(product.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.manufacturer}
                        {product.strength && ` • ${product.strength}`}
                        {product.generic_name && ` • ${product.generic_name}`}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>MRP: ₹{Number(product.mrp).toFixed(2)}</p>
                      <p>PP: ₹{Number(product.purchase_price).toFixed(2)}</p>
                    </div>
                    {selectedIds.has(product.id) && product.id === primaryId && (
                      <Badge variant="default" className="text-xs">Primary</Badge>
                    )}
                  </label>
                ))}
                {filtered.length === 0 && (
                  <p className="text-center text-muted-foreground py-8 text-sm">No products found</p>
                )}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                disabled={selectedIds.size < 2 || !primaryId}
                onClick={() => setStep("confirm")}
              >
                Next: Review Merge
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 flex gap-3">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">This action cannot be undone.</p>
                  <p className="text-muted-foreground mt-1">
                    All inventory batches, sales records, purchase orders, credit/debit notes,
                    and scheduled drug entries from the duplicates will be reassigned to the primary product.
                    Duplicate products will be deactivated.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg border bg-primary/5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Primary Product (Keeping)
                </p>
                {primaryProduct && (
                  <div>
                    <p className="font-semibold">{primaryProduct.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {primaryProduct.manufacturer}
                      {primaryProduct.strength && ` • ${primaryProduct.strength}`}
                    </p>
                    <p className="text-sm mt-1">
                      MRP: ₹{Number(primaryProduct.mrp).toFixed(2)} | PP: ₹{Number(primaryProduct.purchase_price).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-lg border bg-destructive/5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Duplicates (Will be deactivated)
                </p>
                <div className="space-y-2">
                  {selectedProducts
                    .filter((p) => p.id !== primaryId)
                    .map((p) => (
                      <div key={p.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.manufacturer}</p>
                        </div>
                        <Badge variant="destructive" className="text-xs">
                          Deactivate
                        </Badge>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button variant="destructive" onClick={handleMerge} disabled={merging}>
                {merging && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Merge {duplicateIds.length} Product{duplicateIds.length > 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
