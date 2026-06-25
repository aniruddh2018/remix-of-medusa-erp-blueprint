import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Construction } from "lucide-react";

export function MargPurchaseImport() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Construction className="w-5 h-5" /> MARG Purchase History Importer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert>
          <AlertDescription className="text-sm leading-relaxed">
            <strong>Coming soon.</strong> The architecture mirrors the sales
            importer — same upload → preview → company picker → batched insert
            flow, but writes to <code>purchase_orders</code>,{" "}
            <code>purchase_order_items</code> and creates real{" "}
            <code>inventory_batches</code> (purchases seed stock).
            <br />
            <br />
            Drop a sample MARG purchase / GRN report in chat and we'll wire up
            the parser the same way we did for the sales register.
          </AlertDescription>
        </Alert>
        <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
          <li>Supplier auto-create by GSTIN / phone / name</li>
          <li>Batch creation with expiry, MRP and purchase price from the file</li>
          <li>Option to also write inventory_transactions of type <code>legacy_purchase</code></li>
        </ul>
      </CardContent>
    </Card>
  );
}
