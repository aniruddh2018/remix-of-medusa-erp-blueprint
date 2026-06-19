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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Save, Loader2, FileText, Percent, BadgePercent, Pill } from "lucide-react";

const SCHEDULE_LABELS: Record<string, { label: string; hint: string }> = {
  schedule_h: { label: "Schedule H", hint: "Most prescription drugs (antibiotics, antihypertensives, etc.)" },
  schedule_h1: { label: "Schedule H1", hint: "Higher-risk antibiotics & habit-forming drugs (register required)" },
  schedule_x: { label: "Schedule X", hint: "Psychotropic drugs (strict register, 2-yr record)" },
  narcotic: { label: "Narcotic", hint: "NDPS Act controlled — strictest compliance" },
};

export function InvoiceSettingsSection() {
  const { companyId, config } = useBusiness();
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
    quotation_prefix: "QT-",
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
    // Discount settings
    discount_mode: "both" as string,
    show_discount_row: true,
    enable_bill_discount: true,
    bill_discount_mode: "both" as string,
    max_discount_admin: 100,
    max_discount_pharmacist: 50,
    max_discount_staff: 15,
    discount_before_tax: true,
    show_batch_column: true,
    show_expiry_column: true,
    show_free_qty_column: true,
    show_hsn_column: true,
    show_tax_amount_column: false,
    show_rate_column: true,
    show_roundoff: true,
    show_gst_split: true,
    show_salesperson: false,
    allow_negative_stock: false,
    prescription_check: {
      schedule_h: false,
      schedule_h1: true,
      schedule_x: true,
      narcotic: true,
    } as Record<string, boolean>,
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
      const s = settings as any;
      setForm({
        company_name: s.company_name || "",
        company_address: s.company_address || "",
        company_phone: s.company_phone || "",
        company_email: s.company_email || "",
        company_gstin: s.company_gstin || "",
        company_state: s.company_state || "",
        invoice_prefix: s.invoice_prefix || "INV-",
        quotation_prefix: s.quotation_prefix || "QT-",
        terms_and_conditions: s.terms_and_conditions || "",
        show_ship_to: s.show_ship_to ?? true,
        show_due_date: s.show_due_date ?? true,
        show_previous_balance: s.show_previous_balance ?? true,
        show_tax_summary: s.show_tax_summary ?? true,
        show_amount_in_words: s.show_amount_in_words ?? true,
        show_customer_gstin: s.show_customer_gstin ?? true,
        bank_name: s.bank_name || "",
        bank_account_number: s.bank_account_number || "",
        bank_ifsc: s.bank_ifsc || "",
        bank_branch: s.bank_branch || "",
        bank_account_holder: s.bank_account_holder || "",
        discount_mode: s.discount_mode || "both",
        show_discount_row: s.show_discount_row ?? true,
        enable_bill_discount: s.enable_bill_discount ?? true,
        bill_discount_mode: s.bill_discount_mode || "both",
        max_discount_admin: Number(s.max_discount_admin) || 100,
        max_discount_pharmacist: Number(s.max_discount_pharmacist) || 50,
        max_discount_staff: Number(s.max_discount_staff) || 15,
        discount_before_tax: s.discount_before_tax ?? true,
        show_batch_column: s.show_batch_column ?? true,
        show_expiry_column: s.show_expiry_column ?? true,
        show_free_qty_column: s.show_free_qty_column ?? true,
        show_hsn_column: s.show_hsn_column ?? true,
        show_tax_amount_column: s.show_tax_amount_column ?? false,
        show_rate_column: s.show_rate_column ?? true,
        show_roundoff: s.show_roundoff ?? true,
        show_gst_split: s.show_gst_split ?? true,
        show_salesperson: s.show_salesperson ?? false,
        allow_negative_stock: s.allow_negative_stock ?? false,
        prescription_check: {
          schedule_h: s.prescription_check?.schedule_h ?? false,
          schedule_h1: s.prescription_check?.schedule_h1 ?? true,
          schedule_x: s.prescription_check?.schedule_x ?? true,
          narcotic: s.prescription_check?.narcotic ?? true,
        },
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("No company ID");
      
      if (settings) {
        const { error } = await supabase
          .from("invoice_settings")
          .update({ ...form } as any)
          .eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("invoice_settings")
          .insert({ ...form, company_id: companyId } as any);
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
                  { key: "show_batch_column" as const, label: "Show Batch Column on Invoice" },
                  { key: "show_expiry_column" as const, label: "Show Expiry Column on Invoice" },
                  { key: "show_free_qty_column" as const, label: "Show Free Qty Column" },
                  { key: "show_hsn_column" as const, label: "Show HSN Column" },
                  { key: "show_tax_amount_column" as const, label: "Show Tax Amount Column" },
                  { key: "show_rate_column" as const, label: "Show Rate Column" },
                  { key: "show_roundoff" as const, label: "Show Round Off" },
                  { key: "show_gst_split" as const, label: "Show CGST/SGST Split" },
                  { key: "show_salesperson" as const, label: "Show Salesperson" },
                ].map(toggle => (
                  <div key={toggle.key} className="flex items-center justify-between">
                    <Label className="cursor-pointer">{toggle.label}</Label>
                    <Switch
                      checked={form[toggle.key]}
                      onCheckedChange={v => setForm(f => ({ ...f, [toggle.key]: v }))}
                    />
                  </div>
                ))}

                <Separator className="my-2" />

                {/* Inventory behavior */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="cursor-pointer">Allow Negative Stock</Label>
                    <p className="text-xs text-muted-foreground">Allow billing products even when stock is 0 or insufficient (override).</p>
                  </div>
                  <Switch
                    checked={form.allow_negative_stock}
                    onCheckedChange={v => setForm(f => ({ ...f, allow_negative_stock: v }))}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Discount Policy Settings */}
            <div>
              <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
                <BadgePercent className="h-4 w-4" />
                Discount Policy
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Configure how discounts work in your billing system
              </p>

              <div className="space-y-5">
                {/* Item-level discount mode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Item Discount Type</Label>
                    <Select value={form.discount_mode} onValueChange={v => setForm(f => ({ ...f, discount_mode: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage (%) only</SelectItem>
                        <SelectItem value="flat">Flat amount (₹) only</SelectItem>
                        <SelectItem value="both">Both (% and ₹)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">How discounts are entered per product row</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Discount Calculation</Label>
                    <Select value={form.discount_before_tax ? "before" : "after"} onValueChange={v => setForm(f => ({ ...f, discount_before_tax: v === "before" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="before">Discount before tax (on base price)</SelectItem>
                        <SelectItem value="after">Discount after tax (on total)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">When to apply discount in price calculation</p>
                  </div>
                </div>

                {/* Show discount row on bill */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="cursor-pointer">Show Discount Row on Invoice</Label>
                    <p className="text-xs text-muted-foreground">Display subtotal without discount, then a separate discount line</p>
                  </div>
                  <Switch
                    checked={form.show_discount_row}
                    onCheckedChange={v => setForm(f => ({ ...f, show_discount_row: v }))}
                  />
                </div>

                <Separator className="my-2" />

                {/* Bill-level discount */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="cursor-pointer">Enable Bill-Level Discount</Label>
                    <p className="text-xs text-muted-foreground">Allow an overall discount on the entire bill total</p>
                  </div>
                  <Switch
                    checked={form.enable_bill_discount}
                    onCheckedChange={v => setForm(f => ({ ...f, enable_bill_discount: v }))}
                  />
                </div>

                {form.enable_bill_discount && (
                  <div className="space-y-2 pl-4 border-l-2 border-primary/20">
                    <Label>Bill Discount Type</Label>
                    <Select value={form.bill_discount_mode} onValueChange={v => setForm(f => ({ ...f, bill_discount_mode: v }))}>
                      <SelectTrigger className="w-full sm:w-[250px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage (%) only</SelectItem>
                        <SelectItem value="flat">Flat amount (₹) only</SelectItem>
                        <SelectItem value="both">Both (% and ₹)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Separator className="my-2" />

                {/* Role-based discount limits */}
                <div>
                  <Label className="flex items-center gap-2 mb-1">
                    <Percent className="h-3.5 w-3.5" />
                    Maximum Discount Limits (by Role)
                  </Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Set the maximum discount percentage each role can apply per item
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Admin Max (%)</Label>
                      <Input
                        type="number" min={0} max={100}
                        value={form.max_discount_admin}
                        onChange={e => setForm(f => ({ ...f, max_discount_admin: Number(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Pharmacist Max (%)</Label>
                      <Input
                        type="number" min={0} max={100}
                        value={form.max_discount_pharmacist}
                        onChange={e => setForm(f => ({ ...f, max_discount_pharmacist: Number(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Staff Max (%)</Label>
                      <Input
                        type="number" min={0} max={100}
                        value={form.max_discount_staff}
                        onChange={e => setForm(f => ({ ...f, max_discount_staff: Number(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {config.hasDrugSchedule && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
                    <Pill className="h-4 w-4" />
                    Prescription Check (per Schedule)
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    When enabled, sales of products in that schedule require a Doctor, Prescription Date and Duration.
                    Admins can override warnings; staff & pharmacists are blocked.
                  </p>
                  <div className="space-y-3 rounded-md border p-3 bg-muted/20">
                    {(["schedule_h", "schedule_h1", "schedule_x", "narcotic"] as const).map((key) => (
                      <div key={key} className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <Label className="cursor-pointer text-sm">{SCHEDULE_LABELS[key].label}</Label>
                          <p className="text-xs text-muted-foreground">{SCHEDULE_LABELS[key].hint}</p>
                        </div>
                        <Switch
                          checked={!!form.prescription_check[key]}
                          onCheckedChange={(v) =>
                            setForm((f) => ({
                              ...f,
                              prescription_check: { ...f.prescription_check, [key]: v },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

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
