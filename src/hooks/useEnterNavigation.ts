import { useCallback } from "react";

const ENTER_NAV_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([readonly]):not([data-enter-nav-skip="true"])',
  'select:not([disabled]):not([data-enter-nav-skip="true"])',
  'textarea:not([disabled]):not([data-enter-nav-skip="true"])',
  '[role="combobox"]:not([disabled]):not([data-enter-nav-skip="true"])',
].join(", ");

// Buttons are ONLY included if explicitly marked
const BUTTON_NAV_SELECTOR = 'button[data-enter-nav-include="true"]:not([disabled])';

/**
 * Keyboard navigation for forms:
 * - Enter → move to next field (blocked if current field is required & empty)
 * - ArrowRight on non-text field → move to next field
 * - ArrowLeft / Backspace on empty → move to previous field
 * - Shift+Enter → move to previous field
 * - On last field Enter → calls onLastField
 * - On first field backward → calls onFirstField
 * 
 * Buttons are SKIPPED by default during navigation to prevent accidental
 * clicks on Delete/Cancel. Only buttons with data-enter-nav-include="true"
 * are included in the navigation flow.
 */
export function useEnterNavigation(onLastField?: () => void, onFirstField?: () => void) {
  const handleEnterNav = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const eventTarget = e.target;
      if (!(eventTarget instanceof HTMLElement)) return;

      // Find the closest navigable element
      const target = eventTarget.closest<HTMLElement>(
        `${ENTER_NAV_SELECTOR}, ${BUTTON_NAV_SELECTOR}`
      );
      if (!target) return;

      // Find container
      const container =
        target.closest("[data-enter-nav]") ||
        target.closest("form") ||
        target.parentElement?.parentElement?.parentElement;
      if (!container) return;

      // Collect visible focusable elements (fields + explicitly included buttons)
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          `${ENTER_NAV_SELECTOR}, ${BUTTON_NAV_SELECTOR}`
        )
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

      const isFieldLikeButton =
        target.getAttribute("role") === "combobox" ||
        target.hasAttribute("data-field-value");

      // Check if current element is an input with a text cursor
      const isTextInput =
        (target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit"].includes(target.type)) ||
        target instanceof HTMLTextAreaElement;

      // === BACKWARD: Shift+Enter, ArrowLeft (on non-text / start of text), or Backspace on empty ===
      const isBackward =
        (e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) ||
        (e.key === "Backspace" && isFieldEmpty(target)) ||
        (e.key === "ArrowLeft" && !isTextInput);

      if (isBackward) {
        // For ArrowLeft on text inputs, only navigate if cursor is at position 0
        if (e.key === "ArrowLeft" && isTextInput) return;

        const idx = findIndex();
        if (idx <= 0) {
          if (onFirstField) {
            e.preventDefault();
            onFirstField();
          }
          return;
        }
        e.preventDefault();
        const prev = focusable[idx - 1];
        prev.focus();
        if (prev instanceof HTMLInputElement || prev instanceof HTMLTextAreaElement) {
          prev.select();
        }
        return;
      }

      // === FORWARD: Enter or ArrowRight (on non-text fields) ===
      const isForwardArrow = e.key === "ArrowRight" && !isTextInput;
      const isForwardEnter = e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;

      if (!isForwardEnter && !isForwardArrow) return;

      // For included buttons, Enter should activate them (submit action)
      const isIncludedButton = target instanceof HTMLButtonElement && target.getAttribute("data-enter-nav-include") === "true";
      if (isForwardEnter && isIncludedButton) {
        // Let the button's click fire naturally
        return;
      }

      // For combobox with OPEN dropdown, let Radix handle Enter (select the item)
      if (isFieldLikeButton && target.getAttribute("aria-expanded") === "true") return;

      // BLOCK Enter on any non-field, non-included button to prevent accidental triggers
      // (Delete, Cancel, etc.) — but NEVER block field-like buttons (Select triggers, comboboxes)
      if (isForwardEnter && target instanceof HTMLButtonElement && !isIncludedButton && !isFieldLikeButton) {
        e.preventDefault();
        return;
      }

      // Check if current field is required and empty → block forward + shake
      if (isForwardEnter && isRequiredAndEmpty(target)) {
        e.preventDefault();
        target.classList.add("animate-shake");
        setTimeout(() => target.classList.remove("animate-shake"), 500);
        target.classList.add("ring-2", "ring-destructive");
        setTimeout(() => target.classList.remove("ring-2", "ring-destructive"), 1500);
        return;
      }

      // For combobox CLOSED with a selected value → confirm + advance (do NOT open dropdown)
      // For combobox CLOSED with no value → fall through to advance (will be blocked above if required)
      if (isForwardEnter && isFieldLikeButton) {
        e.preventDefault();
        // fall through to advance
      }

      const idx = findIndex();
      if (idx === -1) return;

      if (idx < focusable.length - 1) {
        e.preventDefault();
        focusable[idx + 1].focus();
      } else if (onLastField && isForwardEnter) {
        e.preventDefault();
        onLastField();
      }
    },
    [onLastField, onFirstField]
  );

  return handleEnterNav;
}

/**
 * Auto-advance focus after a dropdown/select value is chosen.
 * Call this in onValueChange of Select components.
 */
export function advanceToNextField(currentElement: HTMLElement | null) {
  if (!currentElement) return;
  const container =
    currentElement.closest("[data-enter-nav]") ||
    currentElement.closest("form");
  if (!container) return;

  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(
      `${ENTER_NAV_SELECTOR}, ${BUTTON_NAV_SELECTOR}`
    )
  ).filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  let idx = focusable.indexOf(currentElement);
  if (idx === -1) {
    idx = focusable.findIndex(
      (el) => el === currentElement || el.contains(currentElement) || currentElement.contains(el)
    );
  }

  if (idx >= 0 && idx < focusable.length - 1) {
    setTimeout(() => focusable[idx + 1]?.focus(), 30);
  }
}

/** Check if a field has the required attribute and is empty */
function isRequiredAndEmpty(el: HTMLElement): boolean {
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
  // Radix Select / combobox: check if it has a placeholder showing (no value selected)
  // SelectValue renders data-placeholder when empty
  if (el.getAttribute("role") === "combobox") {
    const placeholderShown = el.querySelector("[data-placeholder]") !== null;
    if (placeholderShown) return true;
    // Otherwise check the rendered text content of the value span
    const valueSpan = el.querySelector("span");
    return !valueSpan || valueSpan.textContent?.trim() === "";
  }
  if (el instanceof HTMLButtonElement) {
    return false;
  }
  const inner = el.querySelector("input");
  if (inner) return inner.value.trim() === "";
  return false;
}
