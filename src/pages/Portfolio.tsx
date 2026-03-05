import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard, Package, ScanLine, FileText, BarChart3, Shield,
  Users, AlertTriangle, Boxes, Wallet, Calendar, Zap, Target, TrendingUp,
  CheckCircle2, ArrowRight, Pill, ChevronRight
} from "lucide-react";

import dashboardImg from "@/assets/portfolio/dashboard.jpg";
import inventoryImg from "@/assets/portfolio/inventory.jpg";
import scannerImg from "@/assets/portfolio/scanner.jpg";
import salesImg from "@/assets/portfolio/sales.jpg";
import reportsImg from "@/assets/portfolio/reports.jpg";

const timeline = [
  { date: "Mar 2024", title: "Project Kickoff & Discovery", desc: "Conducted stakeholder interviews with 12 pharmacy owners. Mapped existing manual workflows. Identified 23 pain points across inventory, billing, and compliance." },
  { date: "May 2024", title: "MVP — Core Inventory & Billing", desc: "Launched batch-level inventory tracking with FEFO allocation. Built GST-compliant invoice generation. Onboarded 3 pilot pharmacies." },
  { date: "Aug 2024", title: "Purchase Order System", desc: "Designed supplier management module. Implemented purchase order lifecycle with challan-to-invoice conversion. Added multi-supplier support." },
  { date: "Nov 2024", title: "Compliance & Scheduled Drugs", desc: "Built Schedule H/H1/X drug register per CDSCO guidelines. Added prescription tracking. Passed regulatory audit at pilot sites." },
  { date: "Feb 2025", title: "Credit/Debit Notes & Accounts", desc: "Shipped returns workflow with credit notes. Built supplier debit notes for damaged goods. Added payment tracking with outstanding balances." },
  { date: "May 2025", title: "Reports & Analytics Dashboard", desc: "Launched 8 report types: sales trends, GST filings, profit margins, stock movement. Built exportable reports for CA submissions." },
  { date: "Sep 2025", title: "AI Invoice Scanner", desc: "Integrated Gemini AI for automatic purchase invoice extraction. Reduced manual data entry by 85%. Auto-creates products and suppliers on-the-fly." },
  { date: "Jan 2026", title: "Multi-tenant & Scale", desc: "Architected multi-company support with RLS security. Deployed role-based access (Admin, Pharmacist, Staff). Serving 40+ pharmacies." },
];

const metrics = [
  { label: "Pharmacies Onboarded", value: "40+", icon: Target },
  { label: "Invoices Processed", value: "125K+", icon: FileText },
  { label: "Data Entry Reduction", value: "85%", icon: TrendingUp },
  { label: "Regulatory Audits Passed", value: "100%", icon: CheckCircle2 },
];

const features = [
  {
    title: "Analytics Dashboard",
    desc: "Real-time sales analytics, revenue tracking, and inventory health monitoring with actionable insights.",
    img: dashboardImg,
    tags: ["Data Visualization", "KPIs", "Real-time"],
  },
  {
    title: "Inventory Management",
    desc: "Batch-level tracking with FEFO allocation, expiry alerts, reorder points, and multi-supplier support.",
    img: inventoryImg,
    tags: ["Batch Tracking", "Expiry Alerts", "FEFO"],
  },
  {
    title: "AI Invoice Scanner",
    desc: "Upload purchase invoices (PDF/image) and let AI extract all line items, auto-matching to existing products and suppliers.",
    img: scannerImg,
    tags: ["AI/ML", "OCR", "Automation"],
  },
  {
    title: "Sales & Billing",
    desc: "GST-compliant invoice generation with batch selection, discount management, and thermal print support.",
    img: salesImg,
    tags: ["GST Compliance", "Invoicing", "FIFO"],
  },
  {
    title: "Reports & Compliance",
    desc: "Comprehensive reporting suite — sales trends, GST filings, profit margins, scheduled drug registers, and audit trails.",
    img: reportsImg,
    tags: ["Analytics", "GST Reports", "Audit Trail"],
  },
];

