import { Sheet as SheetIcon, MessageCircle, FileSpreadsheet, NotebookPen, Mail, ArrowDown } from "lucide-react";
import { Reveal } from "./Reveal";

const TOOLS = [
  {
    icon: FileSpreadsheet,
    name: "Excel",
    note: "Stock count from three days ago, if someone remembered to update it.",
    rotate: "-rotate-2",
  },
  {
    icon: SheetIcon,
    name: "Tally",
    note: "Ledgers live here, disconnected from what's actually being sold.",
    rotate: "rotate-1",
  },
  {
    icon: MessageCircle,
    name: "WhatsApp",
    note: "\"Bhai stock hai kya?\" — the real inventory check, several times a day.",
    rotate: "-rotate-1",
  },
  {
    icon: NotebookPen,
    name: "Paper register",
    note: "The Schedule H register an inspector will actually ask to see.",
    rotate: "rotate-2",
  },
  {
    icon: Mail,
    name: "Email / calls",
    note: "Chasing a supplier for the invoice against last week's delivery.",
    rotate: "-rotate-1",
  },
];

export function RealityCheckSection() {
  return (
    <section className="py-20 sm:py-28 bg-muted/30 border-y border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Reveal className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            This is probably already how it runs.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed">
            Not because anyone chose it this way — it's just what accumulates when inventory,
            billing, compliance, and conversations with suppliers each live in a different place.
          </p>
        </Reveal>

        <div className="mt-14 flex flex-wrap justify-center gap-4 sm:gap-5">
          {TOOLS.map((tool, i) => (
            <Reveal key={tool.name} delay={i * 90} className={tool.rotate}>
              <div className="w-[220px] rounded-xl border border-border bg-card p-5 shadow-card transition-transform duration-300 hover:rotate-0 hover:shadow-card-hover">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <tool.icon className="h-4.5 w-4.5" />
                </div>
                <p className="mt-3 font-semibold text-foreground text-sm">{tool.name}</p>
                <p className="mt-1.5 text-sm text-muted-foreground leading-snug">{tool.note}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={520} className="flex justify-center mt-10">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <ArrowDown className="h-5 w-5" />
            <p className="text-sm font-medium">Five places to check before you know what's actually going on.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
