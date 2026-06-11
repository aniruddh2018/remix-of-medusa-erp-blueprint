import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, RefreshCw, ReceiptText } from "lucide-react";
import { GST_STATES, gstinStateCode, stateName } from "@/services/gst/stateCodes";

export function GSTSetupSection() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: company } = useQuery({
    queryKey: ["gst-setup-company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("gst_number, legal_name, state_code, state_name, name")
        .eq("id", companyId!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const [gstin, setGstin] = useState("");
  const [legalName, setLegalName] = useState("");
  const [stateCode, setStateCode] = useState("");

  useEffect(() => {
    if (!company) return;
    setGstin(company.gst_number || "");
    setLegalName(company.legal_name || company.name || "");
    setStateCode(company.state_code || (company.gst_number ? company.gst_number.substring(0, 2) : ""));
  }, [company]);

  // Auto-derive state code when GSTIN changes
  useEffect(() => {
    const derived = gstinStateCode(gstin);
    if (derived && !stateCode) setStateCode(derived);
  }, [gstin]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("companies").update({
        gst_number: gstin || null,
        legal_name: legalName || null,
        state_code: stateCode || null,
        state_name: stateName(stateCode) || null,
      }).eq("id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "GST setup saved" });
      qc.invalidateQueries({ queryKey: ["gst-setup-company"] });
      qc.invalidateQueries({ queryKey: ["gst-company"] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      // Backfill customers
      const { data: custs } = await supabase
        .from("customers")
        .select("id, gst_number")
        .eq("company_id", companyId!)
        .is("state_code", null)
        .not("gst_number", "is", null);
      let custCount = 0;
      for (const c of custs ?? []) {
        const code = gstinStateCode(c.gst_number);
        if (code) {
          await supabase.from("customers").update({ state_code: code }).eq("id", c.id);
          custCount++;
        }
      }
      const { data: sups } = await supabase
        .from("suppliers")
        .select("id, gst_number")
        .eq("company_id", companyId!)
        .is("state_code", null)
        .not("gst_number", "is", null);
      let supCount = 0;
      for (const s of sups ?? []) {
        const code = gstinStateCode(s.gst_number);
        if (code) {
          await supabase.from("suppliers").update({ state_code: code }).eq("id", s.id);
          supCount++;
        }
      }
      return { custCount, supCount };
    },
    onSuccess: (r) => toast({ title: "Backfill complete", description: `${r.custCount} customers, ${r.supCount} suppliers updated.` }),
    onError: (e: Error) => toast({ title: "Backfill failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5" />GST Filing Setup</CardTitle>
        <CardDescription>
          Required to generate filing-ready GSTR-1 / GSTR-3B. State code drives inter-state vs intra-state tax split.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="gst-gstin">Company GSTIN</Label>
            <Input id="gst-gstin" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} className="font-mono" />
          </div>
          <div>
            <Label htmlFor="gst-legal">Legal Name (as per GST)</Label>
            <Input id="gst-legal" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Registered legal name" />
          </div>
          <div>
            <Label htmlFor="gst-state">State / UT</Label>
            <Select value={stateCode} onValueChange={setStateCode}>
              <SelectTrigger id="gst-state"><SelectValue placeholder="Select state" /></SelectTrigger>
              <SelectContent>
                {GST_STATES.map((s) => (
                  <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save GST Setup
          </Button>
          <Button variant="outline" onClick={() => backfillMutation.mutate()} disabled={backfillMutation.isPending}>
            {backfillMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Backfill State Codes (Customers & Suppliers)
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Backfill reads the first 2 characters of each party's GSTIN and fills their state code automatically.
        </p>
      </CardContent>
    </Card>
  );
}