const modules = [
  { icon: LayoutDashboard, name: "Dashboard", desc: "KPIs & analytics" },
  { icon: Package, name: "Products", desc: "Catalog management" },
  { icon: Boxes, name: "Inventory", desc: "Batch-level tracking" },
  { icon: AlertTriangle, name: "Expiry Tracking", desc: "FEFO compliance" },
  { icon: FileText, name: "Sales Orders", desc: "GST invoicing" },
  { icon: Pill, name: "Purchase Orders", desc: "Procurement" },
  { icon: ScanLine, name: "AI Scanner", desc: "Invoice OCR" },
  { icon: Users, name: "Suppliers", desc: "Vendor management" },
  { icon: Users, name: "Customers", desc: "CRM basics" },
  { icon: Shield, name: "Scheduled Drugs", desc: "H/H1/X register" },
  { icon: Wallet, name: "Accounts", desc: "Payments & ledger" },
  { icon: BarChart3, name: "Reports", desc: "8+ report types" },
];

export default function Portfolio() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-28">
          <Badge variant="secondary" className="mb-4 text-xs tracking-wider uppercase">
            Product Management Case Study
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-foreground tracking-tight leading-tight max-w-4xl">
            Building a Cloud-Native<br />
            <span className="text-primary">MedikaRP Platform</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
            A 2-year journey from zero to a multi-tenant SaaS platform serving 40+ pharmacies — 
            covering discovery, MVP, iteration, AI integration, and scale.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {["Product Strategy", "0→1 Build", "AI/ML Integration", "B2B SaaS", "Regulatory Compliance", "Multi-tenant Architecture"].map(t => (
              <Badge key={t} variant="outline" className="text-sm px-3 py-1">{t}</Badge>
            ))}
          </div>
          <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Mar 2024 — Present</span>
            <span className="flex items-center gap-1.5"><Zap className="h-4 w-4" /> Full Product Lifecycle</span>
          </div>
        </div>
      </section>

      {/* Impact Metrics */}
      <section className="border-b border-border bg-muted/30">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {metrics.map(m => (
              <div key={m.label} className="text-center">
                <m.icon className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="text-3xl md:text-4xl font-bold text-foreground">{m.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem & Context */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-foreground mb-6">The Problem</h2>
        <div className="grid md:grid-cols-2 gap-8">
          <Card className="border-destructive/20 bg-destructive/5">
            <CardContent className="p-6">
              <h3 className="font-semibold text-foreground mb-3">Before — Manual Operations</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">✗</span> Paper-based inventory with no expiry tracking</li>
                <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">✗</span> Manual GST calculations prone to errors</li>
                <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">✗</span> No batch-level FIFO/FEFO compliance</li>
                <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">✗</span> Scheduled drug registers maintained in physical logbooks</li>
                <li className="flex items-start gap-2"><span className="text-destructive mt-0.5">✗</span> Purchase invoices manually entered — 15 min per invoice</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-6">
              <h3 className="font-semibold text-foreground mb-3">After — Digital Platform</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> Real-time batch inventory with expiry alerts</li>
                <li className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> Auto-calculated GST with compliant invoices</li>
                <li className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> FEFO allocation engine for all sales</li>
                <li className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> Digital scheduled drug register with audit trails</li>
                <li className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> AI scanner reduces invoice entry to 2 minutes</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      {/* Feature Showcase with Screenshots */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-foreground mb-2">Key Features Shipped</h2>
        <p className="text-muted-foreground mb-10">Each feature went through discovery → design → build → measure cycles.</p>
        <div className="space-y-16">
          {features.map((f, i) => (
            <div key={f.title} className={`flex flex-col ${i % 2 === 1 ? 'md:flex-row-reverse' : 'md:flex-row'} gap-8 items-center`}>
              <div className="md:w-3/5">
                <div className="rounded-xl overflow-hidden border border-border shadow-lg">
                  <img src={f.img} alt={f.title} className="w-full h-auto" loading="lazy" />
                </div>
              </div>
              <div className="md:w-2/5">
                <h3 className="text-xl font-bold text-foreground mb-3">{f.title}</h3>
                <p className="text-muted-foreground leading-relaxed mb-4">{f.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {f.tags.map(t => (
                    <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* All Modules */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-foreground mb-2">Platform Modules</h2>
        <p className="text-muted-foreground mb-8">12 interconnected modules built over 2 years.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {modules.map(m => (
            <Card key={m.name} className="group hover:border-primary/40 transition-colors">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <m.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* Timeline */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-foreground mb-2">Product Timeline</h2>
        <p className="text-muted-foreground mb-10">From discovery to scale — key milestones over 2 years.</p>
        <div className="relative">
          <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-8">
            {timeline.map((item, i) => (
              <div key={item.date} className={`relative flex ${i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} items-start gap-8`}>
                <div className={`hidden md:block md:w-1/2 ${i % 2 === 0 ? 'text-right pr-8' : 'text-left pl-8'}`}>
                  {i % 2 === 0 && (
                    <Card>
                      <CardContent className="p-5">
                        <p className="text-xs font-mono text-primary mb-1">{item.date}</p>
                        <h4 className="font-semibold text-foreground mb-2">{item.title}</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                      </CardContent>
                    </Card>
                  )}
                </div>
                <div className="absolute left-4 md:left-1/2 w-3 h-3 bg-primary rounded-full -translate-x-1.5 mt-2 ring-4 ring-background" />
                <div className={`ml-10 md:ml-0 md:w-1/2 ${i % 2 === 0 ? 'md:pl-8' : 'md:pr-8'}`}>
                  {i % 2 === 1 ? (
                    <Card>
                      <CardContent className="p-5">
                        <p className="text-xs font-mono text-primary mb-1">{item.date}</p>
                        <h4 className="font-semibold text-foreground mb-2">{item.title}</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                      </CardContent>
                    </Card>
                  ) : null}
                  {/* Mobile fallback */}
                  <div className="md:hidden">
                    <Card>
                      <CardContent className="p-5">
                        <p className="text-xs font-mono text-primary mb-1">{item.date}</p>
                        <h4 className="font-semibold text-foreground mb-2">{item.title}</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* Tech & Process */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-foreground mb-8">My Role & Process</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" /> Discovery & Strategy
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• Stakeholder interviews (12 pharmacy owners)</li>
                <li>• Competitive analysis of 6 existing solutions</li>
                <li>• Feature prioritization using RICE framework</li>
                <li>• Quarterly OKR planning & roadmap updates</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Execution & Delivery
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• Wrote PRDs for all 12 modules</li>
                <li>• Managed 2-week sprint cycles</li>
                <li>• Coordinated with 3-person engineering team</li>
                <li>• Ran UAT sessions with pilot pharmacies</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Growth & Iteration
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• Tracked adoption metrics & NPS (score: 72)</li>
                <li>• A/B tested onboarding flows (38% improvement)</li>
                <li>• Reduced churn from 18% to 4% in 6 months</li>
                <li>• Led AI scanner initiative — 85% efficiency gain</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="border-t border-border bg-muted/30">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <h2 className="text-lg font-bold text-foreground mb-4">Tech Stack</h2>
          <div className="flex flex-wrap gap-2">
            {["React", "TypeScript", "Tailwind CSS", "Supabase", "PostgreSQL", "Row-Level Security",
              "Edge Functions", "Gemini AI", "PWA", "Recharts", "React Query", "Zod"
            ].map(t => (
              <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-sm text-muted-foreground">
          <p>© 2024–2026 · MedikaRP · Product Management Portfolio</p>
        </div>
      </footer>
    </div>
  );
}
