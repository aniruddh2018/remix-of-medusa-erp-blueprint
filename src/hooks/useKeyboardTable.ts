import { useCallback, useRef } from "react";

/**
 * Enables arrow-key navigation through focusable table rows.
 * Usage: attach `ref` to the <TableBody> or wrapping container.
 * Each <TableRow> needs tabIndex={0} and data-kb-row attribute.
 */
export function useKeyboardTable() {
  const containerRef = useRef<HTMLElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const rows = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>("[data-kb-row]") ?? []
    );
    if (!rows.length) return;

    const focused = document.activeElement as HTMLElement;
    const idx = rows.indexOf(focused);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = rows[idx + 1] ?? rows[0];
      next?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = rows[idx - 1] ?? rows[rows.length - 1];
      prev?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      rows[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      rows[rows.length - 1]?.focus();
    }
  }, []);

  return { containerRef, handleKeyDown };
}
