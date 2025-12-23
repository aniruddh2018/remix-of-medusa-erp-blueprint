import { useEffect, useCallback } from "react";

type ModifierKey = "ctrl" | "alt" | "shift" | "meta";

interface ShortcutOptions {
  key: string;
  modifiers?: ModifierKey[];
  callback: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcut({
  key,
  modifiers = [],
  callback,
  enabled = true,
}: ShortcutOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const modifiersMatch =
        (!modifiers.includes("ctrl") || event.ctrlKey) &&
        (!modifiers.includes("alt") || event.altKey) &&
        (!modifiers.includes("shift") || event.shiftKey) &&
        (!modifiers.includes("meta") || event.metaKey);

      const keyMatches = event.key.toLowerCase() === key.toLowerCase();

      // Check if we're inside an input field
      const isInputActive =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.getAttribute("contenteditable") === "true";

      // For counter sale (Alt+A), allow even in inputs
      if (modifiers.includes("alt") && key.toLowerCase() === "a") {
        if (modifiersMatch && keyMatches) {
          event.preventDefault();
          callback();
        }
        return;
      }

      if (modifiersMatch && keyMatches && !isInputActive) {
        event.preventDefault();
        callback();
      }
    },
    [key, modifiers, callback, enabled]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
