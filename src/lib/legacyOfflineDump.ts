/**
 * One-time auto-export of the legacy offline (Dexie) database.
 *
 * Runs on app startup. If the legacy `medikarp_offline` IndexedDB exists and
 * contains any rows, dumps every object store to a downloadable JSON file
 * (so the user can later restore via Settings → Offline Recovery), then
 * deletes the database and sets a localStorage flag so it never runs again.
 *
 * Uses raw IndexedDB so it has zero dependency on the (now removed) Dexie
 * schema/code.
 */

const DB_NAME = "medikarp_offline";
const FLAG_KEY = "legacy_offline_dump_done_v1";

type Dump = {
  exported_at: string;
  db_name: string;
  tables: Record<string, unknown[]>;
};

function triggerDownload(filename: string, json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function openLegacyDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    // Open WITHOUT a version so we attach to whatever version exists.
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onupgradeneeded = () => {
      // DB did not exist — abort upgrade so we don't create an empty one.
      try { req.transaction?.abort(); } catch { /* ignore */ }
      resolve(null);
    };
    req.onblocked = () => resolve(null);
  });
}

function readAll(db: IDBDatabase, store: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

export async function runLegacyOfflineDump(): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  if (localStorage.getItem(FLAG_KEY) === "1") return;

  const db = await openLegacyDb();
  if (!db) {
    localStorage.setItem(FLAG_KEY, "1");
    return;
  }

  try {
    const stores = Array.from(db.objectStoreNames);
    if (stores.length === 0) {
      db.close();
      await deleteDb(DB_NAME);
      localStorage.setItem(FLAG_KEY, "1");
      return;
    }

    const tables: Record<string, unknown[]> = {};
    let total = 0;
    for (const s of stores) {
      const rows = await readAll(db, s);
      tables[s] = rows;
      total += rows.length;
    }
    db.close();

    if (total > 0) {
      const dump: Dump = {
        exported_at: new Date().toISOString(),
        db_name: DB_NAME,
        tables,
      };
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      triggerDownload(
        `medikarp_offline_recovery_${stamp}.json`,
        JSON.stringify(dump, null, 2),
      );
      // Show a one-time alert so the user knows what just downloaded.
      setTimeout(() => {
        try {
          alert(
            `Offline data exported (${total} rows from ${stores.length} tables).\n\n` +
              "Keep the downloaded JSON file safe — you can restore it from\n" +
              "Settings → Offline Recovery if anything is missing.",
          );
        } catch { /* ignore */ }
      }, 300);
    }

    await deleteDb(DB_NAME);
    localStorage.setItem(FLAG_KEY, "1");
  } catch (err) {
    console.warn("[legacyOfflineDump] failed:", err);
    // Do NOT set flag — let it retry next load.
  }
}
