/**
 * Local-first reactive read hooks backed by Dexie.
 * Components subscribe with `useRepoList(repo, companyId)` and re-render
 * automatically when the sync engine pulls fresh rows.
 */
import { useLiveQuery } from "dexie-react-hooks";
import { offlineDb, type SyncedRow, type SyncedTableName } from "./db";
import type { BaseRepo } from "./repo/baseRepo";

export function useRepoList<T extends SyncedRow>(
  repo: BaseRepo<T>,
  companyId: string | null | undefined
): T[] | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return [] as T[];
    const tbl = (offlineDb as unknown as Record<string, ReturnType<typeof offlineDb.table>>)[repo.table];
    const rows = (await tbl.where("company_id").equals(companyId).toArray()) as T[];
    return rows.filter((r) => !r.deleted);
  }, [companyId, repo.table]);
}

export function useRepoCount(table: SyncedTableName, companyId: string | null | undefined): number | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return 0;
    const tbl = (offlineDb as unknown as Record<string, ReturnType<typeof offlineDb.table>>)[table];
    return await tbl.where("company_id").equals(companyId).count();
  }, [companyId, table]);
}
