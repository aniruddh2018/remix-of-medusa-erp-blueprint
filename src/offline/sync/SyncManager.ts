/**
 * Sync engine.
 *
 * Responsibilities:
 *   1. pullChanges(table) — fetch rows with `updated_at > last_sync` from Supabase
 *      and bulk-write into local Dexie via `applyServerRows`.
 *   2. pushChanges() — drain `sync_queue` in FIFO order, upsert to Supabase.
 *      On 409 / version-mismatch, move to conflict_log.
 *   3. start() / stop() — listens to online/offline events + 30s heartbeat.
 *   4. forceSync() — manual trigger from UI.
 *
 * In PR 1 the engine is fully wired but no module enqueues anything yet,
 * so it's a no-op until PR 2/3 migrate modules through repos.
 */
import { supabase } from "@/integrations/supabase/client";
import { offlineDb, SYNCED_TABLES, type SyncedTableName, type SyncQueueRow } from "../db";
import { getDeviceId } from "../device";

type Listener = (state: SyncState) => void;

export interface SyncState {
  status: "idle" | "syncing" | "offline" | "error";
  online: boolean;
  lastSync: string | null;
  queueSize: number;
  lastError?: string;
}

const HEARTBEAT_MS = 30_000;
const PULL_PAGE_SIZE = 500;

class SyncManagerImpl {
  private state: SyncState = {
    status: "idle",
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    lastSync: null,
    queueSize: 0,
  };
  private listeners = new Set<Listener>();
  private heartbeatId: number | null = null;
  private running = false;
  private companyId: string | null = null;

  // ── lifecycle ────────────────────────────────────────────────
  start(companyId: string | null) {
    this.companyId = companyId;
    if (this.heartbeatId) return;
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    this.heartbeatId = window.setInterval(() => {
      if (navigator.onLine) void this.runOnce();
    }, HEARTBEAT_MS);
    void this.runOnce();
  }

