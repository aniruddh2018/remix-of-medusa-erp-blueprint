import { useState, useEffect, useCallback } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle2, Circle, Lock, ChevronDown, ChevronRight, RotateCcw, Info,
} from "lucide-react";
import { ExistingDataGuard } from "@/components/data-import/ExistingDataGuard";
import { MargMasterImport } from "@/components/data-import/MargMasterImport";
import { MargListImport } from "@/components/data-import/MargListImport";
import { MargPartyMasterImport } from "@/components/data-import/MargPartyMasterImport";
import { MargDoctorMapImport } from "@/components/data-import/MargDoctorMapImport";
import { MargStockImport } from "@/components/data-import/MargStockImport";
import { MargPurchaseImport } from "@/components/data-import/MargPurchaseImport";
import { MargSalesImport } from "@/components/data-import/MargSalesImport";
import { MargLedgerBalanceImport } from "@/components/data-import/MargLedgerBalanceImport";
import { RemoveImportsButton } from "@/components/data-import/RemoveImportsButton";
import type { CleanupScope } from "@/services/margImportCleanup";

type StepKey =
  | "products" | "product-list" | "parties" | "doctors"
  | "stock" | "purchase" | "sales" | "ledger-openings";

interface StepDef {
  key: StepKey;
  label: string;
  description: string;
  optional?: boolean;
  guard?: "products" | "sales" | "purchase" | "stock";
  cleanupScope?: CleanupScope;
  Component: () => JSX.Element;
}

const STEPS: StepDef[] = [
  {
    key: "products",
    label: "1. Product Master",
    description: "Import product catalog (name, composition, MRP, GST, HSN). Everything else depends on this.",
    guard: "products",
    Component: MargMasterImport,
  },
  {
    key: "product-list",
    label: "1b. Product List (optional)",
    description: "Alternate MARG product list format — use only if you don't have the master CSV.",
    optional: true,
    Component: MargListImport,
  },
  {
    key: "parties",
    label: "2. Parties (Customers & Suppliers)",
    description: "Import party master — required before sales or purchases can link to their party.",
    Component: MargPartyMasterImport,
  },
  {
    key: "purchase",
    label: "3. Purchase History",
    description: "Historical purchase bills. Builds stock via FIFO — import before sales.",
    guard: "purchase",
    Component: MargPurchaseImport,
  },
  {
    key: "sales",
    label: "4. Sales History",
    description: "Historical sales bills. Depends on products, parties, and purchase-built stock.",
    guard: "sales",
    Component: MargSalesImport,
  },
  {
    key: "doctors",
    label: "5. Doctor Mapping",
    description: "Bill ↔ Doctor mapping for prescription reports. Optional, can be done anytime after sales.",
    optional: true,
    Component: MargDoctorMapImport,
  },
  {
    key: "stock",
    label: "6. Opening Stock (current FY only)",
    description: "Adjust current on-hand quantities & batches. Only allowed in the active financial year.",
    guard: "stock",
    Component: MargStockImport,
  },
  {
    key: "ledger-openings",
    label: "7. Opening Ledger Balances (current FY only)",
    description: "MARG trial balance → opening balances for parties/cash/bank/tax ledgers. Movement already posted in the current FY is subtracted so nothing is double-counted.",
    Component: MargLedgerBalanceImport,
  },
];

function storageKey(companyId: string) {
  return `marg-import-progress-${companyId}`;
}

function loadProgress(companyId: string): Record<StepKey, boolean> {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {} as Record<StepKey, boolean>;
}

function saveProgress(companyId: string, p: Record<StepKey, boolean>) {
  localStorage.setItem(storageKey(companyId), JSON.stringify(p));
}

export function MargImportHierarchy() {
  const { companyId } = useBusiness();
  const [progress, setProgress] = useState<Record<StepKey, boolean>>({} as Record<StepKey, boolean>);
  const [openStep, setOpenStep] = useState<StepKey | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const p = loadProgress(companyId);
    setProgress(p);
    // auto-open first incomplete required step
    const first = STEPS.find((s) => !s.optional && !p[s.key]);
    setOpenStep(first?.key ?? STEPS[0].key);
  }, [companyId]);

  const markDone = useCallback(
    (key: StepKey, done: boolean) => {
      if (!companyId) return;
      const next = { ...progress, [key]: done };
      setProgress(next);
      saveProgress(companyId, next);
    },
    [companyId, progress],
  );

  const resetAll = () => {
    if (!companyId) return;
    localStorage.removeItem(storageKey(companyId));
    setProgress({} as Record<StepKey, boolean>);
    setOpenStep(STEPS[0].key);
  };

  // Compute which steps are unlocked. A step unlocks when all *required* (non-optional)
  // steps above it are marked done.
  const isUnlocked = (idx: number): boolean => {
    for (let i = 0; i < idx; i++) {
      const s = STEPS[i];
      if (!s.optional && !progress[s.key]) return false;
    }
    return true;
  };

  const totalRequired = STEPS.filter((s) => !s.optional).length;
  const doneRequired = STEPS.filter((s) => !s.optional && progress[s.key]).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              MARG Migration — Hierarchical Import
              <Badge variant="outline">{doneRequired}/{totalRequired}</Badge>
            </CardTitle>
            <CardDescription>
              Steps unlock in order. Complete each step, then click <strong>Mark done</strong> to unlock the next.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={resetAll}>
            <RotateCcw className="w-4 h-4 mr-1" /> Reset progress
          </Button>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription className="text-xs">
              Dependency order: <strong>Products → Parties → Purchases → Sales → Doctors → Stock</strong>.
              Optional steps can be skipped without blocking the next step.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {STEPS.map((step, idx) => {
          const unlocked = isUnlocked(idx);
          const done = !!progress[step.key];
          const open = openStep === step.key && unlocked;
          const Comp = step.Component;

          return (
            <Card key={step.key} className={!unlocked ? "opacity-60" : ""}>
              <button
                type="button"
                disabled={!unlocked}
                onClick={() => setOpenStep(open ? null : step.key)}
                className="w-full text-left"
              >
                <CardHeader className="flex flex-row items-center gap-3 py-3">
                  <div className="shrink-0">
                    {!unlocked ? (
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    ) : done ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">{step.label}</CardTitle>
                      {step.optional && <Badge variant="secondary" className="text-[10px]">Optional</Badge>}
                      {done && <Badge className="bg-green-600 hover:bg-green-600 text-[10px]">Done</Badge>}
                      {!unlocked && <Badge variant="outline" className="text-[10px]">Locked</Badge>}
                    </div>
                    <CardDescription className="text-xs mt-0.5">{step.description}</CardDescription>
                  </div>
                  <div className="shrink-0 text-muted-foreground">
                    {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </CardHeader>
              </button>

              {open && (
                <CardContent className="pt-0 space-y-4 border-t">
                  <div className="pt-4">
                    {step.guard && companyId ? (
                      <ExistingDataGuard companyId={companyId} scope={step.guard}>
                        <Comp />
                      </ExistingDataGuard>
                    ) : (
                      <Comp />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t">
                    <span className="text-xs text-muted-foreground">
                      When you're finished importing this step, mark it done to unlock the next.
                    </span>
                    <div className="flex gap-2">
                      {done ? (
                        <Button variant="outline" size="sm" onClick={() => markDone(step.key, false)}>
                          Undo done
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => {
                          markDone(step.key, true);
                          const nextIdx = STEPS.findIndex((s, i) => i > idx && !progress[s.key]);
                          if (nextIdx >= 0) setOpenStep(STEPS[nextIdx].key);
                          else setOpenStep(null);
                        }}>
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Mark done
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
