import { createContext, useContext, useRef, useCallback, useState, useEffect, ReactNode } from "react";

type ModuleName = "sales" | "purchase" | "counter" | null;

interface FlowState {
  module: ModuleName;
  flowStarted: boolean;
  /** ID of last meaningful field (e.g. "product-search", "qty", "payment") */
  lastFieldId: string | null;
  /** Direct ref to last focused element — used as primary recovery target */
  lastElement: HTMLElement | null;
}

interface FocusContextValue {
  /** Current flow state */
  state: FlowState;
  /** Mark a module entered (call from page mount) */
  enterModule: (module: ModuleName) => void;
  /** Mark flow as started (customer/supplier selected OR first product added) */
  markFlowStarted: () => void;
  /** Reset flow (after submit or new entry) */
  resetFlow: () => void;
  /** Register a fallback ref for recovery (e.g. product search input) */
  registerFallback: (getEl: () => HTMLElement | null) => void;
  /** Register the initial entry point (e.g. customer/supplier selector) */
  registerEntryPoint: (getEl: () => HTMLElement | null) => void;
  /** Recovery: backtick handler */
  recoverFocus: () => void;
  /** Focus lock controls */
  lockEnabled: boolean;
  setLockEnabled: (v: boolean) => void;
}

const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FlowState>({
    module: null,
    flowStarted: false,
    lastFieldId: null,
    lastElement: null,
  });
  const [lockEnabled, setLockEnabled] = useState(false);

  const fallbackRef = useRef<(() => HTMLElement | null) | null>(null);
  const entryRef = useRef<(() => HTMLElement | null) | null>(null);
  const lastElementRef = useRef<HTMLElement | null>(null);

  // Track focus globally — persist last focused interactive element
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target || target === document.body || target === document.documentElement) return;
      // Skip non-interactive containers
      const tag = target.tagName;
      const isInteractive =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        target.getAttribute("role") === "combobox" ||
        target.getAttribute("contenteditable") === "true" ||
        target.hasAttribute("tabindex");
      if (!isInteractive) return;
      lastElementRef.current = target;
      const fieldId = target.getAttribute("data-focus-id") || target.id || null;
      setState((s) => (s.lastElement === target && s.lastFieldId === fieldId ? s : { ...s, lastElement: target, lastFieldId: fieldId }));
    };
    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);

  // Focus lock — re-focus last element if blur goes to body
  useEffect(() => {
    if (!lockEnabled) return;
    const handleFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      // Only re-focus when focus leaves to body / null (i.e. clicked empty area)
      if (related === null) {
        const target = lastElementRef.current;
        // Defer so click handlers can run first
        setTimeout(() => {
          if (target && document.contains(target) && (target as HTMLElement).offsetParent !== null) {
            // Don't steal focus if user has since focused a real element
            const active = document.activeElement;
            if (!active || active === document.body) {
              target.focus();
            }
          }
        }, 0);
      }
    };
    document.addEventListener("focusout", handleFocusOut);
    return () => document.removeEventListener("focusout", handleFocusOut);
  }, [lockEnabled]);

  // ESC key — dual-level: 1st press releases lock, 2nd press exits module (handled by page)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (lockEnabled) {
        // First press: release lock, don't bubble exit logic
        setLockEnabled(false);
        // Don't preventDefault — let dialogs close if any are open
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lockEnabled]);

  const enterModule = useCallback((module: ModuleName) => {
    setState({ module, flowStarted: false, lastFieldId: null, lastElement: null });
    lastElementRef.current = null;
    setLockEnabled(true);
  }, []);

  const markFlowStarted = useCallback(() => {
    setState((s) => (s.flowStarted ? s : { ...s, flowStarted: true }));
  }, []);

  const resetFlow = useCallback(() => {
    setState((s) => ({ ...s, flowStarted: false, lastFieldId: null, lastElement: null }));
    lastElementRef.current = null;
  }, []);

  const registerFallback = useCallback((getEl: () => HTMLElement | null) => {
    fallbackRef.current = getEl;
  }, []);

  const registerEntryPoint = useCallback((getEl: () => HTMLElement | null) => {
    entryRef.current = getEl;
  }, []);

  const isUsable = (el: HTMLElement | null): el is HTMLElement => {
    if (!el) return false;
    if (!document.contains(el)) return false;
    if ((el as HTMLInputElement).disabled) return false;
    if (el.offsetParent === null && el.tagName !== "BODY") return false;
    return true;
  };

  const focusEl = (el: HTMLElement) => {
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      try { el.select(); } catch { /* noop */ }
    }
  };

  const recoverFocus = useCallback(() => {
    // A. Flow started → restore last
    if (state.flowStarted) {
      const last = lastElementRef.current;
      if (isUsable(last)) {
        focusEl(last);
        return;
      }
      // fallback: nearest valid (product search)
      const fb = fallbackRef.current?.();
      if (isUsable(fb)) {
        focusEl(fb);
        return;
      }
    }
    // B. Flow not started → entry point
    const entry = entryRef.current?.();
    if (isUsable(entry)) {
      focusEl(entry);
      return;
    }
    // C. Absolute fallback
    const fb = fallbackRef.current?.();
    if (isUsable(fb)) {
      focusEl(fb);
    }
  }, [state.flowStarted]);

  return (
    <FocusContext.Provider
      value={{
        state,
        enterModule,
        markFlowStarted,
        resetFlow,
        registerFallback,
        registerEntryPoint,
        recoverFocus,
        lockEnabled,
        setLockEnabled,
      }}
    >
      {children}
    </FocusContext.Provider>
  );
}

export function useFocus() {
  const ctx = useContext(FocusContext);
  if (!ctx) {
    // Safe noop fallback so non-wrapped pages don't crash
    return {
      state: { module: null, flowStarted: false, lastFieldId: null, lastElement: null } as FlowState,
      enterModule: () => {},
      markFlowStarted: () => {},
      resetFlow: () => {},
      registerFallback: () => {},
      registerEntryPoint: () => {},
      recoverFocus: () => {},
      lockEnabled: false,
      setLockEnabled: () => {},
    } as FocusContextValue;
  }
  return ctx;
}

/**
 * Page-level helper — call inside Sales/Purchase pages to register flow context.
 */
export function useModuleFocus(opts: {
  module: ModuleName;
  getEntryPoint: () => HTMLElement | null;
  getFallback: () => HTMLElement | null;
  /** Auto-detect flow start: when these values become truthy, mark flow started */
  flowStartedWhen?: boolean;
}) {
  const { enterModule, registerEntryPoint, registerFallback, markFlowStarted, resetFlow } = useFocus();

  useEffect(() => {
    enterModule(opts.module);
    registerEntryPoint(opts.getEntryPoint);
    registerFallback(opts.getFallback);
    return () => {
      resetFlow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.module]);

  useEffect(() => {
    if (opts.flowStartedWhen) markFlowStarted();
  }, [opts.flowStartedWhen, markFlowStarted]);
}
