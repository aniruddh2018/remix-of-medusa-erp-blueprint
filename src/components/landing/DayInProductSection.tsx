import { Sunrise, Sun, BellRing, FileBarChart } from "lucide-react";
import { Reveal } from "./Reveal";

const MOMENTS = [
  {
    icon: Sunrise,
    time: "Opening up",
    title: "See what changed overnight",
    body: "Expiring batches, stock that dropped below reorder level, invoices that went overdue — before opening a single spreadsheet.",
  },
  {
    icon: Sun,
    time: "Through the day",
    title: "Buy, sell, and quote without re-entering anything",
    body: "Log a delivery as a challan, convert it to an invoice when it's confirmed. Ring up a counter sale with batches auto-picked by FEFO. Quote a hospital and convert it to a sale the moment they confirm.",
  },
  {
    icon: BellRing,
    time: "When something needs attention",
    title: "It comes to you",
    body: "A batch nearing expiry or a customer going overdue doesn't wait for a monthly report — it shows up the moment it's true, with a way to act on it right there.",
  },
  {
    icon: FileBarChart,
    time: "Closing the books",
    title: "File, reconcile, and roll forward",
    body: "Pull the GSTR-1, GSTR-3B, and HSN summary for the period. Check the trial balance. Close the financial year with balances and stock carried forward automatically.",
  },
];

export function DayInProductSection() {
  return (
    <section id="day-in-the-life" className="py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold text-primary tracking-wide">A day with it</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            It's meant to sit underneath the whole day, not just the reporting at the end of it.
          </h2>
        </Reveal>

        <div className="mt-14 relative">
          <div
            aria-hidden
            className="hidden md:block absolute left-[27px] top-3 bottom-3 w-px bg-border"
          />
          <div className="space-y-8 md:space-y-10">
            {MOMENTS.map((m, i) => (
              <Reveal key={m.time} delay={i * 100}>
                <div className="flex gap-5">
                  <div className="hidden md:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-card border border-border shadow-sm relative z-10">
                    <m.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6">
                    <div className="flex items-center gap-2 md:hidden mb-2">
                      <m.icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">{m.time}</p>
                    <p className="mt-1.5 text-lg font-semibold text-foreground">{m.title}</p>
                    <p className="mt-2 text-muted-foreground leading-relaxed">{m.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
