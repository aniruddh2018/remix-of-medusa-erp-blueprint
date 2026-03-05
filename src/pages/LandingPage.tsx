import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Package, Boxes, ScanLine, FileText, BarChart3, Shield, Pill,
  AlertTriangle, Users, Wallet, Zap, CheckCircle2, ArrowRight,
  Star, ChevronRight, Play, Globe, Lock, Smartphone
} from "lucide-react";
import logo from "@/assets/logo.png";
import dashboardImg from "@/assets/portfolio/dashboard.jpg";
import inventoryImg from "@/assets/portfolio/inventory.jpg";
import scannerImg from "@/assets/portfolio/scanner.jpg";
import salesImg from "@/assets/portfolio/sales.jpg";
import reportsImg from "@/assets/portfolio/reports.jpg";

const features = [
  { icon: Boxes, title: "Inventory Management", desc: "Batch-level tracking with FEFO allocation, expiry alerts, and reorder points." },
  { icon: FileText, title: "GST Billing", desc: "Compliant invoice generation with auto tax calculation and thermal print." },
  { icon: ScanLine, title: "AI Invoice Scanner", desc: "Upload purchase invoices and let AI extract all data automatically." },
  { icon: Pill, title: "Scheduled Drugs", desc: "Digital H/H1/X register with full audit trail for CDSCO compliance." },
  { icon: BarChart3, title: "Reports & Analytics", desc: "Sales trends, profit margins, GST reports, and exportable data." },
  { icon: Shield, title: "Multi-tenant Security", desc: "Role-based access with row-level security for complete data isolation." },
];

const screenshots = [
  { img: dashboardImg, label: "Analytics Dashboard" },
  { img: inventoryImg, label: "Inventory Management" },
  { img: scannerImg, label: "AI Invoice Scanner" },
  { img: salesImg, label: "Sales & Billing" },
  { img: reportsImg, label: "Reports & Compliance" },
];

const testimonials = [
  { name: "Dr. Rajesh Sharma", role: "Owner, MedPlus Pharmacy", text: "MedikaRP reduced our invoice processing time by 80%. The AI scanner is a game-changer.", rating: 5 },
  { name: "Priya Patel", role: "Manager, LifeCare Chemists", text: "Finally a pharmacy ERP that understands Indian compliance. GST reports are perfect.", rating: 5 },
  { name: "Amit Verma", role: "Owner, Verma Medical Store", text: "We switched from paper registers to MedikaRP. Expiry tracking alone saved us ₹2L/year.", rating: 5 },
];

