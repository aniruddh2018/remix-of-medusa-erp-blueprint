import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, RotateCcw, FileText } from "lucide-react";
import { format } from "date-fns";
import { CreditNoteDialog } from "@/components/dialogs/CreditNoteDialog";
import { DebitNoteDialog } from "@/components/dialogs/DebitNoteDialog";

export default function Notes() {
  const { companyId } = useBusiness();
  const [searchQuery, setSearchQuery] = useState("");
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [debitNoteOpen, setDebitNoteOpen] = useState(false);

  const { data: creditNotes, isLoading: cnLoading } = useQuery({
    queryKey: ["credit-notes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_notes")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: debitNotes, isLoading: dnLoading } = useQuery({
    queryKey: ["debit-notes", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debit_notes")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const filteredCN = creditNotes?.filter(
    (cn) =>
      cn.credit_note_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cn.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cn.original_invoice_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDN = debitNotes?.filter(
    (dn) =>
      dn.debit_note_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dn.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dn.original_order_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Credit & Debit Notes</h1>
          <p className="text-muted-foreground">Manage sales returns (CN) and purchase returns (DN)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setCreditNoteOpen(true)}>
            <RotateCcw className="h-4 w-4" />
            Issue Credit Note
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setDebitNoteOpen(true)}>
            <RotateCcw className="h-4 w-4" />
            Issue Debit Note
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
                  <Button className="mt-4 gap-2" variant="outline" onClick={() => setCreditNoteOpen(true)}>
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCN?.map((cn) => (
                        <TableRow
                          key={cn.id}
                          tabIndex={0}
                          data-kb-row
                          className="cursor-pointer focus:bg-accent outline-none"
                          onKeyDown={(e) => {
                            const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-kb-row]"));
                            const pos = rows.indexOf(e.currentTarget);
                            if (e.key === "ArrowDown") { e.preventDefault(); rows[pos + 1]?.focus(); }
                            else if (e.key === "ArrowUp") { e.preventDefault(); rows[pos - 1]?.focus(); }
                          }}
                        >
                          <TableCell className="font-medium text-destructive">{cn.credit_note_number}</TableCell>
                          <TableCell className="text-muted-foreground">{cn.original_invoice_number}</TableCell>
                          <TableCell>
                            <div>{cn.customer_name}</div>
                            {cn.customer_phone && <div className="text-xs text-muted-foreground">{cn.customer_phone}</div>}
                          </TableCell>
                          <TableCell className="max-w-48 truncate text-sm">{cn.reason}</TableCell>
                          <TableCell>{format(new Date(cn.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{cn.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-destructive font-medium">
                            ₹{Number(cn.total_amount).toFixed(2)}
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
                  <Button className="mt-4 gap-2" variant="outline" onClick={() => setDebitNoteOpen(true)}>
                    <RotateCcw className="h-4 w-4" /> Issue First Debit Note
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>DN Number</TableHead>
                        <TableHead>Original Order</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Debit Amt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDN?.map((dn) => (
                        <TableRow
                          key={dn.id}
                          tabIndex={0}
                          data-kb-row
                          className="cursor-pointer focus:bg-accent outline-none"
                          onKeyDown={(e) => {
                            const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-kb-row]"));
                            const pos = rows.indexOf(e.currentTarget);
                            if (e.key === "ArrowDown") { e.preventDefault(); rows[pos + 1]?.focus(); }
                            else if (e.key === "ArrowUp") { e.preventDefault(); rows[pos - 1]?.focus(); }
                          }}
                        >
                          <TableCell className="font-medium">{dn.debit_note_number}</TableCell>
                          <TableCell className="text-muted-foreground">{dn.original_order_number}</TableCell>
                          <TableCell>{dn.supplier_name}</TableCell>
                          <TableCell className="max-w-48 truncate text-sm">{dn.reason}</TableCell>
                          <TableCell>{format(new Date(dn.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{dn.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            ₹{Number(dn.total_amount).toFixed(2)}
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

      <CreditNoteDialog open={creditNoteOpen} onOpenChange={setCreditNoteOpen} />
      <DebitNoteDialog open={debitNoteOpen} onOpenChange={setDebitNoteOpen} />
    </div>
  );
}
