import { useEffect, useRef } from "react";
import {
  KeyboardManager,
  type InputBehavior,
  type ShortcutScope,
} from "@/lib/keyboard/manager";
import type { ShortcutDef } from "@/lib/platform";
import { getCatalogEntry } from "@/lib/keyboard/shortcuts-registry";

export interface UseShortcutOptions {
  /**
   * Stable id. If it matches a catalog entry id, description/category/shortcut
   * are auto-inherited — you only need to pass the callback.
   */
  id: string;
  /** Required unless `id` references a catalog entry. */
  shortcut?: ShortcutDef;
  description?: string;
  category?: string;
  /** Callback. Return `false` to allow default browser behavior. */
  callback: (e: KeyboardEvent) => boolean | void;
  /** Scope name — defaults to "global". Use `useScope` to push a local scope. */
  scope?: ShortcutScope;
  priority?: number;
  inputBehavior?: InputBehavior;
  enabled?: boolean;
  hidden?: boolean;
}

/**
 * Register a shortcut with the central KeyboardManager.
 *
 * Preferred over useKeyboardShortcut / usePlatformShortcut for new code:
 * single listener, scope-aware, shows up in the help dialog.
 */
export function useShortcut(options: UseShortcutOptions) {
  const {
    id,
    shortcut: shortcutOverride,
    description: descOverride,
    category: categoryOverride,
    callback,
    scope = "global",
    priority,
    inputBehavior,
    enabled = true,
    hidden,
  } = options;

  // Always keep the latest callback without forcing re-registration.
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const catalog = getCatalogEntry(id);
    const shortcut = shortcutOverride ?? catalog?.shortcut;
    if (!shortcut) {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          `[useShortcut] id "${id}" is not in SHORTCUT_CATALOG and no shortcut was provided.`,
        );
      }
      return;
    }

    const unregister = KeyboardManager.register({
      id: `${scope}:${id}`,
      shortcut,
      description: descOverride ?? catalog?.description ?? id,
      category: categoryOverride ?? catalog?.category ?? "Global",
      scope,
      priority,
      inputBehavior,
      hidden: hidden ?? false,
      enabled: () => enabledRef.current,
      handler: (e) => callbackRef.current(e),
    });

    return unregister;
    // We intentionally re-register only when identity fields change.
  }, [
    id,
    scope,
    priority,
    inputBehavior,
    hidden,
    shortcutOverride,
    descOverride,
    categoryOverride,
  ]);
}

/**
 * Push a scope onto the KeyboardManager's scope stack for the component's
 * lifetime. Any `useShortcut({ scope: name })` calls inside this subtree
 * will shadow conflicting global shortcuts while the scope is active.
 *
 * Typical usage inside a dialog:
 *   useScope("dialog:edit-sale");
 */
export function useScope(scope: ShortcutScope, active = true) {
  useEffect(() => {
    if (!active) return;
    const pop = KeyboardManager.pushScope(scope);
    return pop;
  }, [scope, active]);
}
