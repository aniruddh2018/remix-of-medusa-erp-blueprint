import { forwardRef, useCallback, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Orientation = "horizontal" | "vertical" | "grid";

interface FocusZoneProps {
  children: ReactNode;
  className?: string;
  /**
   * horizontal: ArrowLeft/Right navigate.
   * vertical:   ArrowUp/Down navigate.
   * grid:       Both axes; item order is left-to-right then top-to-bottom.
   */
  orientation?: Orientation;
  /** Wrap around past the last element. */
  loop?: boolean;
  /**
   * Selector for items that participate in zone navigation.
   * Defaults to `[data-focus-item]`.
   */
  itemSelector?: string;
  /**
   * If true, the zone itself gets tabIndex={0} and pressing Tab from outside
   * will land on the first item instead of individual items getting tab stops.
   * Useful for table-like grids where you want a single entry/exit point.
   */
  roving?: boolean;
  as?: "div" | "section" | "ul" | "nav";
  role?: string;
  "aria-label"?: string;
}

/**
 * Reusable keyboard navigation container.
 *
 * Inside a FocusZone, arrow keys move focus between items marked with
 * `data-focus-item` (or the selector override). Home/End jump to first/last.
 * Tab continues to behave naturally, moving OUT of the zone — which satisfies
 * the "arrow keys within a zone, Tab between zones" rule.
 *
 * Example:
 *   <FocusZone orientation="vertical">
 *     <button data-focus-item>Option 1</button>
 *     <button data-focus-item>Option 2</button>
 *   </FocusZone>
 */
export const FocusZone = forwardRef<HTMLDivElement, FocusZoneProps>(function FocusZone(
  {
    children,
    className,
    orientation = "vertical",
    loop = false,
    itemSelector = "[data-focus-item]",
    roving = false,
    as: Tag = "div",
    role,
    "aria-label": ariaLabel,
  },
  forwardedRef,
) {
  const internalRef = useRef<HTMLDivElement>(null);
  const ref = (forwardedRef as React.RefObject<HTMLDivElement>) || internalRef;

  const getItems = useCallback((): HTMLElement[] => {
    if (!ref.current) return [];
    return Array.from(ref.current.querySelectorAll<HTMLElement>(itemSelector)).filter(
      (el) => {
        if (el.hasAttribute("disabled")) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      },
    );
  }, [ref, itemSelector]);

  const focusAt = useCallback(
    (index: number) => {
      const items = getItems();
      if (!items.length) return;
      let i = index;
      if (loop) {
        i = ((i % items.length) + items.length) % items.length;
      } else {
        i = Math.max(0, Math.min(i, items.length - 1));
      }
      items[i]?.focus();
    },
    [getItems, loop],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const items = getItems();
      if (!items.length) return;
      const current = document.activeElement as HTMLElement;
      const idx = items.indexOf(current);
      if (idx === -1) return;

      const horizontal = orientation === "horizontal" || orientation === "grid";
      const vertical = orientation === "vertical" || orientation === "grid";

      switch (e.key) {
        case "ArrowRight":
          if (!horizontal) return;
          e.preventDefault();
          focusAt(idx + 1);
          break;
        case "ArrowLeft":
          if (!horizontal) return;
          e.preventDefault();
          focusAt(idx - 1);
          break;
        case "ArrowDown":
          if (!vertical) return;
          e.preventDefault();
          focusAt(idx + 1);
          break;
        case "ArrowUp":
          if (!vertical) return;
          e.preventDefault();
          focusAt(idx - 1);
          break;
        case "Home":
          e.preventDefault();
          focusAt(0);
          break;
        case "End":
          e.preventDefault();
          focusAt(items.length - 1);
          break;
      }
    },
    [focusAt, getItems, orientation],
  );

  const handleFocus = useCallback(() => {
    if (!roving) return;
    // When zone receives focus (via Tab), forward it to the first item.
    const items = getItems();
    if (items.length && !items.includes(document.activeElement as HTMLElement)) {
      items[0]?.focus();
    }
  }, [getItems, roving]);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={cn(className)}
      role={role}
      aria-label={ariaLabel}
      tabIndex={roving ? 0 : undefined}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
    >
      {children}
    </Tag>
  );
});
