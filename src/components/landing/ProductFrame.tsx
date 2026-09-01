import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ProductFrameProps {
  children: ReactNode;
  className?: string;
  /** Small label shown in the frame's title bar, e.g. the route it represents. */
  label?: string;
}

/**
 * A window chrome around a recreated product screen. Used everywhere the
 * landing page shows "the app" instead of a screenshot — every stat, card
 * and badge inside is built from the same shadcn primitives the real app
 * uses (see src/pages/Dashboard.tsx, src/pages/Chat.tsx), just with
 * illustrative data, so the visual stays honest about being a recreation
 * while still looking exactly like the product.
 */
export function ProductFrame({ children, className, label }: ProductFrameProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card shadow-2xl shadow-foreground/10 overflow-hidden",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/40" />
        </div>
        {label && (
          <span className="ml-2 text-xs font-medium text-muted-foreground truncate">{label}</span>
        )}
      </div>
      <div className="bg-background">{children}</div>
    </div>
  );
}
