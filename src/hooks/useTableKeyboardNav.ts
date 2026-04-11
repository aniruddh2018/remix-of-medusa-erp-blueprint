import { useCallback } from "react";

/**
 * Returns an onKeyDown handler for table rows that enables:
 * - Arrow Up/Down to navigate rows
 * - Enter to trigger primary action
 * - E to edit, D to delete
 *
 * Rows must have `data-kb-row` attribute and be focusable (tabIndex={0}).
 */
export function useTableKeyboardNav(options?: {
  onEnter?: (e: HTMLElement) => void;
  onEdit?: (e: HTMLElement) => void;
  onDelete?: (e: HTMLElement) => void;
}) {
  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableRowElement>) => {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>("[data-kb-row]")
      );
      const pos = rows.indexOf(e.currentTarget);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          rows[pos + 1]?.focus();
          break;
        case "ArrowUp":
          e.preventDefault();
          rows[pos - 1]?.focus();
          break;
        case "Enter":
          e.preventDefault();
          options?.onEnter?.(e.currentTarget);
          break;
        case "e":
        case "E":
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            options?.onEdit?.(e.currentTarget);
          }
          break;
        case "d":
        case "D":
          if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            options?.onDelete?.(e.currentTarget);
          }
          break;
      }
    },
    [options?.onEnter, options?.onEdit, options?.onDelete]
  );

  return handleRowKeyDown;
}
