import { useEffect, useCallback } from "react";
import { isMac } from "@/lib/platform";

type ModifierKey = "ctrl" | "alt" | "shift" | "meta";

interface ShortcutOptions {
  key: string;
  modifiers?: ModifierKey[];
  callback: () => void;
  enabled?: boolean;
  /** Allow this shortcut to fire even when an input/textarea is focused */
  allowInInput?: boolean;
}

/**
 * Legacy keyboard shortcut hook.
 * For new shortcuts, prefer usePlatformShortcut which handles cross-platform automatically.
 */
export function useKeyboardShortcut({
  key,
  modifiers = [],
  callback,
  enabled = true,
  allowInInput = false,
}: ShortcutOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const modifiersMatch =
        (!modifiers.includes("ctrl") || event.ctrlKey) &&
        (!modifiers.includes("alt") || event.altKey) &&
        (!modifiers.includes("shift") || event.shiftKey) &&
        (!modifiers.includes("meta") || event.metaKey);

      // On macOS, Alt+key produces special characters (e.g. Alt+1 → ¡)
      // so we also match against event.code (e.g. "Digit1", "KeyA") as a fallback
      const codeFromKey =
        key.length === 1 && key >= "0" && key <= "9"
          ? `Digit${key}`
          : key.length === 1
          ? `Key${key.toUpperCase()}`
          : null;
      const keyMatches =
        event.key.toLowerCase() === key.toLowerCase() ||
        (codeFromKey !== null && event.code === codeFromKey);

      const isInputActive =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.getAttribute("contenteditable") === "true";

      // Always allow shortcuts with Alt or Ctrl modifiers (navigation shortcuts), 
      // and explicitly allowed shortcuts
      const isModifierShortcut = modifiers.includes("alt") || modifiers.includes("ctrl");
      const shouldFire = allowInInput || isModifierShortcut || !isInputActive;

      if (modifiersMatch && keyMatches && shouldFire) {
        event.preventDefault();
        callback();
      }
    },
    [key, modifiers, callback, enabled, allowInInput]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
