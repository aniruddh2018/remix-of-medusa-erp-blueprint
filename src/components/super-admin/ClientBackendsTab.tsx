import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, Database, Trash2, PlayCircle, UserPlus, ExternalLink, ShieldCheck } from "lucide-react";

// The `client_backends` table (and the list_client_backends() SQL function
// this reads from) were added by supabase/migrations/
// 20260826120000_client_backends.sql — after this migration is applied to
// the live project, regenerate src/integrations/supabase/types.ts (`supabase
// gen types typescript`) and these `as any` casts can be dropped in favor of
// proper generated types for the new table/RPC/functions.
interface ClientBackendRow {
  id: string;
  name: string;
  slug: string;
  project_url: string;
  email_domain: string | null;
  provisioning_status: "pending" | "provisioning" | "ready" | "failed";
  schema_version: string | null;
  is_active: boolean;
  created_at: string;
}

const statusBadgeVariant = (status: ClientBackendRow["provisioning_status"]) => {
  switch (status) {
    case "ready": return "default" as const;
    case "provisioning": return "secondary" as const;
    case "failed": return "destructive" as const;
    default: return "outline" as const;
  }
};

export function ClientBackendsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [projectUrl, setProjectUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [serviceRoleKey, setServiceRoleKey] = useState("");
  const [dbConnectionString, setDbConnectionString] = useState("");
  const [emailDomain, setEmailDomain] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminTargetId, setAdminTargetId] = useState<string | null>(null);
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [supportAccessId, setSupportAccessId] = useState<string | null>(null);

  const { data: backends, isLoading } = useQuery({
    queryKey: ["client-backends"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_client_backends");
      if (error) throw error;
      return (data || []) as ClientBackendRow[];
    },
    refetchInterval: (query) =>
      // Poll while anything is mid-provisioning so the status badge updates
      // without a manual refresh.
      (query.state.data as ClientBackendRow[] | undefined)?.some((b) => b.provisioning_status === "provisioning")
        ? 3000
        : false,
  });

  const resetAddForm = () => {
    setName(""); setSlug(""); setProjectUrl(""); setAnonKey("");
    setServiceRoleKey(""); setDbConnectionString(""); setEmailDomain("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-client-backend", {
        body: {
          action: "create",
          fields: {
            name,
            slug,
            project_url: projectUrl,
            anon_key: anonKey,
            service_role_key: serviceRoleKey,
            db_connection_string: dbConnectionString,
            email_domain: emailDomain || null,
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Client backend added", description: `${name} is registered. Provision its schema next.` });
      queryClient.invalidateQueries({ queryKey: ["client-backends"] });
      setAddDialogOpen(false);
      resetAddForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleProvision = async (id: string) => {
    setProvisioningId(id);
    try {
      const { data, error } = await supabase.functions.invoke("provision-client-backend", {
        body: { client_backend_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Schema provisioned", description: `Applied ${data.applied} migration file(s).` });
    } catch (err: any) {
      toast({ title: "Provisioning failed", description: err.message, variant: "destructive" });
    } finally {
      setProvisioningId(null);
      queryClient.invalidateQueries({ queryKey: ["client-backends"] });
    }
  };

  const handleCreateTenantAdmin = async () => {
    if (!adminTargetId || !adminFullName || !adminEmail || !adminPassword) {
      toast({ title: "All fields are required", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("tenant-admin-provision", {
        body: { client_backend_id: adminTargetId, email: adminEmail, password: adminPassword, fullName: adminFullName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Admin created", description: `${adminFullName} can now log in as this client's admin.` });
      setAdminDialogOpen(false);
      setAdminFullName(""); setAdminEmail(""); setAdminPassword(""); setAdminTargetId(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-client-backend", {
        body: { action: "delete", id: deleteTarget.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Client backend removed", description: `${deleteTarget.name} can no longer be logged into from here.` });
      queryClient.invalidateQueries({ queryKey: ["client-backends"] });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSupportAccess = async (id: string) => {
    setSupportAccessId(id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-tenant-login", {
        body: { client_backend_id: id, redirect_to: window.location.origin },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      window.open(data.action_link, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast({
        title: "Support access failed",
        description:
          err.message +
          " (this also requires the target project's Auth redirect URLs to allowlist this app's origin — a one-time setup in that project's own Supabase dashboard).",
        variant: "destructive",
      });
    } finally {
      setSupportAccessId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Client Backends</CardTitle>
          <CardDescription>
            Each row is one client's own dedicated Supabase project — physically separate from every other
            client's data. This is on top of, not instead of, per-company isolation within a client's project.
          </CardDescription>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Add Client Backend
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : !backends?.length ? (
          <div className="text-center py-8">
            <Database className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No client backends yet. Add the first one.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Project URL</TableHead>
                  <TableHead>Email Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Schema</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backends.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-muted-foreground">{b.slug}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[220px] truncate" title={b.project_url}>
                      {b.project_url}
                    </TableCell>
                    <TableCell>{b.email_domain || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(b.provisioning_status)}>{b.provisioning_status}</Badge>
                      {!b.is_active && <Badge variant="outline" className="ml-1">inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                      {b.schema_version || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={b.provisioning_status === "provisioning" || provisioningId === b.id}
                          onClick={() => handleProvision(b.id)}
                          title="Provision / re-apply schema"
                        >
                          {provisioningId === b.id || b.provisioning_status === "provisioning" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <PlayCircle className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={b.provisioning_status !== "ready"}
                          onClick={() => { setAdminTargetId(b.id); setAdminDialogOpen(true); }}
                          title="Create first admin for this client"
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={b.provisioning_status !== "ready" || supportAccessId === b.id}
                          onClick={() => handleSupportAccess(b.id)}
                          title="Support access (audited login as this client)"
                        >
                          {supportAccessId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => { setDeleteTarget({ id: b.id, name: b.name }); setDeleteDialogOpen(true); }}
                          title="Remove from registry"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Add Client Backend Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Client Backend</DialogTitle>
            <DialogDescription>
              Create an empty Supabase project for this client in the Supabase dashboard first, then paste its
              details here. Nothing is provisioned yet — use "Provision" after adding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Pharmacy" />
              </div>
              <div className="space-y-2">
                <Label>Slug *</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="acme-pharmacy" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Project URL *</Label>
              <Input value={projectUrl} onChange={(e) => setProjectUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
            </div>
            <div className="space-y-2">
              <Label>Anon (Publishable) Key *</Label>
              <Input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} className="font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <Label>Service Role Key * <span className="text-xs text-muted-foreground">(never exposed to the browser — used server-side only)</span></Label>
              <Input value={serviceRoleKey} onChange={(e) => setServiceRoleKey(e.target.value)} type="password" className="font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <Label>DB Connection String * <span className="text-xs text-muted-foreground">(used only for schema provisioning)</span></Label>
              <Input value={dbConnectionString} onChange={(e) => setDbConnectionString(e.target.value)} type="password" placeholder="postgresql://postgres:...@db.xxxx.supabase.co:5432/postgres" className="font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <Label>Email Domain <span className="text-xs text-muted-foreground">(optional — used to route logins here)</span></Label>
              <Input value={emailDomain} onChange={(e) => setEmailDomain(e.target.value.toLowerCase())} placeholder="acmepharmacy.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!name || !slug || !projectUrl || !anonKey || !serviceRoleKey || !dbConnectionString || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Client Backend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create First Admin Dialog */}
      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create First Admin</DialogTitle>
            <DialogDescription>Creates the admin account inside this client's own project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Minimum 6 characters" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTenantAdmin} disabled={isSubmitting} className="gap-2">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Create Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Client Backend</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>{deleteTarget?.name}</strong> from the registry — no one will be able to log
              into it from this app anymore. Their actual Supabase project and data are NOT deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
