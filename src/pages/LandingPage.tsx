import { LandingNav } from "@/components/landing/LandingNav";
import { HeroSection } from "@/components/landing/HeroSection";
import { RealityCheckSection } from "@/components/landing/RealityCheckSection";
import { ProductInActionSection } from "@/components/landing/ProductInActionSection";
import { CapabilitiesSection } from "@/components/landing/CapabilitiesSection";
import { DayInProductSection } from "@/components/landing/DayInProductSection";
import { WhyDifferentSection } from "@/components/landing/WhyDifferentSection";
import { FinalCtaSection } from "@/components/landing/FinalCtaSection";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main>
        <HeroSection />
        <RealityCheckSection />
        <ProductInActionSection />
        <CapabilitiesSection />
        <DayInProductSection />
        <WhyDifferentSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
