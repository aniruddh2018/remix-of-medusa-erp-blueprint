import { useCallback } from "react";
import {
  ENTER_NAV_SELECTOR,
  BUTTON_NAV_SELECTOR,
  findFocusables,
  findNavigableTarget,
  findNavContainer,
} from "./enterNav/selectors";
import {
  shakeAndWarn,
  isFieldEmpty,
  isRequiredAndEmpty,
  isFieldDeclaredInvalid,
} from "./enterNav/feedback";

export interface EnterNavOptions {
  /** Called when forward Enter happens on the last field (e.g. submit). */
  onLastField?: () => void;
  /** Called when backward navigation happens past the first field. */
  onFirstField?: () => void;
  /**
   * Custom guard. Return a string (error message) to BLOCK forward navigation,
   * or null/undefined to allow. Receives the current field element.
   * Use for business rules: out-of-stock, dependent fields, etc.
   */
  blockForward?: (currentField: HTMLElement) => string | null | undefined;
}

/**
 * Keyboard navigation engine for forms (the ERP standard).
 *
 * Forward (Enter / ArrowRight on non-text):
 *   - Blocked if current field is required & empty (shake + hint)
 *   - Blocked if field declares data-field-invalid="true" (shake + hint)
 *   - Blocked if blockForward() returns a message (shake + hint)
 *   - On last field → onLastField()
 *
 * Backward (Shift+Enter / Backspace-on-empty / ArrowLeft on non-text):
 *   - Strict reverse DOM order, no skipping
 *   - On first field → onFirstField()
 *
 * Buttons are skipped by default. Opt-in via data-enter-nav-include="true".
 * Fields can opt out via data-enter-nav-skip="true".
 *
 * Backwards-compatible signature: useEnterNavigation(onLast, onFirst)
 * still works, or pass an options object.
 */
export function useEnterNavigation(
  onLastFieldOrOptions?: (() => void) | EnterNavOptions,
  onFirstField?: () => void
) {
  const opts: EnterNavOptions =
    typeof onLastFieldOrOptions === "function" || onLastFieldOrOptions == null
      ? { onLastField: onLastFieldOrOptions as (() => void) | undefined, onFirstField }
      : onLastFieldOrOptions;

  const handleEnterNav = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const target = findNavigableTarget(e.target);
      if (!target) return;

      const container = findNavContainer(target);
      if (!container) return;

      const focusable = findFocusables(container);

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

      const isTextInput =
        (target instanceof HTMLInputElement &&
          !["checkbox", "radio", "button", "submit"].includes(target.type)) ||
        target instanceof HTMLTextAreaElement;

      // === BACKWARD ===
      const isBackward =
        (e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) ||
        (e.key === "Backspace" && isFieldEmpty(target)) ||
        (e.key === "ArrowLeft" && !isTextInput);

      if (isBackward) {
        if (e.key === "ArrowLeft" && isTextInput) return;

        const idx = findIndex();
        if (idx <= 0) {
          if (opts.onFirstField) {
            e.preventDefault();
            opts.onFirstField();
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

      // === FORWARD ===
      const isForwardArrow = e.key === "ArrowRight" && !isTextInput;
      const isForwardEnter =
        e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;

      if (!isForwardEnter && !isForwardArrow) return;

      const isIncludedButton =
        target instanceof HTMLButtonElement &&
        target.getAttribute("data-enter-nav-include") === "true";

      if (isForwardEnter && isIncludedButton) return; // let click fire

      // Combobox with OPEN dropdown — let Radix handle it
      if (isFieldLikeButton && target.getAttribute("aria-expanded") === "true") return;

      // Block Enter on non-field, non-included buttons
      if (
        isForwardEnter &&
        target instanceof HTMLButtonElement &&
        !isIncludedButton &&
        !isFieldLikeButton
      ) {
        e.preventDefault();
        return;
      }

      // 1) Required + empty
      if (isForwardEnter && isRequiredAndEmpty(target)) {
        e.preventDefault();
        shakeAndWarn(target, "Please complete this field");
        return;
      }

      // 2) Field-declared invalid
      if (isForwardEnter && isFieldDeclaredInvalid(target)) {
        e.preventDefault();
        const msg = target.getAttribute("data-field-error") || "Please correct this field";
        shakeAndWarn(target, msg);
        return;
      }

      // 3) Custom business-rule guard
      if (isForwardEnter && opts.blockForward) {
        const msg = opts.blockForward(target);
        if (msg) {
          e.preventDefault();
          shakeAndWarn(target, msg);
          return;
        }
      }

      // Combobox closed with selected value → confirm + advance
      if (isForwardEnter && isFieldLikeButton) {
        e.preventDefault();
        // fall through to advance
      }

      const idx = findIndex();
      if (idx === -1) return;

      if (idx < focusable.length - 1) {
        e.preventDefault();
        focusable[idx + 1].focus();
      } else if (opts.onLastField && isForwardEnter) {
        e.preventDefault();
        opts.onLastField();
      }
    },
    [opts.onLastField, opts.onFirstField, opts.blockForward]
  );

  return handleEnterNav;
}

/**
 * Auto-advance focus after a dropdown/select value is chosen.
 * Call in onValueChange of Select / custom selectors.
 */
export function advanceToNextField(currentElement: HTMLElement | null) {
  if (!currentElement) return;
  const container =
    currentElement.closest("[data-enter-nav]") || currentElement.closest("form");
  if (!container) return;

  const focusable = findFocusables(container);

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

// Re-export selector constants for advanced usage
export { ENTER_NAV_SELECTOR, BUTTON_NAV_SELECTOR };
