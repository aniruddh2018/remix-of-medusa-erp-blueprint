import { useCallback } from "react";

/**
 * Returns an onKeyDown handler that moves focus to the next input/select/textarea
 * within the same container when Enter is pressed. On the last field, calls onLastField.
 * 
 * Usage: <Input onKeyDown={handleEnterNav} ... />
 * Wrap the form area in a container with a data-enter-nav attribute or pass a ref.
 */
export function useEnterNavigation(onLastField?: () => void) {
  const handleEnterNav = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

      const target = e.currentTarget as HTMLElement;
      
      // Find the nearest container with data-enter-nav or form
      const container =
        target.closest("[data-enter-nav]") ||
        target.closest("form") ||
        target.parentElement?.parentElement?.parentElement;
      if (!container) return;

      // Get all focusable inputs in the container
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([disabled])'
        )
      ).filter((el) => {
        // Filter out invisible elements
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      const currentIndex = focusable.indexOf(target as HTMLElement);
      if (currentIndex === -1) {
        // Try finding by closest parent
        const idx = focusable.findIndex(
          (el) => el === target || el.contains(target) || target.contains(el)
        );
        if (idx === -1) return;
        if (idx < focusable.length - 1) {
          e.preventDefault();
          focusable[idx + 1].focus();
        } else if (onLastField) {
          e.preventDefault();
          onLastField();
        }
        return;
      }

      if (currentIndex < focusable.length - 1) {
        e.preventDefault();
        focusable[currentIndex + 1].focus();
      } else if (onLastField) {
        e.preventDefault();
        onLastField();
      }
    },
    [onLastField]
  );

  return handleEnterNav;
}