  stop() {
    if (this.heartbeatId) {
      clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): SyncState {
    return this.state;
  }

  async forceSync() {
    await this.runOnce();
  }

  // ── manual queue actions (used by Sync Center UI) ─────────────
  /** Wipe the pull cursor for a table so the next sync re-pulls it from scratch. */
  async resetTableCursor(table: SyncedTableName | "all") {
    if (table === "all") {
      await offlineDb.sync_meta.clear();
    } else {
      await offlineDb.sync_meta.delete(table);
    }
    void this.runOnce();
  }

  /** Reset a failed/conflict queue row back to pending and kick a sync. */
  async retryQueueItem(id: number) {
    await offlineDb.sync_queue.update(id, {
      status: "pending",
      retries: 0,
      last_error: undefined,
    });
    void this.runOnce();
  }

  /** Drop a queue row entirely (gives up — local change stays, won't be pushed). */
  async discardQueueItem(id: number) {
    await offlineDb.sync_queue.delete(id);
    const queueSize = await offlineDb.sync_queue.where("status").equals("pending").count();
    this.setState({ queueSize });
  }

  /**
   * Resolve a conflict.
   *   - "server": discard local payload, keep what the server has (already in Dexie from the next pull).
   *   - "local":  re-queue our payload as an update, bump version above server's so it wins next push.
   */
  async resolveConflict(conflictId: number, choice: "server" | "local") {
    const conflict = await offlineDb.conflict_log.get(conflictId);
    if (!conflict) return;

    if (choice === "local") {
      const serverVersion = Number(
        (conflict.server_payload as { version?: number } | null)?.version ?? 0,
      );
      const payload = {
        ...conflict.local_payload,
        version: serverVersion + 1,
        updated_at: new Date().toISOString(),
      };
      const tbl = (offlineDb as unknown as Record<string, ReturnType<typeof offlineDb.table>>)[
        conflict.table
      ];
      await tbl.put({ ...payload, _sync_state: "local_only", _local_updated_at: Date.now() } as never);
      await offlineDb.sync_queue.add({
        table: conflict.table,
        op: "update",
        record_id: conflict.record_id,
        payload,
        status: "pending",
        retries: 0,
        created_at: Date.now(),
      });
    } else {
      // Server wins — overwrite local with server payload so the UI reflects it.
      const tbl = (offlineDb as unknown as Record<string, ReturnType<typeof offlineDb.table>>)[
        conflict.table
      ];
      if (conflict.server_payload && (conflict.server_payload as { id?: string }).id) {
        await tbl.put({
          ...conflict.server_payload,
          _sync_state: "synced",
          _local_updated_at: Date.now(),
        } as never);
      }
    }

    await offlineDb.conflict_log.update(conflictId, { resolved: true });
    void this.runOnce();
  }

  // ── core loop ────────────────────────────────────────────────
  private handleOnline = () => {
    this.setState({ online: true });
    void this.runOnce();
  };
  private handleOffline = () => {
    this.setState({ online: false, status: "offline" });
  };

  private async runOnce() {
    if (this.running) return;
    if (!navigator.onLine) {
      this.setState({ status: "offline", online: false });
      return;
    }
    this.running = true;
    this.setState({ status: "syncing" });

    try {
      await this.pushChanges();
      for (const t of SYNCED_TABLES) {
        await this.pullChanges(t);
      }
      const queueSize = await offlineDb.sync_queue.where("status").equals("pending").count();
      this.setState({
        status: "idle",
        lastSync: new Date().toISOString(),
        queueSize,
        lastError: undefined,
      });
    } catch (err) {
      console.error("[Sync] runOnce failed:", err);
      this.setState({
        status: "error",
        lastError: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.running = false;
    }
  }

  // ── push ─────────────────────────────────────────────────────
  private async pushChanges() {
    // Drain pending queue items in FIFO order.
    const pending = await offlineDb.sync_queue
      .where("status")
      .equals("pending")
      .sortBy("created_at");

    for (const item of pending) {
      try {
        await offlineDb.sync_queue.update(item.id!, { status: "syncing" });
        await this.pushOne(item);
        await offlineDb.sync_queue.update(item.id!, { status: "synced" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isConflict = await this.detectAndLogConflict(item, msg);
        if (isConflict) {
          await offlineDb.sync_queue.update(item.id!, {
            status: "conflict",
            last_error: msg,
          });
          continue;
        }
        console.warn(`[Sync] push failed for ${item.table}/${item.record_id}:`, msg);
        await offlineDb.sync_queue.update(item.id!, {
          status: item.retries >= 5 ? "failed" : "pending",
          retries: item.retries + 1,
          last_error: msg,
        });
      }
    }

    // Cleanup synced rows older than 7 days.
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    await offlineDb.sync_queue.where("status").equals("synced").and((r) => r.created_at < weekAgo).delete();
  }

  private async pushOne(item: SyncQueueRow) {
    const payload = { ...item.payload, device_id: getDeviceId() };

    if (item.op === "insert") {
      const { error } = await supabase.from(item.table as never).insert(payload as never);
      if (error) throw error;
    } else if (item.op === "update") {
      const { error } = await supabase
        .from(item.table as never)
        .update(payload as never)
        .eq("id" as never, item.record_id as never);
      if (error) throw error;
    } else if (item.op === "delete") {
      // Soft delete is sent as update with deleted=true (handled in BaseRepo).
      // Hard delete intentionally unsupported.
      const { error } = await supabase
        .from(item.table as never)
        .update({ deleted: true, device_id: getDeviceId() } as never)
        .eq("id" as never, item.record_id as never);
      if (error) throw error;
    }
  }

  // ── pull ─────────────────────────────────────────────────────
  private async pullChanges(table: SyncedTableName) {
    const meta = await offlineDb.sync_meta.get(table);
    const lastSync = meta?.last_sync ?? null;

    let query = supabase
      .from(table as never)
      .select("*")
      .order("updated_at", { ascending: true })
      .limit(PULL_PAGE_SIZE);
    if (lastSync) {
      query = query.gt("updated_at" as never, lastSync as never);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`[Sync] pull ${table} failed:`, error.message);
      await offlineDb.sync_meta.put({
        table,
        last_sync: lastSync,
        initial_pulled: meta?.initial_pulled ?? false,
        last_error: error.message,
        last_attempt_at: Date.now(),
        row_count: meta?.row_count ?? 0,
      } as never);
      // Bubble up so runOnce surfaces it to the UI badge.
      throw new Error(`pull ${table}: ${error.message}`);
    }
    const rows = (data ?? []) as Array<{ id: string; updated_at: string; deleted?: boolean }>;

    // Count local rows after potential write so the UI can show per-table totals.
    const tbl = (offlineDb as unknown as Record<string, ReturnType<typeof offlineDb.table>>)[table];

    if (rows.length === 0) {
      // Don't fast-forward a missing cursor to "now" — that would skip ALL existing rows
      // on subsequent pulls. Only persist the cursor we already had.
      const rowCount = await tbl.count();
      await offlineDb.sync_meta.put({
        table,
        last_sync: lastSync,
        initial_pulled: true,
        last_error: undefined,
        last_attempt_at: Date.now(),
        row_count: rowCount,
      } as never);
      return;
    }

    const stamped = rows.map((r) => ({ ...r, _sync_state: "synced", _local_updated_at: Date.now() }));
    await tbl.bulkPut(stamped as never);

    const newCursor = rows[rows.length - 1].updated_at;
    const rowCount = await tbl.count();
    await offlineDb.sync_meta.put({
      table,
      last_sync: newCursor,
      initial_pulled: true,
      last_error: undefined,
      last_attempt_at: Date.now(),
      row_count: rowCount,
    } as never);

    // If we hit page size, keep pulling.
    if (rows.length === PULL_PAGE_SIZE) {
      await this.pullChanges(table);
    }
  }


  /**
   * Decide whether a failed push is actually a conflict (server has newer version,
   * duplicate invoice number on insert, etc.). If so, log to `conflict_log` and
   * return true so the caller marks the queue row as "conflict".
   */
  private async detectAndLogConflict(item: SyncQueueRow, errMsg: string): Promise<boolean> {
    const lower = errMsg.toLowerCase();
    const looksLikeConflict =
      lower.includes("duplicate key") ||
      lower.includes("unique") ||
      lower.includes("version") ||
      lower.includes("conflict") ||
      lower.includes("23505");

    // Fetch current server row to surface a side-by-side payload to the user.
    let serverRow: Record<string, unknown> | null = null;
    try {
      const { data } = await supabase
        .from(item.table as never)
        .select("*")
        .eq("id" as never, item.record_id as never)
        .maybeSingle();
      serverRow = (data as Record<string, unknown> | null) ?? null;
    } catch {
      /* ignore */
    }

    const localVersion = Number((item.payload as { version?: number }).version ?? 0);
    const serverVersion = Number((serverRow as { version?: number } | null)?.version ?? 0);
    const versionMismatch = serverRow !== null && serverVersion >= localVersion;

    if (!looksLikeConflict && !versionMismatch) return false;

    await offlineDb.conflict_log.add({
      table: item.table,
      record_id: item.record_id,
      local_payload: item.payload,
      server_payload: serverRow ?? {},
      created_at: Date.now(),
      resolved: false,
    });
    return true;
  }

  // ── state helpers ────────────────────────────────────────────
  private setState(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }
}

export const SyncManager = new SyncManagerImpl();
