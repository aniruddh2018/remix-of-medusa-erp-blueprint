import { X, Check } from "lucide-react";
import { Reveal } from "./Reveal";

const ROWS = [
  {
    before: "Fragmented across Tally, Excel, WhatsApp, and paper",
    after: "One system, one audit trail, one company_id behind every record",
  },
  {
    before: "Manual data entry from every purchase invoice and prescription",
    after: "Scanned and read into structured data, for you to confirm",
  },
  {
    before: "Searching for information across five places",
    after: "Asking a plain question and getting an answer from your own data",
  },
  {
    before: "Finding out at month-end, in a report",
    after: "Seeing what needs attention the moment it becomes true",
  },
  {
    before: "A paper register, hoping it's up to date for the inspector",
    after: "A digital register with a running balance and full history",
  },
];

export function WhyDifferentSection() {
  return (
    <section id="why-different" className="py-20 sm:py-28 bg-muted/30 border-y border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <Reveal className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-semibold text-primary tracking-wide">Why it feels different</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Not a bigger tool. A connected one.
          </h2>
        </Reveal>

        <div className="mt-12 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-2 text-sm font-semibold">
            <div className="px-5 sm:px-8 py-4 text-muted-foreground border-b border-r border-border">Today, most likely</div>
            <div className="px-5 sm:px-8 py-4 text-foreground border-b border-border bg-primary/5">With one connected system</div>
          </div>
          {ROWS.map((row, i) => (
            <Reveal key={i} delay={i * 60} as="div">
              <div className="grid grid-cols-2">
                <div className="px-5 sm:px-8 py-5 border-r border-b border-border last:border-b-0 flex gap-3 items-start">
                  <X className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground leading-relaxed">{row.before}</p>
                </div>
                <div className="px-5 sm:px-8 py-5 border-b border-border last:border-b-0 flex gap-3 items-start bg-primary/[0.03]">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground leading-relaxed">{row.after}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
