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

/**
 * PR 4 — local-first joined read for the Inventory page.
 * Joins inventory_batches with products and suppliers locally from Dexie.
 */
export interface InventoryWithJoins {
  id: string;
  product_id: string;
  batch_number: string;
  quantity: number;
  loose_quantity: number;
  pack_size: number | null;
  expiry_date: string | null;
  manufacturing_date: string | null;
  purchase_price: number;
  mrp: number;
  received_date: string;
  supplier_id?: string | null;
  product: {
    id: string;
    name: string;
    manufacturer: string;
    reorder_level: number;
    base_unit: string | null;
    unit: string;
  };
  supplier: { name: string } | null;
}

export function useInventoryWithJoins(companyId: string | null | undefined): InventoryWithJoins[] | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return [];
    const [batches, products, suppliers] = await Promise.all([
      offlineDb.inventory_batches.where("company_id").equals(companyId).toArray(),
      offlineDb.products.where("company_id").equals(companyId).toArray(),
      offlineDb.suppliers.where("company_id").equals(companyId).toArray(),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
    return batches
      .filter((b) => !b.deleted)
      .map((b: any) => {
        const p: any = productMap.get(b.product_id);
        const s: any = b.supplier_id ? supplierMap.get(b.supplier_id) : null;
        return {
          id: b.id,
          product_id: b.product_id,
          batch_number: b.batch_number,
          quantity: Number(b.quantity) || 0,
          loose_quantity: Number(b.loose_quantity) || 0,
          pack_size: b.pack_size ?? null,
          expiry_date: b.expiry_date ?? null,
          manufacturing_date: b.manufacturing_date ?? null,
          purchase_price: Number(b.purchase_price) || 0,
          mrp: Number(b.mrp) || 0,
          received_date: b.received_date,
          supplier_id: b.supplier_id ?? null,
          product: p
            ? {
                id: p.id,
                name: p.name,
                manufacturer: p.manufacturer ?? "",
                reorder_level: Number(p.reorder_level) || 0,
                base_unit: p.base_unit ?? null,
                unit: p.unit ?? "pcs",
              }
            : { id: b.product_id, name: "Unknown", manufacturer: "", reorder_level: 0, base_unit: null, unit: "pcs" },
          supplier: s ? { name: s.name } : null,
        } as InventoryWithJoins;
      })
      .sort((a, b) => {
        if (!a.expiry_date) return 1;
        if (!b.expiry_date) return -1;
        return a.expiry_date.localeCompare(b.expiry_date);
      });
  }, [companyId]);
}

// ──────────────────────────────────────────────────────────────────
// PR 5 — Sales / Purchase / Payments local-first reads
// ──────────────────────────────────────────────────────────────────

export function useSalesOrders<T = any>(companyId: string | null | undefined): T[] | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return [] as T[];
    const rows = await offlineDb.sales_orders.where("company_id").equals(companyId).toArray();
    return rows
      .filter((r) => !r.deleted)
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")) as unknown as T[];
  }, [companyId]);
}

export function usePurchaseOrdersWithSupplier<T = any>(
  companyId: string | null | undefined
): T[] | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return [] as T[];
    const [orders, suppliers] = await Promise.all([
      offlineDb.purchase_orders.where("company_id").equals(companyId).toArray(),
      offlineDb.suppliers.where("company_id").equals(companyId).toArray(),
    ]);
    const supMap = new Map(suppliers.map((s: any) => [s.id, s]));
    return orders
      .filter((r) => !r.deleted)
      .map((o: any) => ({ ...o, suppliers: supMap.get(o.supplier_id) ? { name: (supMap.get(o.supplier_id) as any).name } : null }))
      .sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || "")) as unknown as T[];
  }, [companyId]);
}

export function usePaymentsByRefType(
  companyId: string | null | undefined,
  refType: "sales_order" | "purchase_order"
): Array<{ reference_id: string; amount: number }> | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return [];
    const rows = await offlineDb.payments.where("company_id").equals(companyId).toArray();
    return rows
      .filter((p: any) => !p.deleted && p.reference_type === refType)
      .map((p: any) => ({ reference_id: p.reference_id, amount: Number(p.amount) || 0 }));
  }, [companyId, refType]);
}

/** Batches with stock > 0 and not expired — for sale/return product pickers. */
export function useAvailableBatches<T = any>(companyId: string | null | undefined): T[] | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return [] as T[];
    const today = new Date().toISOString().split("T")[0];
    const rows = await offlineDb.inventory_batches.where("company_id").equals(companyId).toArray();
    return rows
      .filter((b: any) => !b.deleted && Number(b.quantity) > 0 && (!b.expiry_date || b.expiry_date > today))
      .sort((a: any, b: any) => {
        if (!a.expiry_date) return 1;
        if (!b.expiry_date) return -1;
        return a.expiry_date.localeCompare(b.expiry_date);
      }) as unknown as T[];
  }, [companyId]);
}

/** Active products only (is_active = true). */
export function useActiveProducts<T = any>(companyId: string | null | undefined): T[] | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return [] as T[];
    const rows = await offlineDb.products.where("company_id").equals(companyId).toArray();
    return rows
      .filter((p: any) => !p.deleted && p.is_active !== false)
      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")) as unknown as T[];
  }, [companyId]);
}

/** Active suppliers only. */
export function useActiveSuppliers<T = any>(companyId: string | null | undefined): T[] | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return [] as T[];
    const rows = await offlineDb.suppliers.where("company_id").equals(companyId).toArray();
    return rows
      .filter((s: any) => !s.deleted && s.is_active !== false)
      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")) as unknown as T[];
  }, [companyId]);
}

/** Customers list (no is_active flag — all non-deleted). */
export function useCustomers<T = any>(companyId: string | null | undefined): T[] | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return [] as T[];
    const rows = await offlineDb.customers.where("company_id").equals(companyId).toArray();
    return rows
      .filter((c: any) => !c.deleted)
      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")) as unknown as T[];
  }, [companyId]);
}

/** Active doctors list. */
export function useDoctors<T = any>(companyId: string | null | undefined): T[] | undefined {
  return useLiveQuery(async () => {
    if (!companyId) return [] as T[];
    const rows = await offlineDb.doctors.where("company_id").equals(companyId).toArray();
    return rows
      .filter((d: any) => !d.deleted && d.is_active !== false)
      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")) as unknown as T[];
  }, [companyId]);
}

