import { useEffect } from "react";

/**
 * Warn the user before they close/reload the tab while a long-running task
 * (e.g. an import) is in progress. Modern browsers ignore custom messages
 * and show a generic "Leave site?" dialog — that's the intended UX.
 *
 * NOTE: browsers cannot keep JS running after the tab is fully closed; this
 * guard is the safest cross-browser way to prevent accidental abort. Imports
 * are resumable — re-uploading the same file after reload skips items that
 * were already inserted (duplicate detection lives in each importer).
 */
export function useUnloadGuard(active: boolean, message = "Import is running. If you leave now, it will stop.") {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active, message]);
}
