import { useState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { FileText, Loader2, AlertTriangle, Check, RefreshCw, X, Mic, Square } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

export interface ParsedItem {
  product_id: string | null;
  product_name_matched: string;
  product_name_raw: string;
  quantity: number;
  spoken_unit?: string | null;
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
  const [parseError, setParseError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      // Focus textarea after portal renders
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
      return () => { document.body.style.overflow = ""; clearTimeout(timer); };
    }
  }, [open]);

  const handleParse = async () => {
    if (!text.trim() || !companyId) return;
    setIsParsing(true);
    setParseError(null); // Clear any previous error
    try {
      const { data, error } = await supabase.functions.invoke("parse-order-text", {
        body: { text: text.trim(), company_id: companyId, type },
      });
      if (error) {
        const body = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(body?.error || error.message);
      }
      if (data?.error) throw new Error(data.error);
      setParsedItems(data.items || []);
      setStep("review");
    } catch (err: any) {
      const errorMessage = err.message || "Failed to parse text";
      setParseError(errorMessage);
      toast({ title: "Parse failed", description: errorMessage, variant: "destructive" });
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

    // Remember this correction for next time (voice + text both hit this).
    const rawPhrase = updated[index].product_name_raw?.trim().toLowerCase();
    if (companyId && rawPhrase) {
      (supabase as any)
        .from("company_product_aliases")
        .upsert(
          { company_id: companyId, raw_phrase: rawPhrase, product_id: productId, last_used_at: new Date().toISOString() },
          { onConflict: "company_id,raw_phrase" }
        )
        .then(({ error }: { error: Error | null }) => {
          if (error) console.warn("[QuickTextEntry] alias upsert failed:", error.message);
        });
    }
  };

  const removeItem = (index: number) => {
    setParsedItems(parsedItems.filter((_, i) => i !== index));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        handleVoiceCapture(new Blob(audioChunksRef.current, { type: "audio/webm" }));
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      toast({ title: "Microphone access denied", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleVoiceCapture = async (audioBlob: Blob) => {
    if (!companyId) return;
    setIsTranscribing(true);
    setParseError(null);
    try {
      const audio_base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
      const { data, error } = await supabase.functions.invoke("capture-voice-entry", {
        body: { audio_base64, transaction_type: type },
      });
      if (error) {
        // supabase-js swallows the actual response body for non-2xx edge
        // function responses — the real {error: "..."} message we return
        // server-side is only reachable via error.context, not `data`.
        const body = await (error as any)?.context?.json?.().catch(() => null);
        throw new Error(body?.error || error.message);
      }
      if (data?.error) throw new Error(data.error);

      // Enrich matched items with full product details, same as remapProduct.
      const enriched: ParsedItem[] = (data.line_items || []).map((item: ParsedItem) => {
        const product = products?.find((p) => p.id === item.product_id);
        return {
          ...item,
          product_name_matched: product ? `${product.name}${product.strength ? ` ${product.strength}` : ""}` : "",
          mrp: product ? Number(product.mrp) : undefined,
          purchase_price: product ? Number(product.purchase_price) : undefined,
          sale_price: product ? Number(product.sale_price || product.mrp) : undefined,
          gst_percentage: product ? Number(product.gst_percentage) : undefined,
          hsn_code: product?.hsn_code || "",
        };
      });
      setParsedItems(enriched);
      setStep("review");
    } catch (err: any) {
      const errorMessage = err.message || "Failed to process voice note";
      setParseError(errorMessage);
      toast({ title: "Voice capture failed", description: errorMessage, variant: "destructive" });
    } finally {
      setIsTranscribing(false);
    }
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
    setParseError(null); // Clear parse error
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-2" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        <FileText className="h-4 w-4" />
        {triggerLabel}
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        <FileText className="h-4 w-4" />
        {triggerLabel}
      </Button>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/80 pointer-events-none" />
        
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
                ref={textareaRef}
                placeholder={`Type your order here...\n\nExamples:\nparacetamol 10\namox 500 qty 5 rate 45\ncrocin 12+1\ndolo 650 x 20\n\nYou can use broken/partial names, quantity, and optional rate.`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
              />
              {parseError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <p className="text-sm text-destructive font-medium">Parse Error</p>
                  <p className="text-sm text-destructive/80">{parseError}</p>
                </div>
              )}
              <div className="flex justify-between items-center gap-2">
                <Button
                  variant={isRecording ? "destructive" : "outline"}
                  size="sm"
                  className="gap-2"
                  disabled={isTranscribing}
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  {isTranscribing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Transcribing...</>
                  ) : isRecording ? (
                    <><Square className="h-4 w-4" /> Stop</>
                  ) : (
                    <><Mic className="h-4 w-4" /> Voice Entry</>
                  )}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleClose}>Cancel</Button>
                  <Button onClick={handleParse} disabled={!text.trim() || isParsing}>
                    {isParsing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Parsing...</> : "Parse & Match"}
                  </Button>
                </div>
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
                          {item.spoken_unit && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 text-center">
                              from "{item.spoken_unit}" — verify converted qty
                            </div>
                          )}
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
      </div>
    </>
  );
}
