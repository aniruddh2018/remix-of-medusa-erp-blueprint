import { useCallback, useEffect, useState } from "react";

/**
 * Migration Mode — a per-company switch the admin flips ON only while
 * importing/exporting historical data from MARG (or any legacy ERP). While
 * ON, the app exposes reconciliation, historical-import guards, and the
 * "opening batches" pipeline. Once data is settled, the admin flips it OFF
 * so day-to-day billing screens don't show migration affordances.
 *
 * Stored in localStorage per company; reflected across tabs via the
 * `storage` event.
 */
const KEY = (companyId: string | null | undefined) =>
  `fy-migration-mode-${companyId ?? "none"}`;

export function useMigrationMode(companyId: string | null | undefined) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined" || !companyId) return false;
    return window.localStorage.getItem(KEY(companyId)) === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined" || !companyId) { setEnabled(false); return; }
    setEnabled(window.localStorage.getItem(KEY(companyId)) === "1");
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY(companyId)) setEnabled(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [companyId]);

  const setValue = useCallback((v: boolean) => {
    if (typeof window === "undefined" || !companyId) return;
    if (v) window.localStorage.setItem(KEY(companyId), "1");
    else window.localStorage.removeItem(KEY(companyId));
    setEnabled(v);
    // Fire a storage event manually so listeners in the same tab react.
    window.dispatchEvent(new StorageEvent("storage", { key: KEY(companyId), newValue: v ? "1" : null }));
  }, [companyId]);

  return { enabled, setEnabled: setValue };
}

export function isMigrationModeOn(companyId: string | null | undefined): boolean {
  if (typeof window === "undefined" || !companyId) return false;
  return window.localStorage.getItem(KEY(companyId)) === "1";
}
