import { useState } from "react";
import { Bot, User, Check, X, AlertTriangle, Clock, ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProductFrame } from "./ProductFrame";
import { Reveal } from "./Reveal";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    id: "changes",
    kicker: "01 — Something changes",
    title: "An invoice crosses 30 days overdue",
    body: "Sundar Traders hasn't settled INV-2031. Nobody has to notice this by scrolling a ledger — it's just true the moment it happens.",
  },
  {
    id: "surfaces",
    kicker: "02 — It surfaces on its own",
    title: "It shows up on the dashboard, next to everything else that needs eyes",
    body: "Alongside the batches expiring this week and the stock that's dropped below reorder level — the things that would otherwise wait for a spreadsheet review.",
  },
  {
    id: "ask",
    kicker: "03 — Ask what needs attention",
    title: "“What needs my attention today?”",
    body: "A plain question, answered from the same data — not a separate report you have to remember to run.",
  },
  {
    id: "act",
    kicker: "04 — Turn it into action",
    title: "Ask it to record the payment. Confirm. Done.",
    body: "The assistant never writes anything on its own — it shows exactly what will change, with the balance before and after, and waits for you.",
  },
] as const;

export function ProductInActionSection() {
  const [step, setStep] = useState(0);

  return (
    <section id="product-in-action" className="py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold text-primary tracking-wide">The product, actually working</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            From a change in the business to a closed loop — without switching screens.
          </h2>
        </Reveal>

        <div className="mt-12 grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-8 lg:gap-12 items-start">
          {/* Step rail */}
          <div className="space-y-2 lg:sticky lg:top-24">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setStep(i)}
                className={cn(
                  "w-full text-left rounded-xl border px-4 py-4 transition-all duration-200",
                  i === step
                    ? "border-primary/40 bg-primary/5 shadow-sm"
                    : "border-transparent hover:border-border hover:bg-muted/40"
                )}
              >
                <p className={cn("text-xs font-semibold tracking-wide", i === step ? "text-primary" : "text-muted-foreground")}>
                  {s.kicker}
                </p>
                <p className={cn("mt-1 font-semibold", i === step ? "text-foreground" : "text-muted-foreground")}>
                  {s.title}
                </p>
                {i === step && (
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                )}
              </button>
            ))}

            <div className="flex items-center gap-2 pt-2">
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  aria-label={`Go to step ${i + 1}`}
                  onClick={() => setStep(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === step ? "w-8 bg-primary" : "w-4 bg-border hover:bg-muted-foreground/40"
                  )}
                />
              ))}
              <button
                onClick={() => setStep((s) => (s + 1) % STEPS.length)}
                className="ml-auto flex items-center gap-1 text-sm font-medium text-primary hover:underline underline-offset-4"
              >
                Next <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Visual panel */}
          <div>
            {step === 0 && <ChangeStep />}
            {step === 1 && <SurfaceStep />}
            {step === 2 && <AskStep />}
            {step === 3 && <ActStep />}
          </div>
        </div>
      </div>
    </section>
  );
}

function ChangeStep() {
  return (
    <ProductFrame label="Accounts — Overdue">
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3.5">
          <div className="min-w-0">
            <p className="font-medium text-sm">Sundar Traders</p>
            <p className="text-xs text-muted-foreground mt-0.5">INV-2031 · ₹8,400 outstanding</p>
          </div>
          <Badge className="bg-warning text-warning-foreground shrink-0 whitespace-nowrap">32 days overdue</Badge>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3.5 opacity-60">
          <div className="min-w-0">
            <p className="font-medium text-sm">Aroma Distributors</p>
            <p className="text-xs text-muted-foreground mt-0.5">INV-2018 · ₹2,150 outstanding</p>
          </div>
          <Badge variant="secondary" className="shrink-0 whitespace-nowrap">6 days overdue</Badge>
        </div>
      </div>
    </ProductFrame>
  );
}

function SurfaceStep() {
  return (
    <ProductFrame label="Dashboard">
      <div className="p-5 sm:p-6 space-y-3">
        <div className="rounded-lg border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center gap-1.5 text-sm font-semibold">
            <Clock className="h-3.5 w-3.5 text-warning" /> Overdue credit invoices
          </div>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm truncate">Sundar Traders — INV-2031</span>
            <Badge className="bg-warning text-warning-foreground shrink-0 whitespace-nowrap">₹8,400</Badge>
          </div>
        </div>
        <div className="rounded-lg border border-border">
          <div className="px-4 py-3 border-b border-border flex items-center gap-1.5 text-sm font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Expiring soon
          </div>
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm truncate">Amoxicillin 500mg — Batch B4521</span>
            <Badge className="bg-warning text-warning-foreground shrink-0 whitespace-nowrap">12 days</Badge>
          </div>
        </div>
        <div className="rounded-lg border border-border">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium truncate">Low stock alert</span>
            <Badge variant="secondary" className="shrink-0 whitespace-nowrap">1 product</Badge>
          </div>
        </div>
      </div>
    </ProductFrame>
  );
}

function AskStep() {
  return (
    <ProductFrame label="Automation Chat">
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-lg bg-primary text-primary-foreground px-3.5 py-2.5 text-sm">
            What needs my attention today?
          </div>
        </div>
        <div className="flex gap-2.5">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="text-sm leading-relaxed space-y-1.5 max-w-[90%]">
            <p>Three things worth a look:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Sundar Traders — ₹8,400 overdue on INV-2031 (32 days)</li>
              <li>• Amoxicillin 500mg — batch B4521 expires in 12 days, 340 units</li>
              <li>• Cefixime 200mg — below reorder level</li>
            </ul>
          </div>
        </div>
      </div>
    </ProductFrame>
  );
}

function ActStep() {
  return (
    <ProductFrame label="Automation Chat">
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-lg bg-primary text-primary-foreground px-3.5 py-2.5 text-sm">
            Record ₹8,400 from Sundar Traders against INV-2031
          </div>
        </div>
        <div className="flex gap-2.5 items-start">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0 max-w-[92%]">
            <p className="text-sm mb-2">Here's what I'll record — nothing is saved until you confirm.</p>
            <div className="rounded-lg border border-border bg-card p-3.5">
              <Badge variant="secondary" className="mb-2">
                <Sparkles className="h-3 w-3 mr-1" /> Receive payment
              </Badge>
              <dl className="text-sm divide-y divide-border/60">
                <div className="flex justify-between py-1"><dt className="text-muted-foreground">From</dt><dd className="font-medium">Sundar Traders</dd></div>
                <div className="flex justify-between py-1"><dt className="text-muted-foreground">Against</dt><dd className="font-medium">INV-2031</dd></div>
                <div className="flex justify-between py-1"><dt className="text-muted-foreground">Amount</dt><dd className="font-medium">₹8,400.00</dd></div>
                <div className="flex justify-between py-1"><dt className="text-muted-foreground">Method</dt><dd className="font-medium">Bank transfer</dd></div>
              </dl>
              <div className="mt-2.5 p-2 rounded bg-muted/50 border border-border/50 text-xs space-y-0.5">
                <div className="flex justify-between"><span>Balance now</span><span>₹8,400.00</span></div>
                <div className="flex justify-between font-medium text-foreground"><span>Balance after</span><span>₹0.00</span></div>
              </div>
              <div className="flex gap-2 mt-3">
                <div className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium py-1.5">
                  <Check className="h-3.5 w-3.5" /> Confirm
                </div>
                <div className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-input text-sm font-medium py-1.5 text-muted-foreground">
                  <X className="h-3.5 w-3.5" /> Cancel
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProductFrame>
  );
}
