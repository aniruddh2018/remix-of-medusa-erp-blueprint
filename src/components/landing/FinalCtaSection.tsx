import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./Reveal";

export function FinalCtaSection() {
  const navigate = useNavigate();

  return (
    <section className="py-20 sm:py-28">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <Reveal>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight">
            Your business is already running.
            <br />
            The system should keep up with it.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <p className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto">
            If your workspace has already been set up, sign in and pick up where you left off.
          </p>
        </Reveal>
        <Reveal delay={180}>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" className="h-12 px-8 text-base gap-2" onClick={() => navigate("/auth")}>
              Sign in to your workspace <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-8 text-base"
              onClick={() => document.getElementById("top")?.scrollIntoView({ behavior: "smooth" })}
            >
              Revisit how it works
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
