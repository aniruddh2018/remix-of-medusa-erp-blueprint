import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload, Sparkles, CheckCircle2, XCircle, ShoppingCart, Trash2, Plus } from "lucide-react";

interface Rx {
  id: string;
  company_id: string;
  customer_id: string | null;
  source: string;
  image_url: string | null;
  status: string;
  ai_confidence: number | null;
  sales_order_id: string | null;
  created_at: string;
  customers?: { name: string } | null;
}

interface RxItem {
  id: string;
  prescription_id: string;
  product_id: string | null;
  ai_name: string | null;
  ai_strength: string | null;
  ai_dosage: string | null;
  ai_duration: string | null;
  qty: number;
  confidence: number | null;
  approved: boolean;
  stock_available: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  verified: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  rejected: "bg-destructive/15 text-destructive",
  ordered: "bg-green-500/15 text-green-700 dark:text-green-400",
  fulfilled: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

export default function Prescriptions() {
  const { user, profile } = useAuth() as any;
  const navigate = useNavigate();
  const companyId = profile?.company_id;
  const [list, setList] = useState<Rx[]>([]);
  const [loading, setLoading] = useState(false);
  const [openDetail, setOpenDetail] = useState<Rx | null>(null);
  const [openUpload, setOpenUpload] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("prescriptions")
      .select("*, customers(name)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else setList((data as any) || []);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prescriptions"
        description="Upload prescription → AI extracts medicines → pharmacist verifies → create order."
        actions={
          <Button onClick={() => setOpenUpload(true)}>
            <Upload className="h-4 w-4 mr-2" /> New Prescription
          </Button>
        }
      />

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>AI Conf.</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Order</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
              </TableCell></TableRow>
            )}
            {!loading && list.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                No prescriptions yet. Click "New Prescription" to start.
              </TableCell></TableRow>
            )}
            {list.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenDetail(r)}>
                <TableCell className="text-sm">{new Date(r.created_at).toLocaleString()}</TableCell>
                <TableCell>{r.customers?.name || <span className="text-muted-foreground italic">Walk-in</span>}</TableCell>
                <TableCell className="capitalize text-sm">{r.source}</TableCell>
                <TableCell>{r.ai_confidence != null ? `${Math.round(r.ai_confidence)}%` : "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_COLORS[r.status] || ""}>
                    {r.status.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell>
                  {r.sales_order_id
                    ? <Button size="sm" variant="link" className="p-0 h-auto"
                        onClick={(e) => { e.stopPropagation(); navigate("/sales"); }}>View order</Button>
                    : <span className="text-muted-foreground text-sm">—</span>}
                </TableCell>
                <TableCell />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {openUpload && (
        <UploadDialog
          companyId={companyId}
          userId={user?.id}
          onClose={() => setOpenUpload(false)}
          onCreated={(rx) => { setOpenUpload(false); load(); setOpenDetail(rx); }}
        />
      )}

      {openDetail && (
        <DetailDialog
          rx={openDetail}
          companyId={companyId}
          onClose={() => { setOpenDetail(null); load(); }}
        />
      )}
    </div>
  );
}

