import { useEffect, useRef, useCallback } from "react";

/**
 * Hook to track the last focused element and provide focus restoration
 * Useful for keyboard shortcuts that need to return focus to previous location
 */
export function useFocusRestoration() {
  const lastFocusedElement = useRef<HTMLElement | null>(null);

  // Track focus changes
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      // Only track focusable elements (skip body, html, etc.)
      if (target && target !== document.body && target !== document.documentElement) {
        lastFocusedElement.current = target;
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      // Keep track of the element that just lost focus
      const target = e.target as HTMLElement;
      if (target && target !== document.body && target !== document.documentElement) {
        lastFocusedElement.current = target;
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Restore focus to last focused element
  const restoreFocus = useCallback(() => {
    if (lastFocusedElement.current) {
      const element = lastFocusedElement.current;
      // Check if element still exists and is visible
      if (document.contains(element) && element.offsetParent !== null) {
        element.focus();
        // If it's an input, select the text
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          element.select();
        }
        return true;
      }
    }
    return false;
  }, []);

  // Get the last focused element (for debugging)
  const getLastFocusedElement = useCallback(() => lastFocusedElement.current, []);

  return {
    restoreFocus,
    getLastFocusedElement,
  };
}