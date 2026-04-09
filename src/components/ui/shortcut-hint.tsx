import { formatShortcut, type ShortcutDef } from "@/lib/platform";
import { cn } from "@/lib/utils";

interface ShortcutHintProps {
  shortcut: ShortcutDef | string;
  className?: string;
  /** Show as inline text vs styled badge */
  variant?: "badge" | "inline";
}

/**
 * Renders a platform-aware keyboard shortcut hint.
 * Automatically shows ⌘ on macOS and Ctrl on Windows.
 */
export function ShortcutHint({ shortcut, className, variant = "badge" }: ShortcutHintProps) {
  const display = typeof shortcut === "string" 
    ? formatShortcut(shortcut) 
    : formatShortcut(shortcut.label);

  if (variant === "inline") {
    return <span className={cn("text-muted-foreground text-xs", className)}>{display}</span>;
  }

  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground",
        className
      )}
    >
      {display}
    </kbd>
  );
}
