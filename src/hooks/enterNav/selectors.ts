/**
 * Central selector list for fields participating in Enter/Shift+Enter navigation.
 * Keep this list small and intentional — anything not matched is invisible to the engine.
 */
export const ENTER_NAV_SELECTOR = [
  'input:not([type="hidden"]):not([disabled]):not([readonly]):not([data-enter-nav-skip="true"])',
  'select:not([disabled]):not([data-enter-nav-skip="true"])',
  'textarea:not([disabled]):not([data-enter-nav-skip="true"])',
  '[role="combobox"]:not([disabled]):not([data-enter-nav-skip="true"])',
  '[role="textbox"][tabindex]:not([data-enter-nav-skip="true"])',
].join(", ");

/** Buttons are excluded by default. Opt-in with data-enter-nav-include="true". */
export const BUTTON_NAV_SELECTOR =
  'button[data-enter-nav-include="true"]:not([disabled])';

/** Collect visible focusables inside a container, in DOM order. */
export function findFocusables(container: Element): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      `${ENTER_NAV_SELECTOR}, ${BUTTON_NAV_SELECTOR}`
    )
  ).filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

/** Find the closest navigable element from any nested target. */
export function findNavigableTarget(eventTarget: EventTarget | null): HTMLElement | null {
  if (!(eventTarget instanceof HTMLElement)) return null;
  return eventTarget.closest<HTMLElement>(
    `${ENTER_NAV_SELECTOR}, ${BUTTON_NAV_SELECTOR}`
  );
}

/** Find the navigation container for a target element. */
export function findNavContainer(target: HTMLElement): Element | null {
  return (
    target.closest("[data-enter-nav]") ||
    target.closest("form") ||
    target.parentElement?.parentElement?.parentElement ||
    null
  );
}
