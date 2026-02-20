import { useState } from "react";
import { useBusinessModule } from "@/contexts/BusinessModuleContext";
import { ALL_MODULES, BusinessModule, ModuleConfig } from "@/config/businessModules";
import { Check, Pill, Sparkles, Cpu, Shirt, ShoppingBag, Factory } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const moduleIconMap: Record<string, React.ElementType> = {
  pharmacy: Pill,
  cosmetics: Sparkles,
  electronics: Cpu,
  clothing: Shirt,
  general: ShoppingBag,
  manufacturing: Factory,
};

const moduleColorMap: Record<string, string> = {
  pharmacy: "border-blue-500 bg-blue-50 dark:bg-blue-950/20",
  cosmetics: "border-pink-500 bg-pink-50 dark:bg-pink-950/20",
  electronics: "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/20",
  clothing: "border-purple-500 bg-purple-50 dark:bg-purple-950/20",
  general: "border-green-500 bg-green-50 dark:bg-green-950/20",
  manufacturing: "border-orange-500 bg-orange-50 dark:bg-orange-950/20",
};

const moduleIconColorMap: Record<string, string> = {
  pharmacy: "text-blue-600",
  cosmetics: "text-pink-600",
  electronics: "text-cyan-600",
  clothing: "text-purple-600",
  general: "text-green-600",
  manufacturing: "text-orange-600",
};

const featureLabels: Partial<Record<keyof ModuleConfig["features"], string>> = {
  expiryTracking: "Expiry Tracking",
  batchTracking: "Batch / Lot Tracking",
  scheduledDrugs: "Scheduled Drugs Register",
  prescriptions: "Prescription Management",
  serialNumbers: "Serial Number Tracking",
  warrantyTracking: "Warranty Management",
  sizes: "Size Variants",
  colors: "Color / Shade Variants",
  creditDebitNotes: "Credit & Debit Notes",
  purchaseOrders: "Purchase Orders",
  suppliers: "Supplier Management",
  customers: "Customer Management",
  reports: "Reports & Analytics",
};

function FeaturePill({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
        enabled
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground line-through opacity-50"
      )}
    >
      {enabled && <Check className="h-3 w-3" />}
      {label}
    </span>
  );
}

export default function Settings() {
  const { activeModule, moduleConfig, setModule } = useBusinessModule();
  const { toast } = useToast();
  const [saving, setSaving] = useState<BusinessModule | null>(null);
  const [selected, setSelected] = useState<BusinessModule>(activeModule);

  const handleSelect = (id: BusinessModule) => {
    setSelected(id);
  };

  const handleApply = async () => {
    if (selected === activeModule) return;
    setSaving(selected);
    try {
      await setModule(selected);
      toast({
        title: "Module switched!",
        description: `Now running in ${ALL_MODULES.find((m) => m.id === selected)?.name} mode.`,
      });
    } catch (e) {
      toast({ title: "Failed to switch module", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your ERP module and preferences</p>
      </div>

      {/* Active module banner */}
      <Card className={cn("border-2", moduleColorMap[activeModule])}>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            {(() => {
              const Icon = moduleIconMap[activeModule];
              return <Icon className={cn("h-7 w-7", moduleIconColorMap[activeModule])} />;
            })()}
            <div>
              <CardTitle className="text-lg">Active Module: {moduleConfig.name}</CardTitle>
              <CardDescription>{moduleConfig.tagline}</CardDescription>
            </div>
            <Badge className="ml-auto" variant="secondary">Active</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Module selector */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Switch Business Module</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Each module tailors the navigation, features, and terminology for your business type. Your preference is saved per user.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ALL_MODULES.map((mod) => {
            const Icon = moduleIconMap[mod.id];
            const isActive = activeModule === mod.id;
            const isSelected = selected === mod.id;

            return (
              <button
                key={mod.id}
                onClick={() => handleSelect(mod.id as BusinessModule)}
                className={cn(
                  "text-left rounded-xl border-2 p-4 transition-all hover:shadow-md focus:outline-none",
                  isSelected
                    ? cn("border-2 shadow-md", moduleColorMap[mod.id])
                    : "border-border hover:border-muted-foreground/40 bg-card"
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "rounded-lg p-2 shrink-0",
                      isSelected ? "bg-background/80" : "bg-muted"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", moduleIconColorMap[mod.id])} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{mod.name}</span>
                      {isActive && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Current
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {mod.tagline}
                    </p>
                  </div>
                  {isSelected && (
                    <Check className={cn("h-4 w-4 shrink-0 mt-0.5", moduleIconColorMap[mod.id])} />
                  )}
                </div>

                {/* Feature pills */}
                <div className="mt-3 flex flex-wrap gap-1">
                  {(Object.keys(featureLabels) as Array<keyof typeof featureLabels>).map((key) => (
                    <FeaturePill
                      key={key}
                      enabled={mod.features[key as keyof ModuleConfig["features"]]}
                      label={featureLabels[key]!}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button
            onClick={handleApply}
            disabled={selected === activeModule || saving !== null}
            className="min-w-32"
          >
            {saving ? "Switching..." : "Apply Module"}
          </Button>
          {selected !== activeModule && (
            <p className="text-sm text-muted-foreground">
              Switching to <strong>{ALL_MODULES.find((m) => m.id === selected)?.name}</strong> — the sidebar and features will update immediately.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
