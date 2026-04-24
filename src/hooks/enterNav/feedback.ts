/**
 * Visual + structural helpers for the Enter-nav engine.
 * - shakeAndWarn: red shake + transient inline hint when forward is blocked
 * - isFieldEmpty / isRequiredAndEmpty: empty + required detection across input types
 */

/** Show a transient inline hint near the field (non-blocking, auto-dismissed). */
export function showInlineHint(el: HTMLElement, message: string) {
  const existing = el.parentElement?.querySelector("[data-enter-hint]");
  if (existing) return;
  const hint = document.createElement("div");
  hint.setAttribute("data-enter-hint", "true");
  hint.textContent = message;
  hint.className =
    "absolute -bottom-5 left-0 z-50 text-[10px] font-medium text-destructive bg-background px-1.5 py-0.5 rounded shadow-sm border border-destructive/30 animate-in fade-in slide-in-from-top-1";
  const parent = el.parentElement;
  if (!parent) return;
  const prevPosition = parent.style.position;
  if (!prevPosition || prevPosition === "static") parent.style.position = "relative";
  parent.appendChild(hint);
  setTimeout(() => {
    hint.remove();
    if (!prevPosition) parent.style.position = "";
  }, 1800);
}

/** Shake + ring + inline hint. The standard "blocked forward" feedback. */
export function shakeAndWarn(el: HTMLElement, message = "Please complete this field") {
  el.classList.add("animate-shake");
  setTimeout(() => el.classList.remove("animate-shake"), 500);
  el.classList.add("ring-2", "ring-destructive");
  setTimeout(() => el.classList.remove("ring-2", "ring-destructive"), 1500);
  showInlineHint(el, message);
}

/** Whether a field's current value is empty. Handles input, textarea, select, combobox, chip. */
export function isFieldEmpty(el: HTMLElement): boolean {
  const fieldValue = el.getAttribute("data-field-value");
  if (fieldValue !== null) return fieldValue.trim() === "";

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value.trim() === "";
  }
  if (el instanceof HTMLSelectElement) return !el.value;

  // Radix Select / combobox: empty when placeholder is shown
  if (el.getAttribute("role") === "combobox") {
    if (el.querySelector("[data-placeholder]") !== null) return true;
    const valueSpan = el.querySelector("span");
    return !valueSpan || valueSpan.textContent?.trim() === "";
  }
  if (el instanceof HTMLButtonElement) return false;
  const inner = el.querySelector("input");
  if (inner) return inner.value.trim() === "";
  return false;
}

/** Required + empty check using data-field-required wrapper or required attribute. */
export function isRequiredAndEmpty(el: HTMLElement): boolean {
  const wrapper = el.closest("[data-field-required]");
  const isRequired =
    wrapper?.getAttribute("data-field-required") === "true" ||
    el.getAttribute("required") !== null ||
    el.getAttribute("aria-required") === "true";
  if (!isRequired) return false;
  return isFieldEmpty(el);
}

/** Field-declared invalid flag (set by the field via data-field-invalid="true"). */
export function isFieldDeclaredInvalid(el: HTMLElement): boolean {
  const wrapper = el.closest("[data-field-invalid]");
  return (
    el.getAttribute("data-field-invalid") === "true" ||
    wrapper?.getAttribute("data-field-invalid") === "true"
  );
}
