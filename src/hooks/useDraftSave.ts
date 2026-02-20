import { useEffect, useRef, useCallback } from "react";

/**
 * Auto-saves form state to localStorage whenever data changes.
 * Restores saved draft on mount. Clears draft when explicitly told to.
 *
 * @param key   - unique localStorage key for this draft (e.g. "draft_purchase_order")
 * @param data  - the current form state to persist
 * @param onRestore - callback invoked with the saved draft when one is found on mount
 */
export function useDraftSave<T>(
  key: string,
  data: T,
  onRestore: (draft: T) => void
) {
  const isFirstMount = useRef(true);
  const hasRestoredRef = useRef(false);

  // On mount: check for a saved draft and offer to restore it
  useEffect(() => {
    if (hasRestoredRef.current) return;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as T;
        onRestore(parsed);
        hasRestoredRef.current = true;
      }
    } catch {
      // corrupted data - ignore
      localStorage.removeItem(key);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // On every data change (after first mount): persist to localStorage
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      // storage quota exceeded or private browsing - ignore silently
    }
  }, [key, data]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(key);
    hasRestoredRef.current = false;
    isFirstMount.current = true;
  }, [key]);

  const hasDraft = useCallback(() => {
    return !!localStorage.getItem(key);
  }, [key]);

  return { clearDraft, hasDraft };
}
