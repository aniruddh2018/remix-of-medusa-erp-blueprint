/**
 * Cross-platform keyboard abstraction layer.
 * Detects OS at runtime and provides platform-aware modifier keys.
 */

export type Platform = "mac" | "windows" | "linux";

let _platform: Platform | null = null;

export function getPlatform(): Platform {
  if (_platform) return _platform;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) _platform = "mac";
  else if (ua.includes("win")) _platform = "windows";
  else _platform = "linux";
  return _platform;
}

export function isMac(): boolean {
  return getPlatform() === "mac";
}

/** Returns the correct modifier key event property for the platform */
export function isPrimaryModifier(e: KeyboardEvent | React.KeyboardEvent): boolean {
  return isMac() ? e.metaKey : e.ctrlKey;
}

export function isSecondaryModifier(e: KeyboardEvent | React.KeyboardEvent): boolean {
  return e.altKey;
}

/** 
 * Format a shortcut for display.
 * Uses platform-native symbols on macOS and text labels on Windows/Linux.
 */
export function formatShortcut(shortcut: string): string {
  const mac = isMac();
  return shortcut
    .replace(/PRIMARY/g, mac ? "⌘" : "Ctrl")
    .replace(/SECONDARY/g, mac ? "⌥" : "Alt")
    .replace(/SHIFT/g, mac ? "⇧" : "Shift")
    .replace(/\+/g, mac ? "" : "+");
}

/**
 * Shortcut definition using platform-agnostic modifiers.
 * "primary" = Ctrl on Windows, Cmd on Mac
 * "secondary" = Alt on both (Option on Mac)
 */
export type ModifierAbstract = "primary" | "secondary" | "shift";

export interface ShortcutDef {
  key: string;
  modifiers: ModifierAbstract[];
  /** Human-readable label like "PRIMARY+K" */
  label: string;
}

/** Check if a keyboard event matches a shortcut definition */
export function matchesShortcut(e: KeyboardEvent | React.KeyboardEvent, def: ShortcutDef): boolean {
  const primaryRequired = def.modifiers.includes("primary");
  const secondaryRequired = def.modifiers.includes("secondary");
  const shiftRequired = def.modifiers.includes("shift");

  const primaryHeld = isMac() ? e.metaKey : e.ctrlKey;
  const secondaryHeld = e.altKey;
  const shiftHeld = e.shiftKey;

  if (primaryRequired !== primaryHeld) return false;
  if (secondaryRequired !== secondaryHeld) return false;
  if (shiftRequired !== shiftHeld) return false;

  // On macOS, Alt+key produces special characters, so also check event.code
  const codeFromKey =
    def.key.length === 1 && def.key >= "0" && def.key <= "9"
      ? `Digit${def.key}`
      : def.key === "/"
      ? "Slash"
      : def.key.length === 1
      ? `Key${def.key.toUpperCase()}`
      : null;

  const nativeEvent = 'nativeEvent' in e ? (e as React.KeyboardEvent).nativeEvent : e;
  const keyMatches =
    nativeEvent.key.toLowerCase() === def.key.toLowerCase() ||
    (codeFromKey !== null && nativeEvent.code === codeFromKey);

  return keyMatches;
}

/**
 * Pre-defined shortcut map for the entire ERP.
 * All shortcuts use platform-agnostic modifiers.
 */
export const SHORTCUTS = {
  // Global
  COMMAND_PALETTE: { key: "k", modifiers: ["primary"] as ModifierAbstract[], label: "PRIMARY+K" },
  COMMAND_PALETTE_SEARCH: { key: "/", modifiers: ["primary"] as ModifierAbstract[], label: "PRIMARY+/" },
  QUICK_SALE: { key: "a", modifiers: ["secondary"] as ModifierAbstract[], label: "SECONDARY+A" },
  SAVE: { key: "s", modifiers: ["primary"] as ModifierAbstract[], label: "PRIMARY+S" },
  NEW: { key: "n", modifiers: ["primary"] as ModifierAbstract[], label: "PRIMARY+N" },
  SEARCH: { key: "f", modifiers: ["primary"] as ModifierAbstract[], label: "PRIMARY+F" },
  CONFIRM: { key: "Enter", modifiers: ["primary"] as ModifierAbstract[], label: "PRIMARY+Enter" },

  // Navigation (use secondary/Alt so we don't conflict with browser Ctrl shortcuts)
  NAV_DASHBOARD: { key: "1", modifiers: ["secondary"] as ModifierAbstract[], label: "SECONDARY+1" },
  NAV_SALES: { key: "2", modifiers: ["secondary"] as ModifierAbstract[], label: "SECONDARY+2" },
  NAV_PURCHASE: { key: "3", modifiers: ["secondary"] as ModifierAbstract[], label: "SECONDARY+3" },
  NAV_INVENTORY: { key: "4", modifiers: ["secondary"] as ModifierAbstract[], label: "SECONDARY+4" },
  NAV_PRODUCTS: { key: "5", modifiers: ["secondary"] as ModifierAbstract[], label: "SECONDARY+5" },
  NAV_SUPPLIERS: { key: "6", modifiers: ["secondary"] as ModifierAbstract[], label: "SECONDARY+6" },

  // In-module
  CYCLE_PAYMENT: { key: "c", modifiers: ["secondary"] as ModifierAbstract[], label: "SECONDARY+C" },
  CHANGE_PAYMENT_TYPE: { key: "p", modifiers: ["secondary"] as ModifierAbstract[], label: "SECONDARY+P" },
  DELETE_ROW: { key: "Delete", modifiers: [] as ModifierAbstract[], label: "Del" },
  FOCUS_SEARCH: { key: "/", modifiers: [] as ModifierAbstract[], label: "/" },
  NEW_ENTRY: { key: "n", modifiers: [] as ModifierAbstract[], label: "N" },
  RESTORE_FOCUS: { key: "`", modifiers: [] as ModifierAbstract[], label: "`" },
  FOCUS_CART: { key: "l", modifiers: ["secondary"] as ModifierAbstract[], label: "SECONDARY+L" },
} as const;

/** Renders a formatted shortcut badge string for the current platform */
export function getShortcutDisplay(def: ShortcutDef): string {
  return formatShortcut(def.label);
}
