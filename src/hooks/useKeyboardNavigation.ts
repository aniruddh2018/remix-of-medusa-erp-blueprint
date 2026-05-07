import { useCallback, useRef } from "react";

type FocusableTarget =
  | HTMLElement
  | {
      focus: () => void;
      select?: () => void;
      disabled?: boolean;
    }
  | null;

interface KeyboardNavigationOptions {
  onEnd?: () => void;
  blockForward?: (current: string) => string | boolean | null | undefined;
}

function isElementVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isDisabled(target: FocusableTarget) {
  if (!target) return true;
  if (target instanceof HTMLElement) {
    return (
      target.hasAttribute("disabled") ||
      target.getAttribute("aria-disabled") === "true" ||
      !isElementVisible(target)
    );
  }
  return !!target.disabled;
}

function focusTarget(target: FocusableTarget) {
  if (!target || isDisabled(target)) return false;
  target.focus();
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    target.select();
  } else if ("select" in target && typeof target.select === "function") {
    target.select();
  }
  return true;
}

function canLeaveInputWithHorizontalArrow(
  event: React.KeyboardEvent<HTMLElement>,
  direction: 1 | -1,
) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return true;
  const start = target.selectionStart ?? 0;
  const end = target.selectionEnd ?? 0;
  const len = target.value.length;
  if (direction === -1) return start === 0 && end === 0;
  return start === len && end === len;
}

export function useKeyboardNavigation(
  flow: readonly string[],
  options: KeyboardNavigationOptions = {}
) {
  const refs = useRef<Record<string, FocusableTarget>>({});

  const register = useCallback(
    (name: string) => (target: FocusableTarget) => {
      refs.current[name] = target;
    },
    []
  );

  const focusField = useCallback(
    (name: string) => {
      const startIndex = flow.indexOf(name);
      if (startIndex === -1) return false;

      for (let index = startIndex; index < flow.length; index += 1) {
        if (focusTarget(refs.current[flow[index]])) return true;
      }
      return false;
    },
    [flow]
  );

  const focusAdjacent = useCallback(
    (current: string, direction: 1 | -1) => {
      const startIndex = flow.indexOf(current);
      if (startIndex === -1) return false;

      for (
        let index = startIndex + direction;
        index >= 0 && index < flow.length;
        index += direction
      ) {
        if (focusTarget(refs.current[flow[index]])) return true;
      }

      return false;
    },
    [flow]
  );

  const handleKey = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, current: string) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const isForward =
        (event.key === "Enter" && !event.shiftKey) ||
        event.key === "ArrowRight" ||
        event.key === "ArrowDown";
      const isBackward =
        (event.key === "Enter" && event.shiftKey) ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowUp";
      if (!isForward && !isBackward) return;

      if (event.key === "ArrowRight" && !canLeaveInputWithHorizontalArrow(event, 1)) return;
      if (event.key === "ArrowLeft" && !canLeaveInputWithHorizontalArrow(event, -1)) return;

      event.preventDefault();
      event.stopPropagation();

      if (isBackward) {
        focusAdjacent(current, -1);
        return;
      }

      const blocked = options.blockForward?.(current);
      if (blocked) return;

      const moved = focusAdjacent(current, 1);
      if (!moved) options.onEnd?.();
    },
    [focusAdjacent, options]
  );

  return {
    register,
    focusField,
    handleKey,
  };
}
