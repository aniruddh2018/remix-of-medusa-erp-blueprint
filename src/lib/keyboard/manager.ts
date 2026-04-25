/**
 * Centralized Keyboard Manager (singleton).
 *
 * Responsibilities:
 *  - Single window-level keydown listener (avoids N listeners across the app).
 *  - Scope-based dispatch: later-pushed scopes override earlier ones for the
 *    same shortcut, so opening a dialog can temporarily remap keys without
 *    disabling global ones.
 *  - Registry of all active shortcuts, usable by the help dialog.
 *  - Conflict detection in development.
 *
 * Existing hooks (usePlatformShortcut, useKeyboardShortcut) keep working —
 * this manager is additive. New code should prefer `useShortcut` /
 * `useScopedShortcut` which delegate here.
 */
import { matchesShortcut, type ShortcutDef } from "@/lib/platform";

/** A scope is a named stack frame for shortcuts (e.g. "global", "dialog:edit-sale"). */
export type ShortcutScope = string;

/** How a registered shortcut should behave when text input is focused. */
export type InputBehavior =
  /** Default: fire only if no text field is focused OR a modifier is held. */
  | "default"
  /** Always fire, even inside text fields. Use for Save, Esc, etc. */
  | "always"
  /** Never fire when any text field is focused. */
  | "never";

export interface ShortcutRegistration {
  /** Stable unique id — used for dedupe + debugging. */
  id: string;
  /** Platform-agnostic shortcut definition. */
  shortcut: ShortcutDef;
  /** Human-readable action label (shown in help dialog). */
  description: string;
  /** Grouping label for help dialog (e.g. "Global", "Sales", "Tables"). */
  category: string;
  /** Scope name. Higher priority scopes shadow lower ones for same combo. */
  scope: ShortcutScope;
  /** Priority within a scope (higher wins). Default 0. */
  priority?: number;
  /** Input-focus behavior. */
  inputBehavior?: InputBehavior;
  /** Hidden from help dialog if true. */
  hidden?: boolean;
  /** Handler. Return `true` to stop further dispatch + prevent default. */
  handler: (e: KeyboardEvent) => boolean | void;
  /** Additional per-call enabled flag evaluated at dispatch time. */
  enabled?: () => boolean;
}

type RegistrationRecord = Required<
  Pick<ShortcutRegistration, "priority" | "inputBehavior" | "hidden">
> &
  ShortcutRegistration;

/** Detect whether a text-editable element currently has focus. */
function isTextInputActive(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    // Checkboxes / radios / buttons should NOT block shortcuts.
    if (["checkbox", "radio", "button", "submit", "reset"].includes(type)) return false;
    return true;
  }
  if (tag === "TEXTAREA") return true;
  if (el.getAttribute("contenteditable") === "true") return true;
  const role = el.getAttribute("role");
  if (role === "textbox" || role === "combobox" || role === "searchbox") return true;
  if (el.hasAttribute("data-field-value")) return true;
  return false;
}

class KeyboardManagerImpl {
  private registrations = new Map<string, RegistrationRecord>();
  private scopeStack: ShortcutScope[] = ["global"];
  private listenerAttached = false;
  private subscribers = new Set<() => void>();

  // ---------- listener lifecycle ----------

  private ensureListener() {
    if (this.listenerAttached || typeof window === "undefined") return;
    window.addEventListener("keydown", this.handleKeyDown, { capture: false });
    this.listenerAttached = true;
  }

  // ---------- registration ----------

  register(reg: ShortcutRegistration): () => void {
    this.ensureListener();
    const record: RegistrationRecord = {
      priority: 0,
      inputBehavior: "default",
      hidden: false,
      ...reg,
    };

    if (process.env.NODE_ENV !== "production") {
      const existing = this.registrations.get(reg.id);
      if (existing && existing.scope === record.scope) {
        console.warn(
          `[KeyboardManager] Duplicate shortcut id "${reg.id}" in scope "${reg.scope}" — overwriting.`,
        );
      }
    }

    this.registrations.set(reg.id, record);
    this.notify();

    return () => {
      const current = this.registrations.get(reg.id);
      // Only remove if still the same registration (avoid racing StrictMode double mount).
      if (current === record) {
        this.registrations.delete(reg.id);
        this.notify();
      }
    };
  }

  // ---------- scope stack ----------

  pushScope(scope: ShortcutScope): () => void {
    this.scopeStack.push(scope);
    this.notify();
    return () => this.popScope(scope);
  }

  private popScope(scope: ShortcutScope) {
    // Pop by name from top (works even if nesting order differs).
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      if (this.scopeStack[i] === scope) {
        this.scopeStack.splice(i, 1);
        this.notify();
        return;
      }
    }
  }

  /** Current active scopes, innermost last. */
  getActiveScopes(): readonly ShortcutScope[] {
    return this.scopeStack;
  }

  // ---------- dispatch ----------

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;

    // Walk scopes from innermost to outermost. First match wins.
    const scopes = this.scopeStack;
    const inputActive = isTextInputActive();

    for (let s = scopes.length - 1; s >= 0; s--) {
      const scope = scopes[s];
      const candidates: RegistrationRecord[] = [];
      for (const reg of this.registrations.values()) {
        if (reg.scope !== scope) continue;
        if (!matchesShortcut(e, reg.shortcut)) continue;
        if (reg.enabled && !reg.enabled()) continue;
        if (!this.shouldFireInInputContext(reg, inputActive)) continue;
        candidates.push(reg);
      }

      if (candidates.length === 0) continue;

      // Highest priority wins; ties resolved by insertion order (latest registered).
      candidates.sort((a, b) => b.priority - a.priority);
      const chosen = candidates[0];
      const result = chosen.handler(e);
      if (result !== false) {
        e.preventDefault();
      }
      return; // Matched in this scope — stop walking.
    }
  };

  private shouldFireInInputContext(
    reg: RegistrationRecord,
    inputActive: boolean,
  ): boolean {
    if (reg.inputBehavior === "always") return true;
    if (reg.inputBehavior === "never") return !inputActive;
    // default: modifier shortcuts fire always, plain keys only outside inputs.
    const hasModifier = reg.shortcut.modifiers.length > 0;
    return hasModifier || !inputActive;
  }

  // ---------- introspection (for help dialog) ----------

  listRegistered(): RegistrationRecord[] {
    return Array.from(this.registrations.values());
  }

  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  private notify() {
    this.subscribers.forEach((cb) => cb());
  }

  // ---------- test hooks ----------

  /** @internal — reset state between tests. */
  __resetForTests() {
    this.registrations.clear();
    this.scopeStack = ["global"];
    this.subscribers.clear();
  }
}

export const KeyboardManager = new KeyboardManagerImpl();
