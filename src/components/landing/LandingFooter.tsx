import { Boxes } from "lucide-react";

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Boxes className="h-3.5 w-3.5" />
          </span>
          <span className="tracking-tight">
            Medika<span className="text-primary">RP</span>
          </span>
        </div>
        <p className="text-sm text-muted-foreground text-center sm:text-right">
          Operations software for pharmacies and pharma distributors.
        </p>
      </div>
    </footer>
  );
}
