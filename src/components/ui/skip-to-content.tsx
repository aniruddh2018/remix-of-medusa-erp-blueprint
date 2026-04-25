import { cn } from "@/lib/utils";

interface Props {
  targetId?: string;
  className?: string;
}

/**
 * Accessibility baseline: first Tab stop on every page jumps straight to the
 * main content, bypassing the sidebar and header. Hidden until focused.
 */
export function SkipToContent({ targetId = "main-content", className }: Props) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        "sr-only focus:not-sr-only",
        "focus:fixed focus:top-3 focus:left-3 focus:z-[100]",
        "focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground",
        "focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        className,
      )}
    >
      Skip to main content
    </a>
  );
}
