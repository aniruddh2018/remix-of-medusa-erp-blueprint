import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { FileText, Loader2, AlertTriangle, Check, RefreshCw, X } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

export interface ParsedItem {
  product_id: string | null;
  product_name_matched: string;
  product_name_raw: string;
  quantity: number;
  free_quantity: number | null;
  rate: number | null;
  confidence: number;
  mrp?: number;
  purchase_price?: number;
  sale_price?: number;
  gst_percentage?: number;
  hsn_code?: string;
}

interface QuickTextEntryProps {
  type: "sale" | "purchase";
  products: Product[] | undefined;
  onItemsConfirmed: (items: ParsedItem[]) => void;
  triggerLabel?: string;
  availableStock?: Map<string, number>; // product_id -> total available qty
}

export function QuickTextEntry({ type, products, onItemsConfirmed, triggerLabel = "Quick Text Entry", availableStock }: QuickTextEntryProps) {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [step, setStep] = useState<"input" | "review">("input");

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  const handleParse = async () => {
    if (!text.trim() || !companyId) return;
    setIsParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-order-text", {
        body: { text: text.trim(), company_id: companyId, type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setParsedItems(data.items || []);
      setStep("review");
    } catch (err: any) {
      toast({ title: "Parse failed", description: err.message, variant: "destructive" });
    } finally {
      setIsParsing(false);
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...parsedItems];
    (updated[index] as any)[field] = value;
    updated[index] = { ...updated[index] };
    setParsedItems(updated);
  };

  const remapProduct = (index: number, productId: string) => {
    const product = products?.find(p => p.id === productId);
    if (!product) return;
    const updated = [...parsedItems];
    updated[index] = {
      ...updated[index],
      product_id: product.id,
      product_name_matched: `${product.name}${product.strength ? ` ${product.strength}` : ""}`,
      mrp: Number(product.mrp),
      purchase_price: Number(product.purchase_price),
      sale_price: Number(product.sale_price || product.mrp),
      gst_percentage: Number(product.gst_percentage),
      hsn_code: product.hsn_code || "",
      confidence: 1,
    };
    setParsedItems(updated);
  };

  const removeItem = (index: number) => {
    setParsedItems(parsedItems.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    const unmapped = parsedItems.filter(i => !i.product_id);
    if (unmapped.length > 0) {
      toast({ title: "Unmapped items", description: `${unmapped.length} item(s) are not mapped to products. Please map or remove them.`, variant: "destructive" });
      return;
    }
    const itemsToConfirm = [...parsedItems];
    handleClose();
    // Call after close so parent state is stable
    onItemsConfirmed(itemsToConfirm);
  };

  const handleClose = () => {
    setOpen(false);
    setText("");
    setParsedItems([]);
    setStep("input");
  };

  const modal = open ? createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" />
      
      {/* Content */}
      <div
        className="relative z-10 bg-background border border-border rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Quick Text Entry — {type === "sale" ? "Sales Order" : "Purchase Order"}</h2>
            <p className="text-sm text-muted-foreground">Write your order in plain language. AI will parse it and match products automatically.</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {step === "input" && (
          <div className="space-y-4">
            <Textarea
              placeholder={`Type your order here...\n\nExamples:\nparacetamol 10\namox 500 qty 5 rate 45\ncrocin 12+1\ndolo 650 x 20\n\nYou can use broken/partial names, quantity, and optional rate.`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleParse} disabled={!text.trim() || isParsing}>
                {isParsing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Parsing...</> : "Parse & Match"}
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{parsedItems.length} items parsed</Badge>
              <Button variant="ghost" size="sm" onClick={() => setStep("input")} className="gap-1">
                <RefreshCw className="h-3 w-3" /> Edit text
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">You typed</TableHead>
                    <TableHead className="w-[250px]">Matched Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Free</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedItems.map((item, index) => {
                    const totalNeeded = item.quantity + (item.free_quantity || 0);
                    const stockAvailable = item.product_id ? (availableStock?.get(item.product_id) ?? null) : null;
                    const isInsufficient = stockAvailable !== null && stockAvailable < totalNeeded;
                    const isNoStock = stockAvailable !== null && stockAvailable <= 0;
                    return (
                    <TableRow key={index} className={!item.product_id ? "bg-destructive/5" : isInsufficient ? "bg-destructive/10" : ""}>
                      <TableCell className="text-muted-foreground text-sm">{item.product_name_raw}</TableCell>
                      <TableCell>
                        {item.product_id ? (
                          <div>
                            <div className="flex items-center gap-2">
                              <Check className="h-4 w-4 text-green-600 shrink-0" />
                              <span className="text-sm font-medium">{item.product_name_matched}</span>
                            </div>
                            {isNoStock && (
                              <Badge variant="destructive" className="text-xs mt-1 gap-1"><AlertTriangle className="h-3 w-3" />No Stock</Badge>
                            )}
                            {isInsufficient && !isNoStock && (
                              <Badge variant="destructive" className="text-xs mt-1 gap-1"><AlertTriangle className="h-3 w-3" />Low Stock ({stockAvailable})</Badge>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                            <span className="text-sm text-destructive">Not matched</span>
                          </div>
                        )}
                        <Select onValueChange={(v) => remapProduct(index, v)}>
                          <SelectTrigger className="h-7 mt-1 text-xs">
                            <SelectValue placeholder="Change product..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {products?.map(p => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.name}{p.strength ? ` ${p.strength}` : ""} — ₹{p.mrp}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 1)}
                          className="w-16 h-8 text-center"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={item.free_quantity || 0}
                          onChange={(e) => updateItem(index, "free_quantity", parseInt(e.target.value) || 0)}
                          className="w-16 h-8 text-center"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.rate || ""}
                          onChange={(e) => updateItem(index, "rate", parseFloat(e.target.value) || null)}
                          className="w-20 h-8"
                          placeholder={item.product_id ? `₹${type === "sale" ? (item.sale_price || item.mrp) : item.purchase_price}` : "—"}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.confidence >= 0.8 ? "default" : item.confidence >= 0.5 ? "secondary" : "destructive"} className="text-xs">
                          {Math.round(item.confidence * 100)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(index)}>
                          ✕
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={parsedItems.length === 0}>
                Add {parsedItems.length} items to {type === "sale" ? "cart" : "order"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        <FileText className="h-4 w-4" />
        {triggerLabel}
      </Button>
      {modal}
    </>
  );
}
