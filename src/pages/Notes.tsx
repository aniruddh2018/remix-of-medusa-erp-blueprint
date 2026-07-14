import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, RotateCcw, FileText, Printer, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { CreditNoteDialog } from "@/components/dialogs/CreditNoteDialog";
import { DebitNoteDialog } from "@/components/dialogs/DebitNoteDialog";
import { printNote } from "@/utils/notePrint";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type CreditNote = Tables<"credit_notes">;
type DebitNote = Tables<"debit_notes">;

export default function Notes() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [debitNoteOpen, setDebitNoteOpen] = useState(false);
  const [editingCN, setEditingCN] = useState<CreditNote | null>(null);
  const [editingDN, setEditingDN] = useState<DebitNote | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "credit" | "debit"; id: string; number: string } | null>(null);

  const { data: creditNotes, isLoading: cnLoading } = useQuery({
    queryKey: ["credit-notes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_notes").select("*").eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CreditNote[];
    },
    enabled: !!companyId,
  });

  const { data: debitNotes, isLoading: dnLoading } = useQuery({
    queryKey: ["debit-notes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debit_notes").select("*").eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DebitNote[];
    },
    enabled: !!companyId,
  });

  const filteredCN = creditNotes?.filter((cn) =>
    cn.credit_note_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cn.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cn.original_invoice_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDN = debitNotes?.filter((dn) =>
    dn.debit_note_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    dn.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    dn.original_order_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const deleteMutation = useMutation({
    mutationFn: async (t: { kind: "credit" | "debit"; id: string }) => {
      if (t.kind === "credit") {
        // Reverse inventory for CN items with batch
        const { data: items } = await supabase.from("credit_note_items")
          .select("batch_id, quantity").eq("credit_note_id", t.id);
        for (const it of items || []) {
          if (it.batch_id) {
            const { data: b } = await supabase.from("inventory_batches")
              .select("quantity").eq("id", it.batch_id).single();
            if (b) await supabase.from("inventory_batches")
              .update({ quantity: Math.max(0, (b.quantity || 0) - Number(it.quantity)) })
              .eq("id", it.batch_id);
          }
        }
        await supabase.from("credit_note_items").delete().eq("credit_note_id", t.id);
        const { error } = await supabase.from("credit_notes").delete().eq("id", t.id);
        if (error) throw error;
      } else {
        await supabase.from("debit_note_items").delete().eq("debit_note_id", t.id);
        const { error } = await supabase.from("debit_notes").delete().eq("id", t.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      queryClient.invalidateQueries({ queryKey: ["debit-notes"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      toast({ title: "Deleted", description: "Note removed successfully." });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const handlePrint = (kind: "credit" | "debit", id: string) => {
    if (!companyId) return;
    void printNote(kind, id, companyId);
  };

  const handleEditCN = (cn: CreditNote) => { setEditingCN(cn); setCreditNoteOpen(true); };
  const handleEditDN = (dn: DebitNote) => { setEditingDN(dn); setDebitNoteOpen(true); };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Credit & Debit Notes</h1>
          <p className="text-muted-foreground">Manage sales returns (CN) and purchase returns (DN)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => { setEditingCN(null); setCreditNoteOpen(true); }}>
            <RotateCcw className="h-4 w-4" /> Issue Credit Note
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => { setEditingDN(null); setDebitNoteOpen(true); }}>
            <RotateCcw className="h-4 w-4" /> Issue Debit Note
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by note number, customer, supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="credit">
            <TabsList>
              <TabsTrigger value="credit" className="gap-2">
                <span className="text-destructive font-semibold text-xs">CN</span>
                Credit Notes
                {creditNotes && <Badge variant="secondary" className="ml-1">{creditNotes.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="debit" className="gap-2">
                <span className="font-semibold text-xs">DN</span>
                Debit Notes
                {debitNotes && <Badge variant="secondary" className="ml-1">{debitNotes.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            {/* Credit Notes */}
            <TabsContent value="credit" className="mt-4">
              {cnLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading credit notes...</div>
              ) : filteredCN?.length === 0 ? (
                <div className="text-center py-10">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No credit notes found.</p>
                  <p className="text-sm text-muted-foreground mt-1">Issue a credit note when a customer returns goods.</p>
                  <Button className="mt-4 gap-2" variant="outline" onClick={() => { setEditingCN(null); setCreditNoteOpen(true); }}>
                    <RotateCcw className="h-4 w-4" /> Issue First Credit Note
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CN Number</TableHead>
                        <TableHead>Original Invoice</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Credit Amt</TableHead>
                        <TableHead className="text-right w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCN?.map((cn) => (
                        <TableRow key={cn.id} className="outline-none">
                          <TableCell className="font-medium text-destructive">{cn.credit_note_number}</TableCell>
                          <TableCell className="text-muted-foreground">{cn.original_invoice_number}</TableCell>
                          <TableCell>
                            <div>{cn.customer_name}</div>
                            {cn.customer_phone && <div className="text-xs text-muted-foreground">{cn.customer_phone}</div>}
                          </TableCell>
                          <TableCell className="max-w-48 truncate text-sm">{cn.reason}</TableCell>
                          <TableCell>{format(new Date(cn.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell><Badge variant="outline">{cn.status}</Badge></TableCell>
                          <TableCell className="text-right font-mono text-destructive font-medium">
                            ₹{Number(cn.total_amount).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Print" onClick={() => handlePrint("credit", cn.id)}>
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => handleEditCN(cn)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                title="Delete"
                                onClick={() => setDeleteTarget({ kind: "credit", id: cn.id, number: cn.credit_note_number })}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Debit Notes */}
            <TabsContent value="debit" className="mt-4">
              {dnLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading debit notes...</div>
              ) : filteredDN?.length === 0 ? (
                <div className="text-center py-10">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No debit notes found.</p>
                  <p className="text-sm text-muted-foreground mt-1">Issue a debit note when returning goods to a supplier.</p>
                  <Button className="mt-4 gap-2" variant="outline" onClick={() => { setEditingDN(null); setDebitNoteOpen(true); }}>
                    <RotateCcw className="h-4 w-4" /> Issue First Debit Note
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>DN Number</TableHead>
                        <TableHead>Original Bill</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Debit Amt</TableHead>
                        <TableHead className="text-right w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDN?.map((dn) => (
                        <TableRow key={dn.id} className="outline-none">
                          <TableCell className="font-medium">{dn.debit_note_number}</TableCell>
                          <TableCell className="text-muted-foreground">{dn.original_order_number}</TableCell>
                          <TableCell>{dn.supplier_name}</TableCell>
                          <TableCell className="max-w-48 truncate text-sm">{dn.reason}</TableCell>
                          <TableCell>{format(new Date(dn.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell><Badge variant="outline">{dn.status}</Badge></TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            ₹{Number(dn.total_amount).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Print" onClick={() => handlePrint("debit", dn.id)}>
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => handleEditDN(dn)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                title="Delete"
                                onClick={() => setDeleteTarget({ kind: "debit", id: dn.id, number: dn.debit_note_number })}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <CreditNoteDialog
        open={creditNoteOpen}
        onOpenChange={(o) => { setCreditNoteOpen(o); if (!o) setEditingCN(null); }}
        editingNote={editingCN}
      />
      <DebitNoteDialog
        open={debitNoteOpen}
        onOpenChange={(o) => { setDebitNoteOpen(o); if (!o) setEditingDN(null); }}
        editingNote={editingDN}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.kind === "credit" ? "Credit" : "Debit"} Note?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.number} will be permanently removed.
              {deleteTarget?.kind === "credit" && " Inventory restored by this note will be reversed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate({ kind: deleteTarget.kind, id: deleteTarget.id })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
