import { useEffect, useCallback } from "react";
import { matchesShortcut, type ShortcutDef } from "@/lib/platform";

interface PlatformShortcutOptions {
  shortcut: ShortcutDef;
  callback: () => void;
  enabled?: boolean;
  /** Allow firing when an input/textarea is focused */
  allowInInput?: boolean;
}

/**
 * Cross-platform keyboard shortcut hook.
 * Uses the platform abstraction layer so Cmd works on Mac and Ctrl on Windows.
 */
export function usePlatformShortcut({
  shortcut,
  callback,
  enabled = true,
  allowInInput = false,
}: PlatformShortcutOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;
      if (!matchesShortcut(event, shortcut)) return;

      const isInputActive =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.getAttribute("contenteditable") === "true" ||
        document.activeElement?.getAttribute("role") === "textbox" ||
        document.activeElement?.getAttribute("role") === "combobox" ||
        document.activeElement?.hasAttribute("data-field-value");

      // Always allow modifier shortcuts; plain key shortcuts only outside inputs
      const hasModifier = shortcut.modifiers.length > 0;
      const shouldFire = allowInInput || hasModifier || !isInputActive;

      if (shouldFire) {
        event.preventDefault();
        callback();
      }
    },
    [shortcut, callback, enabled, allowInInput]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
