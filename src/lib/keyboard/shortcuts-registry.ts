/**
 * Central catalog of every shortcut in the ERP.
 *
 * This is the single source of truth for:
 *   - What key combo does what
 *   - Which category it belongs to (for the help dialog)
 *   - Human description
 *
 * Re-exports the raw SHORTCUTS map from platform.ts so existing call sites
 * keep working. New shortcuts should be added here first, then consumed via
 * `useShortcut({ id: "save", ... })`.
 */
import { SHORTCUTS as _SHORTCUTS, type ShortcutDef } from "@/lib/platform";

export const SHORTCUTS = _SHORTCUTS;

export type ShortcutCategory =
  | "Global"
  | "Navigation"
  | "Billing & Cart"
  | "Tables"
  | "Forms"
  | "Dialogs"
  | "Search";

export interface ShortcutCatalogEntry {
  id: string;
  shortcut: ShortcutDef;
  description: string;
  category: ShortcutCategory;
  /** Where the shortcut actually applies (for the help dialog copy). */
  scopeLabel?: string;
}

/**
 * Master catalog. Extend freely — the help dialog reads from here, and the
 * manager's runtime registry cross-references by `id`.
 */
export const SHORTCUT_CATALOG: ShortcutCatalogEntry[] = [
  // Global
  {
    id: "command-palette",
    shortcut: SHORTCUTS.COMMAND_PALETTE,
    description: "Open command palette",
    category: "Global",
  },
  {
    id: "command-palette-search",
    shortcut: SHORTCUTS.COMMAND_PALETTE_SEARCH,
    description: "Open command palette (search key)",
    category: "Global",
  },
  {
    id: "quick-sale",
    shortcut: SHORTCUTS.QUICK_SALE,
    description: "Jump to Quick Counter Sale",
    category: "Global",
  },
  {
    id: "save",
    shortcut: SHORTCUTS.SAVE,
    description: "Save current form / record",
    category: "Global",
  },
  {
    id: "new",
    shortcut: SHORTCUTS.NEW,
    description: "Create new entry",
    category: "Global",
  },
  {
    id: "search",
    shortcut: SHORTCUTS.SEARCH,
    description: "Focus page search",
    category: "Global",
  },
  {
    id: "force-confirm",
    shortcut: SHORTCUTS.CONFIRM,
    description: "Force confirm / complete active transaction",
    category: "Global",
  },
  {
    id: "restore-focus",
    shortcut: SHORTCUTS.RESTORE_FOCUS,
    description: "Recover focus to last meaningful field",
    category: "Global",
  },
  {
    id: "help",
    shortcut: { key: "?", modifiers: ["shift"], label: "SHIFT+?" },
    description: "Show keyboard shortcut help",
    category: "Global",
  },

  // Navigation
  {
    id: "nav-dashboard",
    shortcut: SHORTCUTS.NAV_DASHBOARD,
    description: "Go to Dashboard",
    category: "Navigation",
  },
  {
    id: "nav-sales",
    shortcut: SHORTCUTS.NAV_SALES,
    description: "Go to Sales",
    category: "Navigation",
  },
  {
    id: "nav-purchase",
    shortcut: SHORTCUTS.NAV_PURCHASE,
    description: "Go to Purchase Orders",
    category: "Navigation",
  },
  {
    id: "nav-inventory",
    shortcut: SHORTCUTS.NAV_INVENTORY,
    description: "Go to Inventory",
    category: "Navigation",
  },
  {
    id: "nav-products",
    shortcut: SHORTCUTS.NAV_PRODUCTS,
    description: "Go to Products",
    category: "Navigation",
  },
  {
    id: "nav-suppliers",
    shortcut: SHORTCUTS.NAV_SUPPLIERS,
    description: "Go to Suppliers",
    category: "Navigation",
  },

  // Billing & cart
  {
    id: "focus-cart",
    shortcut: SHORTCUTS.FOCUS_CART,
    description: "Jump to first cart row",
    category: "Billing & Cart",
  },
  {
    id: "cycle-payment",
    shortcut: SHORTCUTS.CYCLE_PAYMENT,
    description: "Cycle payment method",
    category: "Billing & Cart",
  },
  {
    id: "change-payment-type",
    shortcut: SHORTCUTS.CHANGE_PAYMENT_TYPE,
    description: "Change payment type",
    category: "Billing & Cart",
  },
  {
    id: "delete-row",
    shortcut: SHORTCUTS.DELETE_ROW,
    description: "Delete selected cart row",
    category: "Billing & Cart",
  },

  // Forms
  {
    id: "forms-next-field",
    shortcut: { key: "Enter", modifiers: [], label: "Enter" },
    description: "Next field (or submit on last field)",
    category: "Forms",
    scopeLabel: "Any form",
  },
  {
    id: "forms-prev-field",
    shortcut: { key: "Enter", modifiers: ["shift"], label: "SHIFT+Enter" },
    description: "Previous field",
    category: "Forms",
    scopeLabel: "Any form",
  },
  {
    id: "forms-cancel",
    shortcut: { key: "Escape", modifiers: [], label: "Esc" },
    description: "Cancel / close dialog",
    category: "Forms",
  },

  // Tables
  {
    id: "table-next-row",
    shortcut: { key: "ArrowDown", modifiers: [], label: "ArrowDown" },
    description: "Next row",
    category: "Tables",
  },
  {
    id: "table-prev-row",
    shortcut: { key: "ArrowUp", modifiers: [], label: "ArrowUp" },
    description: "Previous row",
    category: "Tables",
  },
  {
    id: "table-first",
    shortcut: { key: "Home", modifiers: [], label: "Home" },
    description: "Jump to first row",
    category: "Tables",
  },
  {
    id: "table-last",
    shortcut: { key: "End", modifiers: [], label: "End" },
    description: "Jump to last row",
    category: "Tables",
  },
  {
    id: "table-edit",
    shortcut: { key: "e", modifiers: [], label: "E" },
    description: "Edit focused row",
    category: "Tables",
  },
  {
    id: "table-print",
    shortcut: { key: "p", modifiers: [], label: "P" },
    description: "Print focused bill",
    category: "Tables",
  },
  {
    id: "table-receive",
    shortcut: { key: "r", modifiers: [], label: "R" },
    description: "Receive focused purchase order",
    category: "Tables",
  },
  {
    id: "table-payment",
    shortcut: { key: "$", modifiers: ["shift"], label: "SHIFT+$" },
    description: "Open payment for focused invoice",
    category: "Tables",
  },

  // Search
  {
    id: "focus-search-slash",
    shortcut: SHORTCUTS.FOCUS_SEARCH,
    description: "Focus search bar",
    category: "Search",
  },
];

/** Lookup entry by id (O(1) after memoization). */
let _byId: Record<string, ShortcutCatalogEntry> | null = null;
export function getCatalogEntry(id: string): ShortcutCatalogEntry | undefined {
  if (!_byId) {
    _byId = Object.fromEntries(SHORTCUT_CATALOG.map((e) => [e.id, e]));
  }
  return _byId[id];
}

/** Group catalog entries by category for help dialog rendering. */
export function groupByCategory(
  entries: ShortcutCatalogEntry[] = SHORTCUT_CATALOG,
): Record<ShortcutCategory, ShortcutCatalogEntry[]> {
  const out: Partial<Record<ShortcutCategory, ShortcutCatalogEntry[]>> = {};
  for (const e of entries) {
    (out[e.category] ||= []).push(e);
  }
  return out as Record<ShortcutCategory, ShortcutCatalogEntry[]>;
}
