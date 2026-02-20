import { useCallback, useRef, useState } from "react";

/**
 * useTableKeyboard — gives full keyboard navigation to any list/table.
 *
 * Usage:
 *   const { focusedIndex, containerProps, getRowProps } = useTableKeyboard({
 *     rowCount: items.length,
 *     onEnter: (index) => openItem(items[index]),
 *   });
 *
 * Spread `containerProps` on the <div> wrapping the table.
 * Spread `getRowProps(i)` on each <TableRow>.
 *
 * Keys:
 *   ↑ / ↓     — move focused row
 *   Home / End — jump to first / last row
 *   Enter      — trigger onEnter(index)
 *   Escape     — clear focus
 *   Tab        — exit the table naturally (browser default)
 */
export function useTableKeyboard({
  rowCount,
  onEnter,
  onEscape,
}: {
  rowCount: number;
  /** Called with the row index when Enter is pressed */
  onEnter?: (index: number) => void;
  /** Called when Escape is pressed */
  onEscape?: () => void;
}) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const clamp = (n: number) => Math.max(0, Math.min(n, rowCount - 1));

  const focusRow = useCallback(
    (index: number) => {
      const next = clamp(index);
      setFocusedIndex(next);
      // Scroll into view
      const container = containerRef.current;
      if (!container) return;
      const row = container.querySelectorAll<HTMLElement>("[data-kb-row]")[next];
      row?.scrollIntoView({ block: "nearest" });
    },
    [rowCount]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (rowCount === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          focusRow(focusedIndex < 0 ? 0 : focusedIndex + 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          focusRow(focusedIndex <= 0 ? 0 : focusedIndex - 1);
          break;
        case "Home":
          if (e.ctrlKey || focusedIndex >= 0) {
            e.preventDefault();
            focusRow(0);
          }
          break;
        case "End":
          if (e.ctrlKey || focusedIndex >= 0) {
            e.preventDefault();
            focusRow(rowCount - 1);
          }
          break;
        case "Enter":
          if (focusedIndex >= 0) {
            e.preventDefault();
            onEnter?.(focusedIndex);
          }
          break;
        case "Escape":
          if (focusedIndex >= 0) {
            e.preventDefault();
            setFocusedIndex(-1);
            onEscape?.();
          }
          break;
        default:
          break;
      }
    },
    [focusedIndex, rowCount, focusRow, onEnter, onEscape]
  );

  /** Props to spread on the container <div> */
  const containerProps = {
    ref: containerRef,
    onKeyDown: handleKeyDown,
    tabIndex: 0,
    // Don't steal focus from inner inputs/buttons
    onFocus: (e: React.FocusEvent) => {
      if (e.target === e.currentTarget && focusedIndex < 0 && rowCount > 0) {
        setFocusedIndex(0);
      }
    },
    "aria-label": "Data table — use arrow keys to navigate rows, Enter to open",
    role: "grid" as const,
    className: "outline-none",
  } as const;

  /** Props to spread on each <TableRow data-kb-row> */
  const getRowProps = (index: number) => ({
    "data-kb-row": true,
    "data-focused": focusedIndex === index ? true : undefined,
    tabIndex: focusedIndex === index ? 0 : -1,
    style:
      focusedIndex === index
        ? { outline: "2px solid hsl(var(--primary))", outlineOffset: "-2px", borderRadius: "4px" }
        : undefined,
    onClick: () => {
      setFocusedIndex(index);
    },
  });

  return { focusedIndex, setFocusedIndex, containerProps, getRowProps };
}
