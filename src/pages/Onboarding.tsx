import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useBusiness, type BusinessType, BUSINESS_CONFIGS } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Building2, Pill, Cpu, ShoppingBag, ArrowRight, Loader2, CheckCircle2, Briefcase } from "lucide-react";
import logo from "@/assets/logo.png";

const businessOptions: { type: BusinessType; icon: React.ElementType; description: string }[] = [
  {
    type: "pharmacy",
    icon: Pill,
    description: "Drug scheduling, batch tracking, expiry management, prescription handling",
  },
  {
    type: "pharmacy_b2b",
    icon: Briefcase,
    description: "Pharmacy with B2B invoicing, GST-mandatory customers, batch & drug features",
  },
  {
    type: "b2b_electronics",
    icon: Cpu,
    description: "B2B invoicing, GST-mandatory customers, no batch/drug features",
  },
  {
    type: "general_trading",
    icon: ShoppingBag,
    description: "Flexible trading ERP with optional expiry tracking, basic inventory",
  },
];

export default function Onboarding() {
  const { user, loading: authLoading } = useAuth();
  const { needsOnboarding, isLoading: businessLoading } = useBusiness();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<"company" | "type" | "migrate">("company");
  const [name, setName] = useState("");
  const [selectedType, setSelectedType] = useState<BusinessType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Route guards: redirect if user doesn't belong here
  useEffect(() => {
    if (authLoading || businessLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    if (!needsOnboarding) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, businessLoading, needsOnboarding, navigate]);

  const handleComplete = async () => {
    if (!selectedType || !name.trim() || !user) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("complete_onboarding", {
        _company_name: name.trim(),
        _business_type: selectedType,
      });

      if (error) throw error;
      if (!data) throw new Error("Onboarding did not return a company ID");

      toast({ title: "Welcome!", description: `${BUSINESS_CONFIGS[selectedType].label} ERP is ready.` });
      // Force full reload so all contexts re-fetch cleanly
      window.location.href = "/";
    } catch (err: any) {
      console.error("Onboarding error:", err);
      toast({
        title: "Setup Failed",
        description: err?.message || "Could not complete setup. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Don't render form until we know user needs onboarding
  if (authLoading || businessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-2xl relative animate-fade-in shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-lg">
            <img src={logo} alt="ERP" className="w-12 h-12 object-contain" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Set Up Your Business</CardTitle>
            <CardDescription className="mt-2">
              {step === "company"
                ? "Enter your company details to get started"
                : "Choose your business type to customize the ERP"}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {step === "company" ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="company-name">Company / Business Name *</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="company-name"
                    placeholder="e.g., Sharma Electronics Pvt Ltd"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10"
                    autoFocus
                  />
                </div>
              </div>
              <Button
                onClick={() => {
                  if (!name.trim()) {
                    toast({ title: "Please enter your company name", variant: "destructive" });
                    return;
                  }
                  setStep("type");
                }}
                className="w-full"
              >
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-3">
                {businessOptions.map((option) => {
                  const config = BUSINESS_CONFIGS[option.type];
                  const isSelected = selectedType === option.type;
                  return (
                    <button
                      key={option.type}
                      onClick={() => setSelectedType(option.type)}
                      className={`relative flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5 ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border"
                      }`}
                    >
                      {isSelected && (
                        <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-primary" />
                      )}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <option.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">{config.label}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{option.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("company")} className="flex-1">
                  Back
                </Button>
                <Button
                  onClick={handleComplete}
                  disabled={!selectedType || isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting up...
                    </>
                  ) : (
                    <>
                      Launch ERP <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
