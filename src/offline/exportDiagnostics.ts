import { offlineDb, OFFLINE_DIAGNOSTIC_TABLES } from "./db";

function encodeBinary(value: unknown): unknown {
  if (value instanceof ArrayBuffer) {
    return { __type: "ArrayBuffer", byteLength: value.byteLength };
  }
  if (value instanceof Blob) {
    return { __type: "Blob", size: value.size, mime_type: value.type };
  }
  if (Array.isArray(value)) return value.map(encodeBinary);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, encodeBinary(item)]),
    );
  }
  return value;
}

export async function exportOfflineDiagnostics(): Promise<void> {
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const table of OFFLINE_DIAGNOSTIC_TABLES) {
    const rows = await offlineDb.table(table).toArray();
    counts[table] = rows.length;
    tables[table] = rows.map((row) => encodeBinary(row));
  }

  const payload = {
    exported_at: new Date().toISOString(),
    db_name: offlineDb.name,
    version: offlineDb.verno,
    user_agent: navigator.userAgent,
    online: navigator.onLine,
    counts,
    tables,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `medikarp-offline-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}