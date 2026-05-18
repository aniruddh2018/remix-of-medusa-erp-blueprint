/**
 * Sync Center — inspect and resolve the offline write queue.
 *
 * Tabs:
 *  - Pending  : queued local writes waiting to be pushed
 *  - Failed   : pushed >5x with errors (likely network/permission)
 *  - Conflicts: server has a newer/competing version — needs a choice
 *  - Attach.  : queued file uploads
 *
 * Every row has actions: Retry / Discard / (for conflicts) Keep mine | Keep server.
 */
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { offlineDb, type SyncQueueRow, type ConflictLogRow, type AttachmentQueueRow } from "@/offline/db";
import { SyncManager } from "@/offline/sync/SyncManager";
import { useSync } from "@/contexts/SyncContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  Cloud,
  ServerCrash,
  GitMerge,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function SyncCenter() {
  const { status, online, lastSync, queueSize, lastError, forceSync } = useSync();

  const pending = useLiveQuery(
    () => offlineDb.sync_queue.where("status").anyOf("pending", "syncing").sortBy("created_at"),
    [],
    [] as SyncQueueRow[],
  );
  const failed = useLiveQuery(
    () => offlineDb.sync_queue.where("status").equals("failed").sortBy("created_at"),
    [],
    [] as SyncQueueRow[],
  );
  const conflictsQueue = useLiveQuery(
    () => offlineDb.sync_queue.where("status").equals("conflict").sortBy("created_at"),
    [],
    [] as SyncQueueRow[],
  );
  const conflicts = useLiveQuery(
    () => offlineDb.conflict_log.where("resolved").equals(0 as never).reverse().sortBy("created_at"),
    [],
    [] as ConflictLogRow[],
  );
  const attachments = useLiveQuery(
    () => offlineDb.attachment_queue.toArray(),
    [],
    [] as AttachmentQueueRow[],
  );

  const pendingCount = pending?.length ?? 0;
  const failedCount = failed?.length ?? 0;
  const conflictCount = (conflicts?.length ?? 0) + (conflictsQueue?.length ?? 0);
  const attachCount = attachments?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sync Center"
        description="Inspect and resolve offline writes that haven't reached the server yet."
        actions={
          <Button onClick={() => void forceSync()} size="sm" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${status === "syncing" ? "animate-spin" : ""}`} />
            Sync now
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusTile
          label="Connection"
          value={online ? "Online" : "Offline"}
          icon={online ? <Cloud className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}
          tone={online ? "ok" : "warn"}
        />
        <StatusTile
          label="Pending"
          value={String(queueSize ?? pendingCount)}
          icon={<RefreshCw className="h-4 w-4" />}
          tone={pendingCount > 0 ? "warn" : "ok"}
        />
        <StatusTile
          label="Conflicts"
          value={String(conflictCount)}
          icon={<GitMerge className="h-4 w-4" />}
          tone={conflictCount > 0 ? "error" : "ok"}
        />
        <StatusTile
          label="Last sync"
          value={lastSync ? formatDistanceToNow(new Date(lastSync), { addSuffix: true }) : "Never"}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone={lastError ? "error" : "ok"}
        />
      </div>

      {lastError && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm text-destructive flex items-center gap-2">
            <ServerCrash className="h-4 w-4" /> {lastError}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending {pendingCount > 0 && <CountBadge n={pendingCount} />}</TabsTrigger>
          <TabsTrigger value="conflicts">
            Conflicts {conflictCount > 0 && <CountBadge n={conflictCount} tone="error" />}
          </TabsTrigger>
          <TabsTrigger value="failed">Failed {failedCount > 0 && <CountBadge n={failedCount} tone="error" />}</TabsTrigger>
          <TabsTrigger value="attachments">
            Files {attachCount > 0 && <CountBadge n={attachCount} />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <QueueTable rows={pending ?? []} emptyText="Nothing waiting to sync." />
        </TabsContent>
        <TabsContent value="conflicts" className="mt-4">
          <ConflictList items={conflicts ?? []} queueItems={conflictsQueue ?? []} />
        </TabsContent>
        <TabsContent value="failed" className="mt-4">
          <QueueTable rows={failed ?? []} emptyText="No failed writes." />
        </TabsContent>
        <TabsContent value="attachments" className="mt-4">
          <AttachmentTable rows={attachments ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────

function StatusTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "ok" | "warn" | "error";
}) {
  const cls =
    tone === "error"
      ? "text-destructive"
      : tone === "warn"
      ? "text-amber-600"
      : "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground font-normal flex items-center gap-2">
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-lg font-semibold ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function CountBadge({ n, tone = "warn" }: { n: number; tone?: "warn" | "error" }) {
  return (
    <Badge
      variant={tone === "error" ? "destructive" : "secondary"}
      className="ml-2 h-5 px-1.5 text-[10px]"
    >
      {n}
    </Badge>
  );
}

function QueueTable({ rows, emptyText }: { rows: SyncQueueRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">{emptyText}</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
              <Badge variant="outline" className="font-mono text-[10px]">{r.op}</Badge>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {r.table} <span className="text-muted-foreground">· {r.record_id.slice(0, 8)}…</span>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  <span>{formatDistanceToNow(r.created_at, { addSuffix: true })}</span>
                  {r.retries > 0 && <span>· {r.retries} retries</span>}
                  {r.last_error && (
                    <span className="text-destructive truncate" title={r.last_error}>
                      · {r.last_error}
                    </span>
                  )}
                </div>
              </div>
              <Badge
                variant={r.status === "failed" ? "destructive" : r.status === "syncing" ? "default" : "secondary"}
                className="text-[10px]"
              >
                {r.status}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void SyncManager.retryQueueItem(r.id!).then(() => toast.success("Retrying…"))}
                title="Retry"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void SyncManager.discardQueueItem(r.id!).then(() => toast("Discarded queue item"))
                }
                title="Discard (won't be pushed)"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ConflictList({
  items,
  queueItems,
}: {
  items: ConflictLogRow[];
  queueItems: SyncQueueRow[];
}) {
  const [open, setOpen] = useState<ConflictLogRow | null>(null);

  if (items.length === 0 && queueItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No conflicts. Local writes are in sync with the server.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {items.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {c.table} <span className="text-muted-foreground">· {c.record_id.slice(0, 8)}…</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Detected {formatDistanceToNow(c.created_at, { addSuffix: true })} · server v
                  {Number((c.server_payload as { version?: number })?.version ?? "?")} vs local v
                  {Number((c.local_payload as { version?: number })?.version ?? "?")}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setOpen(c)}>
                Review
              </Button>
            </div>
          ))}
          {queueItems.length > 0 && (
            <div className="p-3 text-xs text-muted-foreground bg-muted/40">
              {queueItems.length} queue item(s) currently parked in <strong>conflict</strong> state — they'll appear above once their server snapshot is fetched.
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Resolve conflict — {open?.table}</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="font-semibold mb-1 flex items-center gap-2">
                  Your change <Badge variant="secondary">local</Badge>
                </div>
                <ScrollArea className="h-80 rounded border p-2 bg-muted/30 font-mono">
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify(open.local_payload, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
              <div>
                <div className="font-semibold mb-1 flex items-center gap-2">
                  Server version <Badge>server</Badge>
                </div>
                <ScrollArea className="h-80 rounded border p-2 bg-muted/30 font-mono">
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify(open.server_payload, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (!open?.id) return;
                void SyncManager.resolveConflict(open.id, "server").then(() => {
                  toast.success("Kept server version");
                  setOpen(null);
                });
              }}
            >
              Keep server
            </Button>
            <Button
              onClick={() => {
                if (!open?.id) return;
                void SyncManager.resolveConflict(open.id, "local").then(() => {
                  toast.success("Re-queued your change");
                  setOpen(null);
                });
              }}
            >
              Keep mine &amp; push
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AttachmentTable({ rows }: { rows: AttachmentQueueRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No queued file uploads.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {r.bucket}/{r.path}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(r.blob.size / 1024).toFixed(1)} KB · {r.mime_type} ·{" "}
                  {formatDistanceToNow(r.created_at, { addSuffix: true })}
                  {r.last_error && (
                    <span className="text-destructive ml-2">· {r.last_error}</span>
                  )}
                </div>
              </div>
              <Badge
                variant={r.status === "failed" ? "destructive" : "secondary"}
                className="text-[10px]"
              >
                {r.status}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void offlineDb.attachment_queue
                    .delete(r.id!)
                    .then(() => toast("Removed attachment"))
                }
                title="Discard"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
