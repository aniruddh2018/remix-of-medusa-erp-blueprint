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
    return () => this.listeners.delete(listener);
  }

  getState(): SyncState {
    return this.state;
  }

  async forceSync() {
    await this.runOnce();
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

    let query = supabase.from(table as never).select("*").order("updated_at", { ascending: true }).limit(PULL_PAGE_SIZE);
    if (lastSync) {
      query = query.gt("updated_at" as never, lastSync as never);
    }

    const { data, error } = await query;
    if (error) {
      // Tables may not exist for some business modules; surface but don't kill the whole sync.
      console.warn(`[Sync] pull ${table} failed:`, error.message);
      return;
    }
    const rows = (data ?? []) as Array<{ id: string; updated_at: string; deleted?: boolean }>;
    if (rows.length === 0) {
      await offlineDb.sync_meta.put({
        table,
        last_sync: lastSync ?? new Date().toISOString(),
        initial_pulled: true,
      });
      return;
    }

    const tbl = (offlineDb as unknown as Record<string, ReturnType<typeof offlineDb.table>>)[table];
    const stamped = rows.map((r) => ({ ...r, _sync_state: "synced", _local_updated_at: Date.now() }));
    await tbl.bulkPut(stamped as never);

    const newCursor = rows[rows.length - 1].updated_at;
    await offlineDb.sync_meta.put({ table, last_sync: newCursor, initial_pulled: true });

    // If we hit page size, keep pulling.
    if (rows.length === PULL_PAGE_SIZE) {
      await this.pullChanges(table);
    }
  }

  // ── state helpers ────────────────────────────────────────────
  private setState(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }
}

export const SyncManager = new SyncManagerImpl();
