# Offline Hybrid ERP — Implementation Plan

You picked the full Phase 1 MVP (all 8 modules), invasive schema migration, cached session + local PIN, and Dexie. That's roughly 4–6 large PRs. This plan locks the sequence so each PR is independently shippable and the app keeps working at every step.

## What we're building

```text
React PWA
  └─ UI components (unchanged API)
      └─ Repository layer  ← NEW (ProductRepo, OrderRepo, …)
          ├─ Dexie / IndexedDB  ← local source of truth
          └─ Sync Engine  ← NEW (push queue + pull deltas + conflict resolve)
              └─ Supabase (unchanged)
```

Rules that hold across every PR:
- UI reads ONLY from Dexie. Never `supabase.from(...)` in components.
- UI writes go to the repo, which writes to Dexie AND appends to `sync_queue`.
- Sync engine drains the queue when online; pulls deltas using `updated_at > last_sync`.
- All synced tables get `version int`, `device_id uuid`, `deleted bool`, plus existing `updated_at`. Soft delete only.

## PR sequence

### PR 1 — Foundation (no module migrated yet)
Goal: plumbing in place, app behaviour unchanged.
- Add Dexie (`dexie`, `dexie-react-hooks`).
- `src/offline/db.ts` — Dexie schema for all 8 module tables + `sync_queue` + `sync_meta`.
- `src/offline/repo/baseRepo.ts` — generic local-first repo (`getAll`, `getById`, `upsert`, `softDelete`, `query`).
- `src/offline/sync/SyncManager.ts` — `pushChanges()`, `pullChanges(table)`, `start()`, `stop()`, retry/backoff, online/offline listeners.
- `src/offline/sync/conflict.ts` — server-version-wins with manual-review queue for stock fields.
- `src/contexts/SyncContext.tsx` — exposes `{ status, lastSync, queueSize, forceSync }`.
- Sync status badge in `AppLayout` header.
- Service worker: keep current PWA setup; add background sync registration (`sync` event → forceSync).

DB migration (one migration covers all 8 tables):
- Add `version int NOT NULL DEFAULT 1`, `device_id uuid`, `deleted bool NOT NULL DEFAULT false` to: `customers`, `products`, `orders`/`sales_orders`, `sales_order_items`, `inventory_batches`, `suppliers`, `purchase_orders`, `purchase_order_items`, `inventory_transactions`.
- Update every RLS policy on those tables to filter `deleted = false` for SELECT (keep writes able to flip the flag).
- Trigger: on UPDATE, bump `version = version + 1`, set `updated_at = now()`.
- `devices` table: `id uuid PK, user_id uuid, last_sync timestamptz, app_version text`.
- Index `(company_id, updated_at)` on every synced table for delta pulls.

### PR 2 — Offline auth + read-cache (Customers, Products, Suppliers) ✅ SHIPPED
Read-only modules first — zero conflict risk.
- ✅ `src/offline/auth/crypto.ts` PBKDF2-200k + AES-GCM helpers.
- ✅ `src/offline/auth/offlineSession.ts` encrypted snapshot of {user, profile, roles, company_id} in `auth_cache`, 30-day TTL.
- ✅ `OfflinePinSetup` dialog + `OfflineAccessButton` in header (Shield icon).
- ✅ `OfflinePinUnlock` full-screen + `OfflineGate` in App tree — shows when there is a cache and the browser is offline.
- ✅ `AuthContext` exposes `offlineMode`, `offlineSession`, `hasPin`, `hydrateFromOfflineSession`. Sign-out clears offlineMode (cache stays for next unlock).
- ✅ `customerRepo`, `productRepo`, `supplierRepo` in `src/offline/repo/index.ts`.
- ✅ `useRepoList(repo, companyId)` Dexie live-query hook in `src/offline/hooks.ts`.
- ✅ Customers, Products, Suppliers pages now read from local Dexie via `useRepoList`. Writes still go directly to Supabase (PR 3).
- ⚠️ Initial pull happens via existing `SyncManager.start()` on login; first paint may be empty for ~1s while delta-pull runs.

### PR 3 — Offline writes (Customers, Products, Suppliers)
- All create/update/softDelete go through repos → `sync_queue`.
- Optimistic UI: writes appear immediately from Dexie.
- Sync engine pushes in FIFO order, marks rows synced, applies server-returned canonical row.

### PR 4 — Inventory + Stock Movement
- Mirror `inventory_batches` and `inventory_transactions` locally.
- Local FIFO allocation in `src/offline/inventory/fifoLocal.ts` (mirrors `allocate_batches_fifo` RPC).
- Stock adjustments queued offline.
- Reconciliation worker: after reconnect, compare `local_stock` vs `server_stock`, generate `reconciliation_tasks` rows for any delta on a batch the device touched while offline.

### PR 5 — POS Billing + Orders + Purchases (the hard one)
- **Offline invoice numbering**: per-device prefix block (e.g. `INV-D{deviceShort}-{seq}`). Server reconciles to canonical numbers via `get_next_invoice_number` on sync; UI shows both local and final number until synced.
- Local sales_orders + sales_order_items written to Dexie, queued to sync.
- Local stock deduction via FIFO; reversed if server rejects on sync.
- Purchase order receive (`receive_purchase_batches` RPC) gets a local equivalent that enqueues; server is the source of truth once back online.
- Print/PDF works entirely from Dexie data.

### PR 6 — Attachments (Phase 1.5 — bundled here since prescriptions are POS-adjacent)
- IndexedDB blob store for prescription / invoice PDFs.
- Upload queue with `pending|uploading|synced|failed` states.
- Service worker upload worker drains queue on reconnect.

## Technical notes (for me/devs)

**Dexie schema example** (per table):
```ts
db.version(1).stores({
  products: 'id, company_id, name, sku, updated_at, sync_state, deleted',
  sync_queue: '++id, table, status, created_at',
  sync_meta: 'table', // last_sync per table
});
```

**sync_queue row**:
```ts
{ id, table, op: 'insert'|'update'|'delete', payload, status: 'pending'|'syncing'|'synced'|'failed'|'conflict', retries, created_at, error? }
```

**Conflict policy**:
- Default: server `version` wins, local change moved to `conflict_log` for review.
- Stock fields (`inventory_batches.quantity`, `loose_quantity`): never overwrite — compute delta from `inventory_transactions` and replay; if replay fails, surface reconciliation task.
- Soft deletes always win over updates.

**Offline auth**: PIN derives an AES-GCM key (PBKDF2, 100k iters) that decrypts cached `{user, roles, company_id, business_module}`. Cached session is valid for a configurable window (default 30 days, then re-auth required online).

**Edge function replacement**: the listed Lovable edge functions (`scan-invoice`, `csv-import`, `parse-order-text`, `merge-products`, `manage-user`, `create-user`, `ai-assistant`, `nl-query`) all genuinely need network or a server — they stay online-only and are simply disabled in offline mode with a clear toast. Only `complete_onboarding` / billing / inventory RPCs get local equivalents.

**Storage budget**: request persistent storage on first run, monitor `navigator.storage.estimate()`, prune `inventory_transactions` older than 90 days from local cache (server retains all).

## What I'll do right now if you approve

Ship **PR 1 only** in this turn (foundation + DB migration). Then I'll wait for you to test before moving to PR 2. Trying to do all 6 PRs in one turn would produce a broken half-migration.

Reply "approve" to start PR 1, or tell me what to adjust.
