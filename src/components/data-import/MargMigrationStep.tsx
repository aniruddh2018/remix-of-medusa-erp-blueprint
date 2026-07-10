import { useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, ChevronRight, SkipForward, Rocket, Archive } from "lucide-react";
import { MargMasterImport } from "@/components/data-import/MargMasterImport";
import { MargStockImport } from "@/components/data-import/MargStockImport";
import { MargPurchaseImport } from "@/components/data-import/MargPurchaseImport";
import { MargSalesImport } from "@/components/data-import/MargSalesImport";

type StepKey = "products" | "stock" | "purchase" | "sales";
interface Step {
  key: StepKey;
  label: string;
  hint: string;
  Component: () => JSX.Element;
}

const ALL_STEPS: Step[] = [
  { key: "products", label: "Products", hint: "Product master (name, composition, MRP, GST)", Component: MargMasterImport },
  { key: "stock", label: "Opening Stock", hint: "Current on-hand quantities & batches (current FY only)", Component: MargStockImport },
  { key: "purchase", label: "Purchase History", hint: "Past purchase bills & suppliers", Component: MargPurchaseImport },
  { key: "sales", label: "Sales History", hint: "Past sales bills & customers", Component: MargSalesImport },
];

interface Props {
  onFinish: () => void;
}

export function MargMigrationStep({ onFinish }: Props) {
  const { activeFinancialYear } = useBusiness();
  const isPastFy = !!activeFinancialYear && activeFinancialYear.status !== "active";

  // In a past FY, users only import sales + purchase HISTORY. Products can also
  // be added (safe, catalog-level). Stock is hidden — it must go into the
  // active FY, then reconciliation derives opening balances.
  const steps = isPastFy
    ? ALL_STEPS.filter((s) => s.key !== "stock")
    : ALL_STEPS;

  const [idx, setIdx] = useState(0);
  const step = steps[Math.min(idx, steps.length - 1)];
  const Comp = step.Component;

  const advance = () => {
    if (idx + 1 >= steps.length) {
      localStorage.removeItem("marg_migration_deferred");
      onFinish();
    } else {
      setIdx(idx + 1);
    }
  };

  const skipAll = () => {
    localStorage.setItem("marg_migration_deferred", "1");
    onFinish();
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                {isPastFy ? <Archive className="w-5 h-5 text-amber-600" /> : <Rocket className="w-5 h-5 text-primary" />}
                {isPastFy ? "Historical Import Mode" : "Migrate from MARG"}
              </CardTitle>
              <CardDescription>
                {isPastFy ? (
                  <>
                    You are viewing <strong>{activeFinancialYear?.name}</strong>. Only <strong>sales</strong> and
                    <strong> purchase</strong> history can be imported here — stock lives in the current FY.
                  </>
                ) : (
                  <>Optional — import your existing MARG data. You can skip any step and finish later from <strong>Data Import</strong>.</>
                )}
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={skipAll}>
              Skip all & go to dashboard <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isPastFy && (
              <Alert>
                <AlertDescription className="text-xs">
                  After importing purchase history for all past years and current stock for the active year,
                  run <strong>Reconciliation</strong> from Financial Year Admin — any leftover stock will be posted
                  as opening balances on {activeFinancialYear?.end_date}.
                </AlertDescription>
              </Alert>
            )}
            <ol className="flex flex-wrap gap-2">
              {steps.map((s, i) => (
                <li
                  key={s.key}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${
                    i < idx ? "bg-green-50 border-green-300 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400"
                    : i === idx ? "bg-primary/10 border-primary text-primary font-medium"
                    : "border-border text-muted-foreground"
                  }`}
                >
                  {i < idx ? <CheckCircle2 className="w-4 h-4" /> : <span className="w-5 text-center font-mono text-xs">{i + 1}</span>}
                  {s.label}
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground mt-3">{step.hint}</p>
          </CardContent>
        </Card>

        <div key={step.key}>
          <Comp />
        </div>

        <Card>
          <CardContent className="flex flex-col md:flex-row items-center justify-between gap-3 py-4">
            <div className="text-sm text-muted-foreground">
              Step {idx + 1} of {steps.length} — {step.label}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={advance}>
                <SkipForward className="w-4 h-4 mr-1" /> Skip this step
              </Button>
              <Button onClick={advance}>
                {idx + 1 === steps.length ? "Finish & go to dashboard" : "Continue"}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
