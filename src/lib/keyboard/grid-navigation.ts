export type GridDirection = "up" | "down" | "left" | "right" | "next" | "prev";

export interface GridKeyMap {
  up: string;
  down: string;
  left: string;
  right: string;
  next: string;
  prev: string;
  close: string;
  commandPalette: string;
}

export interface GridNavigationConfig {
  keyMap?: Partial<GridKeyMap>;
  highlightClassName?: string;
  onEscape?: () => void;
  onCommandPalette?: () => void;
}

export const DEFAULT_GRID_KEYMAP: GridKeyMap = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  next: "Enter",
  prev: "Enter",
  close: "Escape",
  commandPalette: "/",
};

const FOCUSABLE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "[role='combobox']",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

function isHTMLElement(v: unknown): v is HTMLElement {
  return v instanceof HTMLElement;
}

function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return el.getClientRects().length > 0;
}

function isDisabled(el: HTMLElement): boolean {
  if (el.getAttribute("aria-disabled") === "true") return true;
  if (el.hasAttribute("disabled")) return true;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el instanceof HTMLButtonElement) {
    return el.disabled || el.readOnly;
  }
  return false;
}

function isNavigableCell(cell: HTMLElement): boolean {
  if (!isVisible(cell)) return false;
  if (cell.getAttribute("data-kb-skip") === "true") return false;
  return true;
}

function listRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-kb-row]")).filter((row) => isVisible(row));
}

function listCells(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>("[data-kb-cell]")).filter(isNavigableCell);
}

function resolveCellFromTarget(target: EventTarget | null): HTMLElement | null {
  if (!isHTMLElement(target)) return null;
  return target.closest<HTMLElement>("[data-kb-cell]");
}

function findInnerFocusable(cell: HTMLElement): HTMLElement | null {
  const explicit = cell.querySelector<HTMLElement>("[data-kb-focus]");
  if (explicit && !isDisabled(explicit) && isVisible(explicit)) return explicit;

  const auto = cell.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  if (auto && !isDisabled(auto) && isVisible(auto)) return auto;
  return null;
}

function focusCell(cell: HTMLElement, highlightClassName: string): boolean {
  const focusable = findInnerFocusable(cell);
  const target = focusable || cell;
  if (isDisabled(target) || !isVisible(target)) return false;

  target.focus();
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const end = target.value.length;
    target.setSelectionRange(end, end);
  }

  const row = cell.closest<HTMLElement>("[data-kb-row]");
  const container = cell.closest<HTMLElement>("[data-kb-grid]");
  container?.querySelectorAll<HTMLElement>(`[data-kb-cell].${highlightClassName}`).forEach((n) => n.classList.remove(highlightClassName));
  cell.classList.add(highlightClassName);
  row?.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

function canHijackHorizontalInputNavigation(target: HTMLElement, dir: "left" | "right"): boolean {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return true;
  if (target.readOnly || target.disabled) return true;
  const start = target.selectionStart ?? 0;
  const end = target.selectionEnd ?? 0;
  const len = target.value.length;
  if (dir === "left") return start === 0 && end === 0;
  return start === len && end === len;
}

function matchesPaletteShortcut(event: KeyboardEvent, key: string): boolean {
  const isCtrlOrCmd = event.ctrlKey || event.metaKey;
  if (!isCtrlOrCmd || event.altKey) return false;
  return event.key === key || event.code === "Slash";
}

export function handleGridNavigationKeydown(
  event: KeyboardEvent,
  container: HTMLElement,
  config: GridNavigationConfig = {},
): void {
  const keyMap: GridKeyMap = { ...DEFAULT_GRID_KEYMAP, ...(config.keyMap || {}) };
  const highlightClassName = config.highlightClassName || "kb-active-cell";

  if (matchesPaletteShortcut(event, keyMap.commandPalette)) {
    config.onCommandPalette?.();
    event.preventDefault();
    return;
  }

  if (event.key === keyMap.close) {
    config.onEscape?.();
    event.preventDefault();
    return;
  }

  const active = document.activeElement;
  const activeCell = resolveCellFromTarget(active);
  if (!activeCell || !container.contains(activeCell)) return;

  const row = activeCell.closest<HTMLElement>("[data-kb-row]");
  if (!row) return;

  const rows = listRows(container);
  const rowIndex = rows.indexOf(row);
  if (rowIndex < 0) return;

  const cells = listCells(row);
  const colIndex = cells.indexOf(activeCell);
  if (colIndex < 0) return;

  let nextRow = rowIndex;
  let nextCol = colIndex;
  let move = false;

  if (event.key === keyMap.up) {
    nextRow = Math.max(0, rowIndex - 1);
    move = true;
  } else if (event.key === keyMap.down) {
    nextRow = Math.min(rows.length - 1, rowIndex + 1);
    move = true;
  } else if (event.key === keyMap.left) {
    if (isHTMLElement(active) && !canHijackHorizontalInputNavigation(active, "left")) return;
    nextCol = Math.max(0, colIndex - 1);
    move = true;
  } else if (event.key === keyMap.right) {
    if (isHTMLElement(active) && !canHijackHorizontalInputNavigation(active, "right")) return;
    nextCol = Math.min(cells.length - 1, colIndex + 1);
    move = true;
  } else if (event.key === keyMap.next && !event.ctrlKey && !event.altKey && !event.metaKey) {
    if (event.shiftKey) {
      if (colIndex > 0) {
        nextCol = colIndex - 1;
      } else if (rowIndex > 0) {
        nextRow = rowIndex - 1;
        const prevRowCells = listCells(rows[nextRow]);
        nextCol = Math.max(0, prevRowCells.length - 1);
      }
    } else {
      if (colIndex < cells.length - 1) {
        nextCol = colIndex + 1;
      } else if (rowIndex < rows.length - 1) {
        nextRow = rowIndex + 1;
        nextCol = 0;
      }
    }
    move = true;
  }

  if (!move) return;

  event.preventDefault();
  event.stopPropagation();

  const targetRow = rows[nextRow];
  const targetCells = listCells(targetRow);
  const safeCol = Math.min(nextCol, Math.max(0, targetCells.length - 1));
  const nextCell = targetCells[safeCol];
  if (!nextCell) return;

  focusCell(nextCell, highlightClassName);
}
