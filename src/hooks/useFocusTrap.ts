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
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  isActive: boolean,
  initialFocusRef?: React.RefObject<HTMLElement>
) {
  const containerRef = useRef<T>(null);
  
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;

    // Get all focusable elements within the container
    const getFocusableElements = (): HTMLElement[] => {
      return Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS)).filter(
        (el) => el instanceof HTMLElement && el.offsetParent !== null // Visible elements
      ) as HTMLElement[];
    };

    // Focus initial element when trap activates
    const focusInitialElement = () => {
      const focusableElements = getFocusableElements();
      if (focusableElements.length > 0) {
        const initialFocus = initialFocusRef?.current || focusableElements[0];
        if (initialFocus && document.contains(initialFocus)) {
          initialFocus.focus();
          // For inputs, also select the text
          if (initialFocus instanceof HTMLInputElement || initialFocus instanceof HTMLTextAreaElement) {
            initialFocus.select();
          }
        }
      }
    };

    // Try immediately, then with increasing delays to handle dynamic content
    focusInitialElement();
    setTimeout(focusInitialElement, 50);
    setTimeout(focusInitialElement, 150);

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