// ---------- Upload Dialog ----------
function UploadDialog({ companyId, userId, onClose, onCreated }: {
  companyId: string; userId: string; onClose: () => void; onCreated: (rx: Rx) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [customerId, setCustomerId] = useState<string>("");
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [source, setSource] = useState("upload");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("customers").select("id, name").eq("company_id", companyId)
      .order("name").limit(500).then(({ data }) => setCustomers(data || []));
  }, [companyId]);

  const handleSubmit = async () => {
    if (!file) { toast({ title: "Pick an image", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("prescriptions").upload(path, file);
      if (upErr) throw upErr;

      const { data: rx, error: insErr } = await supabase.from("prescriptions").insert({
        company_id: companyId,
        customer_id: customerId || null,
        source,
        image_url: path,
        uploaded_by: userId,
        status: "pending_review",
      }).select("*").single();
      if (insErr) throw insErr;

      // Kick AI extraction
      toast({ title: "Uploaded", description: "Running AI extraction…" });
      const { error: fnErr } = await supabase.functions.invoke("scan-prescription", {
        body: { prescription_id: rx.id },
      });
      if (fnErr) toast({ title: "AI extraction failed", description: fnErr.message, variant: "destructive" });
      else toast({ title: "AI extraction complete" });

      onCreated(rx as Rx);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Prescription</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Prescription Image</Label>
            <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div>
            <Label>Customer (optional)</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Walk-in" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upload">ERP Upload</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="counter">Counter Walk-in</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={busy || !file}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Upload & Extract
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Detail Dialog ----------
function DetailDialog({ rx, companyId, onClose }: {
  rx: Rx; companyId: string; onClose: () => void;
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState<RxItem[]>([]);
  const [signedUrl, setSignedUrl] = useState<string>("");
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [status, setStatus] = useState(rx.status);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [stocks, setStocks] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from("prescription_items")
      .select("*").eq("prescription_id", rx.id).order("created_at");
    setItems((data as any) || []);
    if (rx.image_url) {
      const path = rx.image_url.replace(/^.*\/prescriptions\//, "");
      const { data: s } = await supabase.storage.from("prescriptions").createSignedUrl(path, 600);
      setSignedUrl(s?.signedUrl || "");
    }
    const { data: prods } = await supabase.from("products").select("id, name")
      .eq("company_id", companyId).order("name").limit(2000);
    setProducts(prods || []);
  }, [rx.id, rx.image_url, companyId]);
  useEffect(() => { load(); }, [load]);

  // Refresh stock from inventory_batches
  useEffect(() => {
    (async () => {
      const ids = items.map((i) => i.product_id).filter(Boolean) as string[];
      if (!ids.length) return;
      const { data } = await supabase.from("inventory_batches")
        .select("product_id, quantity").in("product_id", ids);
      const map: Record<string, number> = {};
      (data || []).forEach((b: any) => {
        map[b.product_id] = (map[b.product_id] || 0) + Number(b.quantity || 0);
      });
      setStocks(map);
    })();
  }, [items]);

  const reScan = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke("scan-prescription",
      { body: { prescription_id: rx.id } });
    setBusy(false);
    if (error) toast({ title: "Scan failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Re-scanned" }); load(); }
  };

  const updateItem = (id: string, patch: Partial<RxItem>) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...patch } : i));
  };

  const saveItem = async (it: RxItem) => {
    await supabase.from("prescription_items").update({
      product_id: it.product_id, ai_name: it.ai_name,
      ai_strength: it.ai_strength, ai_dosage: it.ai_dosage,
      ai_duration: it.ai_duration, qty: it.qty, approved: it.approved,
    }).eq("id", it.id);
  };

  const addItem = async () => {
    const { data } = await supabase.from("prescription_items").insert({
      prescription_id: rx.id, company_id: companyId, ai_name: "", qty: 1, approved: false,
    }).select("*").single();
    if (data) setItems((p) => [...p, data as any]);
  };

  const removeItem = async (id: string) => {
    await supabase.from("prescription_items").delete().eq("id", id);
    setItems((p) => p.filter((i) => i.id !== id));
  };

  const verify = async () => {
    setBusy(true);
    await Promise.all(items.map(saveItem));
    const { error } = await supabase.from("prescriptions").update({
      status: "verified", verified_at: new Date().toISOString(),
    }).eq("id", rx.id);
    setBusy(false);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Verified" }); setStatus("verified"); }
  };

  const reject = async () => {
    setBusy(true);
    const { error } = await supabase.from("prescriptions").update({
      status: "rejected", rejection_reason: rejectReason || "Unreadable / invalid",
    }).eq("id", rx.id);
    setBusy(false);
    if (!error) { toast({ title: "Rejected" }); setStatus("rejected"); }
  };

  const createOrder = async () => {
    const approved = items.filter((i) => i.approved && i.product_id);
    if (!approved.length) {
      toast({ title: "Approve at least one item with a linked product", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // Generate a simple draft order
      const { data: order, error: oErr } = await supabase.from("sales_orders").insert({
        company_id: companyId,
        customer_id: rx.customer_id,
        prescription_id: rx.id,
        status: "draft",
        payment_status: "unpaid",
        subtotal: 0, total: 0,
        order_date: new Date().toISOString().slice(0, 10),
      }).select("*").single();
      if (oErr) throw oErr;

      const rows = approved.map((i) => ({
        sales_order_id: order.id,
        company_id: companyId,
        product_id: i.product_id,
        quantity: i.qty,
        rate: 0, discount: 0, tax: 0, total: 0,
      }));
      const { error: iErr } = await supabase.from("sales_order_items").insert(rows);
      if (iErr) throw iErr;

      await supabase.from("prescriptions").update({
        status: "ordered", sales_order_id: order.id,
      }).eq("id", rx.id);

      toast({ title: "Draft order created", description: "Open Sales to set prices & confirm." });
      setStatus("ordered");
      navigate("/sales");
    } catch (e: any) {
      toast({ title: "Order failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const lowStock = (it: RxItem) =>
    it.product_id && (stocks[it.product_id] ?? 0) < it.qty;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Prescription
            <Badge variant="outline" className={STATUS_COLORS[status] || ""}>
              {status.replace("_", " ")}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="mb-2 block">Original Scan</Label>
            {signedUrl
              ? <img src={signedUrl} alt="Prescription" className="rounded-md border max-h-[500px] object-contain w-full" />
              : <div className="text-muted-foreground text-sm">No image</div>}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={reScan} disabled={busy}>
                <Sparkles className="h-4 w-4 mr-1" /> Re-run AI
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Extracted Medicines</Label>
              <Button size="sm" variant="ghost" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Add line
              </Button>
            </div>

            <div className="space-y-2 max-h-[420px] overflow-auto">
              {items.length === 0 && (
                <p className="text-sm text-muted-foreground">No items extracted yet. Click "Re-run AI" or add manually.</p>
              )}
              {items.map((it) => (
                <Card key={it.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={it.ai_name || ""} placeholder="Medicine name"
                      onChange={(e) => updateItem(it.id, { ai_name: e.target.value })} />
                    {it.confidence != null && (
                      <Badge variant={it.confidence >= 80 ? "default" : "secondary"} className="shrink-0">
                        {Math.round(it.confidence)}%
                      </Badge>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => removeItem(it.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <Input placeholder="Strength" value={it.ai_strength || ""}
                      onChange={(e) => updateItem(it.id, { ai_strength: e.target.value })} />
                    <Input placeholder="Dosage" value={it.ai_dosage || ""}
                      onChange={(e) => updateItem(it.id, { ai_dosage: e.target.value })} />
                    <Input placeholder="Duration" value={it.ai_duration || ""}
                      onChange={(e) => updateItem(it.id, { ai_duration: e.target.value })} />
                    <Input type="number" min={1} value={it.qty}
                      onChange={(e) => updateItem(it.id, { qty: Number(e.target.value) || 1 })} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={it.product_id || ""}
                      onValueChange={(v) => updateItem(it.id, { product_id: v || null })}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Link product…" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {it.product_id && (
                      <Badge variant={lowStock(it) ? "destructive" : "outline"}>
                        Stock: {stocks[it.product_id] ?? 0}
                      </Badge>
                    )}
                    <Button size="sm" variant={it.approved ? "default" : "outline"}
                      onClick={() => updateItem(it.id, { approved: !it.approved })}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      {it.approved ? "Approved" : "Approve"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {status !== "rejected" && (
              <div>
                <Label className="text-xs">Rejection note (optional)</Label>
                <Textarea rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {status === "pending_review" && (
            <>
              <Button variant="destructive" onClick={reject} disabled={busy}>
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
              <Button onClick={verify} disabled={busy}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Verify
              </Button>
            </>
          )}
          {(status === "verified" || status === "pending_review") && (
            <Button onClick={createOrder} disabled={busy}>
              <ShoppingCart className="h-4 w-4 mr-1" /> Create Draft Order
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
