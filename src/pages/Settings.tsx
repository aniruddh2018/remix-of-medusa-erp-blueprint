import { useState } from "react";
import { useBusiness, type BusinessType, BUSINESS_CONFIGS } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Building2, CheckCircle2, Loader2, Pill, Cpu, ShoppingBag, Save, Lock, Briefcase } from "lucide-react";
import { BackupSection } from "@/components/BackupSection";
import { OfflineRecoverySection } from "@/components/OfflineRecoverySection";
import { BackfillUnitsSection } from "@/components/BackfillUnitsSection";
import { InvoiceSettingsSection } from "@/components/InvoiceSettingsSection";
import { FormConfigEditor } from "@/components/settings/FormConfigEditor";
import { WhatsAppTemplatesSection } from "@/components/settings/WhatsAppTemplatesSection";
import { TwilioSection } from "@/components/settings/TwilioSection";
import { GSTSetupSection } from "@/components/settings/GSTSetupSection";

const iconMap: Record<BusinessType, React.ElementType> = {
  pharmacy: Pill,
  pharmacy_b2b: Briefcase,
  b2b_electronics: Cpu,
  general_trading: ShoppingBag,
};

const descriptionMap: Record<BusinessType, string> = {
  pharmacy: "Drug scheduling, batch tracking, expiry management, prescription handling",
  pharmacy_b2b: "Pharmacy with B2B invoicing, GST-mandatory customers, batch & drug features",
  b2b_electronics: "B2B invoicing, GST-mandatory customers, no batch/drug features",
  general_trading: "Flexible trading ERP with optional expiry tracking, basic inventory",
};

export default function Settings() {
  const { config, businessType, setBusinessType, companyName, setCompanyName, gstInclusive, setGstInclusive } = useBusiness();
  const { isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const [editName, setEditName] = useState(companyName);
  const [selectedType, setSelectedType] = useState<BusinessType>(businessType);
  const [gstInclusiveLocal, setGstInclusiveLocal] = useState(gstInclusive);
  const [saving, setSaving] = useState(false);

  const hasChanges = editName !== companyName || (isSuperAdmin && selectedType !== businessType) || gstInclusiveLocal !== gstInclusive;

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editName !== companyName) await setCompanyName(editName);
      if (isSuperAdmin && selectedType !== businessType) await setBusinessType(selectedType);
      if (gstInclusiveLocal !== gstInclusive) await setGstInclusive(gstInclusiveLocal);
      toast({ title: "Settings saved", description: "Your business configuration has been updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your business and ERP settings</p>
      </div>

      {/* Company Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Company Information</CardTitle>
          <CardDescription>Your business name and identity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="company-name">Company / Business Name</Label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="company-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Business Type</CardTitle>
          <CardDescription>
            This controls which features, form fields, terminology, and sidebar items are visible.
            Currently: <span className="font-medium text-foreground">{config.label}</span>
            {!isSuperAdmin && (
              <span className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" /> Only platform administrators can change the business type.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 max-w-2xl">
            {(Object.keys(BUSINESS_CONFIGS) as BusinessType[]).map((type) => {
              const cfg = BUSINESS_CONFIGS[type];
              const Icon = iconMap[type];
              const isSelected = selectedType === type;
              return (
                <button
                  key={type}
                  onClick={() => isSuperAdmin && setSelectedType(type)}
                  disabled={!isSuperAdmin}
                  className={`relative flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                    !isSuperAdmin ? "opacity-60 cursor-not-allowed" : "hover:border-primary/50 hover:bg-primary/5"
                  } ${
                    isSelected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border"
                  }`}
                >
                  {isSelected && <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-primary" />}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{cfg.label}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{descriptionMap[type]}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Active Features Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Features</CardTitle>
          <CardDescription>Features enabled for {BUSINESS_CONFIGS[selectedType].label}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            {[
              { label: "Batch Tracking", on: BUSINESS_CONFIGS[selectedType].hasBatchTracking },
              { label: "Drug Schedule", on: BUSINESS_CONFIGS[selectedType].hasDrugSchedule },
              { label: "Expiry Tracking", on: BUSINESS_CONFIGS[selectedType].hasExpiryTracking },
              { label: "Scheduled Drugs", on: BUSINESS_CONFIGS[selectedType].hasScheduledDrugs },
              { label: "Prescription", on: BUSINESS_CONFIGS[selectedType].hasPrescription },
              { label: "Customer GST Required", on: BUSINESS_CONFIGS[selectedType].requiresCustomerGST },
              { label: "Challan System", on: BUSINESS_CONFIGS[selectedType].hasChallanSystem },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${f.on ? "bg-green-500" : "bg-muted-foreground/30"}`} />
                <span className={f.on ? "text-foreground" : "text-muted-foreground"}>{f.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* GST Pricing Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">GST Pricing Mode</CardTitle>
          <CardDescription>
            Control how GST is handled in product pricing. When enabled, product prices (MRP / Sale Price) are treated as GST-inclusive — no separate GST is added during billing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between max-w-md">
            <div className="space-y-0.5">
              <Label htmlFor="gst-inclusive">GST Inclusive Pricing</Label>
              <p className="text-xs text-muted-foreground">
                Prices already include GST (common for wholesalers &amp; retailers)
              </p>
            </div>
            <Switch
              id="gst-inclusive"
              checked={gstInclusiveLocal}
              onCheckedChange={setGstInclusiveLocal}
            />
          </div>
        </CardContent>
      </Card>

      {/* GST Filing Setup */}
      <GSTSetupSection />

      {/* Form & Rules Configuration */}
      <FormConfigEditor />

      {/* Invoice Format */}
      <InvoiceSettingsSection />

      {/* WhatsApp Templates */}
      <WhatsAppTemplatesSection />

      {/* Twilio SMS / WhatsApp */}
      <TwilioSection />




      {/* Data Backup */}
      <BackupSection />

      {/* Offline Recovery — upload a backup .sql or legacy offline .json to restore */}
      <OfflineRecoverySection />

      {/* Backfill units, base units, conversions, and per-line quantities on imported data */}
      <BackfillUnitsSection />


      {/* Save */}
      {hasChanges && (
        <div className="sticky bottom-4">
          <Button onClick={handleSave} disabled={saving} className="shadow-lg">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}
