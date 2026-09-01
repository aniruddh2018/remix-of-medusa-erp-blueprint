import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, PlayCircle } from "lucide-react";
import { HeroProductMock } from "./HeroProductMock";
import { Reveal } from "./Reveal";

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section id="top" className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,hsl(var(--primary)/0.10),transparent_45%)]"
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24 lg:pt-28">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-12 lg:gap-8 items-center">
          <div className="max-w-xl">
            <Reveal>
              <p className="text-sm font-semibold text-primary tracking-wide">
                Operations software for pharmacies &amp; pharma distributors
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-4 text-4xl sm:text-5xl lg:text-[3.4rem] font-bold tracking-tight text-foreground leading-[1.08]">
                Run the business.
                <br />
                Not six spreadsheets and a WhatsApp thread.
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
                Inventory, billing, GST compliance, ledgers, and the register your regulator asks
                for — in one system with one audit trail, instead of stitched together by hand
                every evening.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" className="h-12 px-7 text-base gap-2" onClick={() => navigate("/auth")}>
                  Sign in to your workspace <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-7 text-base gap-2"
                  onClick={() =>
                    document.getElementById("product-in-action")?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  <PlayCircle className="h-4 w-4" /> See how it works
                </Button>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <p className="mt-6 text-sm text-muted-foreground">
                Provisioned by your administrator — built for teams already running the business,
                not a self-serve trial.
              </p>
            </Reveal>
          </div>

          <Reveal delay={200} className="lg:pl-4">
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-6 -z-10 rounded-[2rem] bg-primary/5 blur-2xl hidden sm:block"
              />
              <HeroProductMock />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
