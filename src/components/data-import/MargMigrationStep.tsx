import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronRight, SkipForward, Rocket } from "lucide-react";
import { MargMasterImport } from "@/components/data-import/MargMasterImport";
import { MargStockImport } from "@/components/data-import/MargStockImport";
import { MargPurchaseImport } from "@/components/data-import/MargPurchaseImport";
import { MargSalesImport } from "@/components/data-import/MargSalesImport";

const STEPS = [
  { key: "products", label: "Products", hint: "Product master (name, composition, MRP, GST)", Component: MargMasterImport },
  { key: "stock", label: "Opening Stock", hint: "Current on-hand quantities & batches", Component: MargStockImport },
  { key: "purchase", label: "Purchase History", hint: "Past purchase bills & suppliers", Component: MargPurchaseImport },
  { key: "sales", label: "Sales History", hint: "Past sales bills & customers", Component: MargSalesImport },
] as const;

interface Props {
  onFinish: () => void;
}

export function MargMigrationStep({ onFinish }: Props) {
  const [idx, setIdx] = useState(0);
  const step = STEPS[idx];
  const Comp = step.Component;

  const advance = () => {
    if (idx + 1 >= STEPS.length) {
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
                <Rocket className="w-5 h-5 text-primary" /> Migrate from MARG
              </CardTitle>
              <CardDescription>
                Optional — import your existing MARG data in 4 sequential steps.
                You can skip any step and finish later from <strong>Data Import</strong>.
              </CardDescription>
            </div>
            <Button variant="ghost" onClick={skipAll}>
              Skip all & go to dashboard <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-wrap gap-2">
              {STEPS.map((s, i) => (
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
              Step {idx + 1} of {STEPS.length} — {step.label}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={advance}>
                <SkipForward className="w-4 h-4 mr-1" /> Skip this step
              </Button>
              <Button onClick={advance}>
                {idx + 1 === STEPS.length ? "Finish & go to dashboard" : "Continue"}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
