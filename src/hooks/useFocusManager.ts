import { useCallback, useRef } from "react";
// NOTE: A dedicated useFocusTrap hook lives in ./useFocusTrap.ts.
// This file used to export a second version; it was removed to avoid
// import ambiguity. Use `import { useFocusTrap } from "@/hooks/useFocusTrap"`.

const FOCUSABLE_SELECTOR =
  'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [role="combobox"]:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

/**
 * Focus management system for keyboard-first UX.
 * Provides utilities to manage focus within a container.
 */
export function useFocusManager(containerRef?: React.RefObject<HTMLElement>) {
  const internalRef = useRef<HTMLElement>(null);
  const ref = containerRef || internalRef;

  /** Get all visible, focusable elements in the container */
  const getFocusableElements = useCallback(() => {
    if (!ref.current) return [];
    return Array.from(
      ref.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }, [ref]);

  /** Focus the first focusable element */
  const focusFirst = useCallback(() => {
    const elements = getFocusableElements();
    if (elements.length > 0) {
      elements[0].focus();
    }
  }, [getFocusableElements]);

  /** Focus the last focusable element */
  const focusLast = useCallback(() => {
    const elements = getFocusableElements();
    if (elements.length > 0) {
      elements[elements.length - 1].focus();
    }
  }, [getFocusableElements]);

  /** Focus the next focusable element relative to currently focused */
  const focusNext = useCallback(() => {
    const elements = getFocusableElements();
    const active = document.activeElement as HTMLElement;
    const idx = elements.indexOf(active);
    if (idx < elements.length - 1) {
      elements[idx + 1].focus();
      return true;
    }
    return false;
  }, [getFocusableElements]);

  /** Focus the previous focusable element */
  const focusPrev = useCallback(() => {
    const elements = getFocusableElements();
    const active = document.activeElement as HTMLElement;
    const idx = elements.indexOf(active);
    if (idx > 0) {
      elements[idx - 1].focus();
      return true;
    }
    return false;
  }, [getFocusableElements]);

  /** Focus a specific element by index */
  const focusAt = useCallback((index: number) => {
    const elements = getFocusableElements();
    if (index >= 0 && index < elements.length) {
      elements[index].focus();
    }
  }, [getFocusableElements]);

  /** Auto-focus first element on mount */
  const autoFocusFirst = useCallback((delay = 50) => {
    setTimeout(focusFirst, delay);
  }, [focusFirst]);

  return {
    ref,
    focusFirst,
    focusLast,
    focusNext,
    focusPrev,
    focusAt,
    autoFocusFirst,
    getFocusableElements,
  };
}
