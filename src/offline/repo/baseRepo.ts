/**
 * Generic local-first repository.
 *
 * Usage from a feature module:
 *   const customerRepo = new BaseRepo<CustomerRow>("customers");
 *   const all = await customerRepo.list({ company_id });
 *   await customerRepo.upsert({ ...row });   // queues sync push
 *   await customerRepo.softDelete(id);       // queues sync push
 *
 * In PR 1 we ship the abstraction; feature pages still talk directly
 * to Supabase until later PRs migrate them table-by-table.
 */
import { offlineDb, type SyncedRow, type SyncedTableName } from "../db";
import { getDeviceId } from "../device";

export type RepoFilter<T> = Partial<Pick<T, Extract<keyof T, string>>>;

export class BaseRepo<T extends SyncedRow> {
  constructor(public readonly table: SyncedTableName) {}

  private get tbl() {
    // Dexie table typed loosely — caller knows the shape.
    return (offlineDb as unknown as Record<string, ReturnType<typeof offlineDb.table>>)[this.table];
  }

  /** Live-query helper key for `dexie-react-hooks` consumers. */
  liveKey(): SyncedTableName {
    return this.table;
  }

  async getById(id: string): Promise<T | undefined> {
    const row = (await this.tbl.get(id)) as T | undefined;
    if (!row || row.deleted) return undefined;
    return row;
  }

  /** All non-deleted rows, optionally filtered by company. */
  async list(filter?: { company_id?: string | null }): Promise<T[]> {
    let collection = this.tbl.toCollection();
    if (filter?.company_id) {
      collection = this.tbl.where("company_id").equals(filter.company_id);
    }
    const rows = (await collection.toArray()) as T[];
    return rows.filter((r) => !r.deleted);
  }

  /** Upsert row locally + enqueue sync push. */
  async upsert(row: Partial<T> & { id?: string }, op: "insert" | "update" = row.id ? "update" : "insert") {
    const now = new Date().toISOString();
    const id = row.id ?? crypto.randomUUID();
    const existing = (await this.tbl.get(id)) as T | undefined;

    const next: T = {
      ...(existing ?? {}),
      ...row,
      id,
      updated_at: now,
      version: (existing?.version ?? 0) + 1,
      device_id: getDeviceId(),
      deleted: false,
      _sync_state: "local_only",
      _local_updated_at: Date.now(),
    } as T;

    await offlineDb.transaction("rw", this.tbl, offlineDb.sync_queue, async () => {
      await this.tbl.put(next);
      await offlineDb.sync_queue.add({
        table: this.table,
        op: existing ? "update" : op,
        record_id: id,
        payload: stripLocalFields(next),
        status: "pending",
        retries: 0,
        created_at: Date.now(),
      });
    });

    return next;
  }

  /** Soft delete — flips `deleted=true`, queues an update push. */
  async softDelete(id: string) {
    const existing = (await this.tbl.get(id)) as T | undefined;
    if (!existing) return;
    const next: T = {
      ...existing,
      deleted: true,
      updated_at: new Date().toISOString(),
      version: existing.version + 1,
      device_id: getDeviceId(),
      _sync_state: "local_only",
      _local_updated_at: Date.now(),
    };
    await offlineDb.transaction("rw", this.tbl, offlineDb.sync_queue, async () => {
      await this.tbl.put(next);
      await offlineDb.sync_queue.add({
        table: this.table,
        op: "update",
        record_id: id,
        payload: stripLocalFields(next),
        status: "pending",
        retries: 0,
        created_at: Date.now(),
      });
    });
  }

  /**
   * Bulk replace — used by the sync engine during a pull to apply server
   * deltas. Does NOT enqueue a push (these rows come FROM the server).
   */
  async _applyServerRows(rows: T[]) {
    if (rows.length === 0) return;
    const stamped = rows.map((r) => ({
      ...r,
      _sync_state: "synced" as const,
      _local_updated_at: Date.now(),
    }));
    await this.tbl.bulkPut(stamped);
  }
}

function stripLocalFields<T extends SyncedRow>(row: T): Record<string, unknown> {
  const { _sync_state, _local_updated_at, ...rest } = row;
  return rest as unknown as Record<string, unknown>;
}
