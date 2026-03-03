import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, FileText } from "lucide-react";

export function InvoiceSettingsSection() {
  const { companyId } = useBusiness();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    company_name: "",
    company_address: "",
    company_phone: "",
    company_email: "",
    company_gstin: "",
    company_state: "",
    invoice_prefix: "INV-",
    terms_and_conditions: "Thanks for doing business with us!",
    show_ship_to: true,
    show_due_date: true,
    show_previous_balance: true,
    show_tax_summary: true,
    show_amount_in_words: true,
    show_customer_gstin: true,
    bank_name: "",
    bank_account_number: "",
    bank_ifsc: "",
    bank_branch: "",
    bank_account_holder: "",
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["invoice-settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("invoice_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        company_name: settings.company_name || "",
        company_address: settings.company_address || "",
        company_phone: settings.company_phone || "",
        company_email: settings.company_email || "",
        company_gstin: settings.company_gstin || "",
        company_state: settings.company_state || "",
        invoice_prefix: settings.invoice_prefix || "INV-",
        terms_and_conditions: settings.terms_and_conditions || "",
        show_ship_to: settings.show_ship_to ?? true,
        show_due_date: settings.show_due_date ?? true,
        show_previous_balance: settings.show_previous_balance ?? true,
        show_tax_summary: settings.show_tax_summary ?? true,
        show_amount_in_words: settings.show_amount_in_words ?? true,
        show_customer_gstin: (settings as any).show_customer_gstin ?? true,
        bank_name: (settings as any).bank_name || "",
        bank_account_number: (settings as any).bank_account_number || "",
        bank_ifsc: (settings as any).bank_ifsc || "",
        bank_branch: (settings as any).bank_branch || "",
        bank_account_holder: (settings as any).bank_account_holder || "",
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company ID");
      
      if (settings) {
        const { error } = await supabase
          .from("invoice_settings")
          .update({ ...form })
          .eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("invoice_settings")
          .insert({ ...form, company_id: companyId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-settings"] });
      toast({ title: "Invoice settings saved", description: "Your invoice format has been updated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Invoice Format Settings
        </CardTitle>
        <CardDescription>Configure how your invoices look when printed or exported</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">Loading settings...</div>
        ) : (
          <>
            {/* Company Details */}
            <div>
              <h3 className="font-semibold text-sm mb-3">Company Details (shown on invoice header)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Your Business Name" />
                </div>
                <div className="space-y-2">
                  <Label>GSTIN</Label>
                  <Input value={form.company_gstin} onChange={e => setForm(f => ({ ...f, company_gstin: e.target.value }))} placeholder="22AAAAA0000A1Z5" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={form.company_phone} onChange={e => setForm(f => ({ ...f, company_phone: e.target.value }))} placeholder="9876543210" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={form.company_email} onChange={e => setForm(f => ({ ...f, company_email: e.target.value }))} placeholder="business@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input value={form.company_state} onChange={e => setForm(f => ({ ...f, company_state: e.target.value }))} placeholder="23-Madhya Pradesh" />
                </div>
                <div className="space-y-2">
                  <Label>Invoice Number Prefix</Label>
                  <Input value={form.invoice_prefix} onChange={e => setForm(f => ({ ...f, invoice_prefix: e.target.value }))} placeholder="INV-" />
                </div>
              </div>
              <div className="space-y-2 mt-4">
                <Label>Company Address</Label>
                <Textarea value={form.company_address} onChange={e => setForm(f => ({ ...f, company_address: e.target.value }))} placeholder="Full business address" rows={2} />
              </div>
            </div>

            {/* Toggle Sections */}
            <div>
              <h3 className="font-semibold text-sm mb-3">Invoice Sections</h3>
              <div className="space-y-3">
                {[
                  { key: "show_ship_to" as const, label: "Show Ship To section" },
                  { key: "show_due_date" as const, label: "Show Due Date" },
                  { key: "show_previous_balance" as const, label: "Show Previous Balance" },
                  { key: "show_tax_summary" as const, label: "Show HSN-wise Tax Summary (CGST/SGST)" },
                  { key: "show_amount_in_words" as const, label: "Show Amount in Words" },
                  { key: "show_customer_gstin" as const, label: "Show Customer GST Number" },
                ].map(toggle => (
                  <div key={toggle.key} className="flex items-center justify-between">
                    <Label className="cursor-pointer">{toggle.label}</Label>
                    <Switch
                      checked={form[toggle.key]}
                      onCheckedChange={v => setForm(f => ({ ...f, [toggle.key]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Bank Details */}
            <div>
              <h3 className="font-semibold text-sm mb-3">Bank Details (shown on invoice)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Account Holder Name</Label>
                  <Input value={form.bank_account_holder} onChange={e => setForm(f => ({ ...f, bank_account_holder: e.target.value }))} placeholder="Account holder name" />
                </div>
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="e.g. State Bank of India" />
                </div>
                <div className="space-y-2">
                  <Label>Account Number</Label>
                  <Input value={form.bank_account_number} onChange={e => setForm(f => ({ ...f, bank_account_number: e.target.value }))} placeholder="Account number" />
                </div>
                <div className="space-y-2">
                  <Label>IFSC Code</Label>
                  <Input value={form.bank_ifsc} onChange={e => setForm(f => ({ ...f, bank_ifsc: e.target.value }))} placeholder="e.g. SBIN0001234" />
                </div>
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Input value={form.bank_branch} onChange={e => setForm(f => ({ ...f, bank_branch: e.target.value }))} placeholder="Branch name" />
                </div>
              </div>
            </div>

            {/* Terms & Conditions */}
            <div className="space-y-2">
              <Label>Terms & Conditions</Label>
              <Textarea
                value={form.terms_and_conditions}
                onChange={e => setForm(f => ({ ...f, terms_and_conditions: e.target.value }))}
                placeholder="Enter terms & conditions shown at the bottom of invoices"
                rows={3}
              />
            </div>

            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Invoice Settings
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
