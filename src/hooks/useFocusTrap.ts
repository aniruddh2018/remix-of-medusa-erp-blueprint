import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(', ');

/**
 * Hook to trap focus within a container element.
 * Prevents focus from escaping the container when tabbing.
 *
 * @param isActive - Whether focus trapping is active
 * @param initialFocusRef - Optional ref to element that should receive initial focus
 */
export function useFocusTrap(isActive: boolean, initialFocusRef?: React.RefObject<HTMLElement>) {
  const containerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isActive) return;

    const container = containerRef.current;
    if (!container) return;

    // Get all focusable elements within the container
    const getFocusableElements = (): HTMLElement[] => {
      return Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS)).filter(
        (el) => el instanceof HTMLElement && el.offsetParent !== null // Visible elements
      ) as HTMLElement[];
    };

    // Focus first element when trap activates
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      const initialFocus = initialFocusRef?.current || focusableElements[0];
      setTimeout(() => initialFocus.focus(), 10); // Small delay to ensure DOM is ready
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement;

      if (e.shiftKey) {
        // Shift+Tab: move to previous element
        if (activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: move to next element
        if (activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      // If focus is moving outside the container, prevent it
      const target = e.target as HTMLElement;
      const relatedTarget = e.relatedTarget as HTMLElement;

      if (target && container.contains(target) && relatedTarget && !container.contains(relatedTarget)) {
        // Focus is leaving the container, redirect to first element
        const focusableElements = getFocusableElements();
        if (focusableElements.length > 0) {
          e.preventDefault();
          focusableElements[0].focus();
        }
      }
    };

    // Add event listeners
    container.addEventListener('keydown', handleKeyDown);
    container.addEventListener('focusout', handleFocusOut);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      container.removeEventListener('focusout', handleFocusOut);
    };
  }, [isActive, initialFocusRef]);

  return containerRef;
}