import { useState } from "react";
import {
  Eye, Workflow, ShieldCheck, Zap, Search, BarChart3, History,
  PackageSearch, FileStack, Stethoscope, Pill, Scale, CalendarClock,
  ReceiptText, FileSignature, ScanLine, MessageSquareText, Database,
} from "lucide-react";
import { Reveal } from "./Reveal";
import { cn } from "@/lib/utils";

const GROUPS = [
  {
    id: "understand",
    icon: Eye,
    title: "Understand the business",
    subtitle: "See what's happening without asking someone or opening a spreadsheet.",
    items: [
      { icon: BarChart3, text: "A dashboard that surfaces low stock, expiring batches, and overdue invoices on its own" },
      { icon: Search, text: "Ask a plain-English question and get a real answer from your data, with the SQL behind it" },
      { icon: History, text: "A full audit log of who changed what, and when" },
    ],
  },
  {
    id: "moving",
    icon: Workflow,
    title: "Keep operations moving",
    subtitle: "The day-to-day of buying, selling, and stocking, without re-keying anything.",
    items: [
      { icon: PackageSearch, text: "Batch-level inventory with FEFO allocation — the nearest expiry gets sold first, automatically" },
      { icon: FileStack, text: "Purchase orders that flow from delivery challan to invoice, and quotations that convert into sales" },
      { icon: Stethoscope, text: "Doctor and prescription tracking alongside every scheduled-drug sale" },
    ],
  },
  {
    id: "compliant",
    icon: ShieldCheck,
    title: "Stay compliant without the busywork",
    subtitle: "The register and the returns your business is actually required to keep.",
    items: [
      { icon: Pill, text: "A digital Schedule H / H1 / X / Narcotic register with the running balance an inspector checks" },
      { icon: Scale, text: "A real double-entry ledger — ledger groups, roles, and a trial balance that reconciles" },
      { icon: ReceiptText, text: "GSTR-1, GSTR-3B, HSN summary, and purchase register, exportable the way your CA expects" },
      { icon: FileSignature, text: "e-Invoicing and e-Way Bill generated directly against the government's IRN system" },
      { icon: CalendarClock, text: "Financial year close that carries balances and stock forward on its own" },
    ],
  },
  {
    id: "routine",
    icon: Zap,
    title: "Reduce routine work",
    subtitle: "The repetitive parts, handled — with you always in the loop before anything changes.",
    items: [
      { icon: ScanLine, text: "Scan a purchase invoice or a prescription and let the system read it into structured data" },
      { icon: MessageSquareText, text: "Ask the assistant to add a party or record a payment — it always shows what it's about to do first" },
      { icon: Database, text: "Bring in existing Tally or Marg data instead of re-entering years of ledgers" },
    ],
  },
] as const;

export function CapabilitiesSection() {
  const [active, setActive] = useState(0);
  const group = GROUPS[active];

  return (
    <section id="capabilities" className="py-20 sm:py-28 bg-muted/30 border-y border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold text-primary tracking-wide">What's actually inside</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Organized around what you're trying to get done, not a features list.
          </h2>
        </Reveal>

        <div className="mt-12 grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] gap-6 lg:gap-10">
          <div className="flex lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0">
            {GROUPS.map((g, i) => (
              <button
                key={g.id}
                onClick={() => setActive(i)}
                className={cn(
                  "shrink-0 lg:w-full text-left rounded-xl border px-4 py-4 transition-all duration-200 flex items-start gap-3",
                  i === active
                    ? "border-primary/40 bg-card shadow-sm"
                    : "border-transparent hover:bg-card/60"
                )}
              >
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                  i === active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border border-border"
                )}>
                  <g.icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-[180px] lg:min-w-0">
                  <p className={cn("font-semibold text-sm", i === active ? "text-foreground" : "text-muted-foreground")}>
                    {g.title}
                  </p>
                  <p className="hidden lg:block text-xs text-muted-foreground mt-0.5 leading-snug">{g.subtitle}</p>
                </div>
              </button>
            ))}
          </div>

          <div key={group.id} className="rounded-2xl border border-border bg-card p-6 sm:p-8 animate-fade-in">
            <div className="flex items-center gap-3 mb-1">
              <group.icon className="h-5 w-5 text-primary" />
              <h3 className="text-xl font-bold text-foreground">{group.title}</h3>
            </div>
            <p className="text-muted-foreground mb-6">{group.subtitle}</p>
            <ul className="space-y-4">
              {group.items.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm sm:text-[0.95rem] text-foreground/90 leading-relaxed pt-1">{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