const pricing = [
  { name: "Starter", price: "₹999", period: "/mo", desc: "For single-store pharmacies", features: ["Up to 500 products", "GST Billing", "Inventory tracking", "Basic reports", "Email support"] },
  { name: "Professional", price: "₹2,499", period: "/mo", desc: "For growing businesses", features: ["Unlimited products", "AI Invoice Scanner", "Scheduled drug register", "Advanced analytics", "Priority support", "Multi-user access"], popular: true },
  { name: "Enterprise", price: "Custom", period: "", desc: "For pharmacy chains", features: ["Multi-store support", "Custom integrations", "Dedicated account manager", "On-premise option", "SLA guarantee", "Training & onboarding"] },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="MedikaRP" className="w-8 h-8 rounded-lg object-contain" />
            <span className="text-xl font-bold text-foreground">MedikaRP</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#screenshots" className="hover:text-foreground transition-colors">Product</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-foreground transition-colors">Reviews</a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/portfolio")}>
              Case Study
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
              Sign In
            </Button>
            <Button size="sm" onClick={() => navigate("/auth")} className="gap-1">
              Get Started <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/5" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.08),transparent_50%)]" />
        <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-32">
          <div className="max-w-3xl">
            <Badge variant="secondary" className="mb-6 text-xs tracking-wider">
              🚀 AI-Powered Invoice Scanner — Now Live
            </Badge>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground tracking-tight leading-[1.1]">
              The ERP that<br />
              <span className="text-primary">pharmacies love</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed">
              Manage inventory, billing, compliance, and analytics — all in one cloud platform built for Indian pharmacies.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button size="lg" onClick={() => navigate("/auth")} className="gap-2 h-12 px-8 text-base">
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="gap-2 h-12 px-8 text-base" onClick={() => navigate("/portfolio")}>
                <Play className="h-4 w-4" /> View Case Study
              </Button>
            </div>
            <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> No credit card</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> 14-day free trial</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" /> GST compliant</span>
            </div>
          </div>
        </div>
        {/* Hero Screenshot */}
        <div className="max-w-6xl mx-auto px-6 pb-16">
          <div className="rounded-xl overflow-hidden border border-border shadow-2xl">
            <img src={dashboardImg} alt="MedikaRP Dashboard" className="w-full" loading="lazy" />
          </div>
        </div>
      </section>

      {/* Logos / Trust */}
      <section className="border-y border-border bg-muted/30 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-sm text-muted-foreground mb-4">Trusted by 40+ pharmacies across India</p>
          <div className="flex items-center justify-center gap-8 flex-wrap text-muted-foreground/40">
            {["MedPlus", "Apollo Pharmacy", "LifeCare", "HealthMart", "Jan Aushadhi"].map(n => (
              <span key={n} className="text-lg font-bold tracking-wider">{n}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <Badge variant="outline" className="mb-4">Features</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">Everything your pharmacy needs</h2>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">From inventory to compliance — one platform to run your entire pharmacy operation.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(f => (
            <Card key={f.title} className="group hover:border-primary/30 hover:shadow-md transition-all">
              <CardContent className="p-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* Screenshots Carousel */}
      <section id="screenshots" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <Badge variant="outline" className="mb-4">Product</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">See it in action</h2>
          <p className="mt-3 text-muted-foreground">Built by pharmacists, for pharmacists.</p>
        </div>
        <div className="space-y-12">
          {screenshots.map((s, i) => (
            <div key={s.label} className={`flex flex-col ${i % 2 === 1 ? 'md:flex-row-reverse' : 'md:flex-row'} gap-8 items-center`}>
              <div className="md:w-2/3">
                <div className="rounded-xl overflow-hidden border border-border shadow-lg">
                  <img src={s.img} alt={s.label} className="w-full" loading="lazy" />
                </div>
              </div>
              <div className="md:w-1/3">
                <h3 className="text-2xl font-bold text-foreground mb-3">{s.label}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Designed for speed and accuracy. Every screen is optimized for the daily workflow of a busy pharmacy.
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <Badge variant="outline" className="mb-4">Pricing</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">Simple, transparent pricing</h2>
          <p className="mt-3 text-muted-foreground">Start free. Scale as you grow.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {pricing.map(p => (
            <Card key={p.name} className={`relative ${p.popular ? 'border-primary shadow-lg ring-1 ring-primary/20' : ''}`}>
              {p.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                </div>
              )}
              <CardContent className="p-6 pt-8">
                <h3 className="text-lg font-bold text-foreground">{p.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{p.desc}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-foreground">{p.price}</span>
                  <span className="text-muted-foreground">{p.period}</span>
                </div>
                <Button className="w-full mb-6" variant={p.popular ? "default" : "outline"} onClick={() => navigate("/auth")}>
                  Get Started
                </Button>
                <ul className="space-y-2.5">
                  {p.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* Testimonials */}
      <section id="testimonials" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <Badge variant="outline" className="mb-4">Reviews</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">Loved by pharmacy owners</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map(t => (
            <Card key={t.name}>
              <CardContent className="p-6">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">"{t.text}"</p>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-primary/5">
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Ready to modernize your pharmacy?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
            Join 40+ pharmacies already using MedikaRP. Start your free 14-day trial today.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" onClick={() => navigate("/auth")} className="gap-2 h-12 px-8">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/portfolio")} className="h-12 px-8">
              Read Case Study
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <img src={logo} alt="MedikaRP" className="w-6 h-6 rounded object-contain" />
                <span className="font-bold text-foreground">MedikaRP</span>
              </div>
              <p className="text-sm text-muted-foreground">Cloud-native ERP for modern Indian pharmacies.</p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-3 text-sm">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground">Features</a></li>
                <li><a href="#pricing" className="hover:text-foreground">Pricing</a></li>
                <li><a href="#screenshots" className="hover:text-foreground">Screenshots</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-3 text-sm">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button onClick={() => navigate("/portfolio")} className="hover:text-foreground">Case Study</button></li>
                <li><a href="#testimonials" className="hover:text-foreground">Reviews</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-3 text-sm">Security</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> SOC 2 Compliant</li>
                <li className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> 99.9% Uptime</li>
                <li className="flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> PWA Ready</li>
              </ul>
            </div>
          </div>
          <Separator className="my-8" />
          <p className="text-center text-xs text-muted-foreground">© 2024–2026 MedikaRP. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
