import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  type GridNavigationConfig,
  type GridKeyMap,
  handleGridNavigationKeydown,
} from "@/lib/keyboard/grid-navigation";

interface UseGridKeyboardNavigationOptions extends GridNavigationConfig {
  enabled?: boolean;
  keyMap?: Partial<GridKeyMap>;
}

export function useGridKeyboardNavigation(options: UseGridKeyboardNavigationOptions = {}) {
  const {
    enabled = true,
    keyMap,
    highlightClassName,
    onEscape,
    onCommandPalette,
  } = options;

  const containerRef = useRef<HTMLElement | null>(null);
  const cfg = useMemo<GridNavigationConfig>(
    () => ({ keyMap, highlightClassName, onEscape, onCommandPalette }),
    [keyMap, highlightClassName, onEscape, onCommandPalette],
  );

  useEffect(() => {
    if (!enabled || !containerRef.current) return;
    const node = containerRef.current;
    const handler = (event: KeyboardEvent) => {
      handleGridNavigationKeydown(event, node, cfg);
    };
    node.addEventListener("keydown", handler);
    return () => node.removeEventListener("keydown", handler);
  }, [enabled, cfg]);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;
    const node = containerRef.current;
    const cls = cfg.highlightClassName || "kb-active-cell";
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      const cell = target?.closest<HTMLElement>("[data-kb-cell]");
      if (!cell || !node.contains(cell)) return;
      node.querySelectorAll<HTMLElement>(`[data-kb-cell].${cls}`).forEach((el) => el.classList.remove(cls));
      cell.classList.add(cls);
    };
    node.addEventListener("focusin", onFocusIn);
    return () => node.removeEventListener("focusin", onFocusIn);
  }, [enabled, cfg.highlightClassName]);

  const setContainerRef = useCallback((node: HTMLElement | null) => {
    containerRef.current = node;
  }, []);

  return { gridRef: setContainerRef };
}
