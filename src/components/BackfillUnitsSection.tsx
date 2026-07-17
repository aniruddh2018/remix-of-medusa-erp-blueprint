import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { toast } from "@/hooks/use-toast";

interface BackfillResult {
  products_updated: number;
  conversions_inserted: number;
  batches_updated: number;
  purchase_items_updated: number;
  sales_items_updated: number;
}

export function BackfillUnitsSection() {
  const { currentCompany } = useBusiness();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);

  const run = async () => {
    if (!currentCompany?.id) {
      toast({ title: "No company selected", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    const { data, error } = await supabase.rpc("backfill_units_conversions", {
      _company_id: currentCompany.id,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Backfill failed", description: error.message, variant: "destructive" });
      return;
    }
    const r = data as unknown as BackfillResult;
    setResult(r);
    toast({
      title: "Backfill complete",
      description: `${r.products_updated} products, ${r.conversions_inserted} conversions, ${r.batches_updated} batches, ${r.purchase_items_updated} purchases, ${r.sales_items_updated} sales.`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5" />
          Backfill Units & Conversions
        </CardTitle>
        <CardDescription>
          Fills in missing dosage form, base unit, strip→tab conversions, batch pack sizes, and per-line units/base quantities for already-imported data. Only blanks are updated — existing values are preserved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={run} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
          Run backfill for this company
        </Button>
        {result && (
          <div className="text-sm text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-5">
            <div><b>{result.products_updated}</b> products</div>
            <div><b>{result.conversions_inserted}</b> conversions</div>
            <div><b>{result.batches_updated}</b> batches</div>
            <div><b>{result.purchase_items_updated}</b> purchase lines</div>
            <div><b>{result.sales_items_updated}</b> sales lines</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
