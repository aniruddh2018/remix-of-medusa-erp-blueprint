import { useCallback } from "react";

const ENTER_NAV_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([readonly]):not([data-enter-nav-skip="true"])',
  'select:not([disabled]):not([data-enter-nav-skip="true"])',
  'textarea:not([disabled]):not([data-enter-nav-skip="true"])',
  'button:not([disabled]):not([data-enter-nav-skip="true"])',
  '[role="combobox"]:not([disabled]):not([data-enter-nav-skip="true"])',
].join(", ");

/**
 * Keyboard navigation for forms:
 * - Enter → move to next field (blocked if current field is required & empty)
 * - Backspace on empty field → move to previous field
 * - Shift+Enter → move to previous field
 * - On last field Enter → calls onLastField
 * - On first field backward → calls onFirstField
 */
export function useEnterNavigation(onLastField?: () => void, onFirstField?: () => void) {
  const handleEnterNav = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const eventTarget = e.target;
      if (!(eventTarget instanceof HTMLElement)) return;

      const target = eventTarget.closest<HTMLElement>(ENTER_NAV_SELECTOR);
      if (!target) return;

      // Find container
      const container =
        target.closest("[data-enter-nav]") ||
        target.closest("form") ||
        target.parentElement?.parentElement?.parentElement;
      if (!container) return;

      // Collect visible focusable elements
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(ENTER_NAV_SELECTOR)
      ).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      const findIndex = () => {
        let idx = focusable.indexOf(target);
        if (idx === -1) {
          idx = focusable.findIndex(
            (el) => el === target || el.contains(target) || target.contains(el)
          );
        }
        return idx;
      };

      // === BACKWARD: Shift+Enter or Backspace on empty ===
      const isBackward =
        (e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) ||
        (e.key === "Backspace" && isFieldEmpty(target));

      if (isBackward) {
        const idx = findIndex();
        if (idx <= 0) {
          if (onFirstField) {
            e.preventDefault();
            onFirstField();
          }
          return;
        }
        e.preventDefault();
        focusable[idx - 1].focus();
        // Select text in previous field for easy editing
        const prev = focusable[idx - 1];
        if (prev instanceof HTMLInputElement || prev instanceof HTMLTextAreaElement) {
          prev.select();
        }
        return;
      }

      // === FORWARD: Enter ===
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

      const isFieldLikeButton =
        target.getAttribute("role") === "combobox" ||
        target.hasAttribute("data-field-value");
      const isPlainActionButton = target instanceof HTMLButtonElement && !isFieldLikeButton;

      if (isPlainActionButton) return;
      if (isFieldLikeButton && target.getAttribute("aria-expanded") === "true") return;

      // Check if current field is required and empty → block forward
      if (isRequiredAndEmpty(target)) {
        if (isFieldLikeButton) return;
        e.preventDefault();
        // Shake animation hint
        target.classList.add("animate-shake");
        setTimeout(() => target.classList.remove("animate-shake"), 500);
        // Add red ring temporarily
        target.classList.add("ring-2", "ring-destructive");
        setTimeout(() => target.classList.remove("ring-2", "ring-destructive"), 1500);
        return;
      }

      const idx = findIndex();
      if (idx === -1) return;

      if (idx < focusable.length - 1) {
        e.preventDefault();
        focusable[idx + 1].focus();
      } else if (onLastField) {
        e.preventDefault();
        onLastField();
      }
    },
    [onLastField, onFirstField]
  );

  return handleEnterNav;
}

/** Check if a field has the required attribute and is empty */
function isRequiredAndEmpty(el: HTMLElement): boolean {
  // Check data-required attribute (set by ConfigurableFormField)
  const wrapper = el.closest("[data-field-required]");
  const isRequired = wrapper?.getAttribute("data-field-required") === "true" ||
    el.getAttribute("required") !== null ||
    el.getAttribute("aria-required") === "true";

  if (!isRequired) return false;
  return isFieldEmpty(el);
}

function isFieldEmpty(el: HTMLElement): boolean {
  const fieldValue = el.getAttribute("data-field-value");
  if (fieldValue !== null) {
    return fieldValue.trim() === "";
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value.trim() === "";
  }
  if (el instanceof HTMLSelectElement) {
    return !el.value;
  }
  if (el instanceof HTMLButtonElement) {
    return false;
  }
  // For combobox roles, check inner input
  const inner = el.querySelector("input");
  if (inner) return inner.value.trim() === "";
  return false;
}
