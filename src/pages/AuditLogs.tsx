import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AuditRow = {
  id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  actor_user_id: string | null;
  created_at: string;
  profiles?: { email: string | null } | null;
};

export default function AuditLogs() {
  const { companyId } = useBusiness();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["erp-audit-logs", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: logs, error } = await supabase
        .from("erp_audit_logs")
        .select("id, action, table_name, record_id, actor_user_id, created_at")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const actorIds = Array.from(new Set((logs || []).map((row) => row.actor_user_id).filter(Boolean))) as string[];
      let profileMap = new Map<string, { email: string | null }>();
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, email")
          .in("user_id", actorIds);
        profileMap = new Map((profiles || []).map((p: any) => [p.user_id, { email: p.email || null }]));
      }

      return (logs || []).map((row) => ({
        ...row,
        profiles: row.actor_user_id ? profileMap.get(row.actor_user_id) || null : null,
      })) as AuditRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data || []).filter((row) => {
      if (actionFilter !== "all" && row.action !== actionFilter) return false;
      if (!q) return true;
      return (
        row.table_name.toLowerCase().includes(q) ||
        (row.record_id || "").toLowerCase().includes(q) ||
        (row.profiles?.email || "").toLowerCase().includes(q)
      );
    });
  }, [data, search, actionFilter]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-muted-foreground">Track inserts, updates, and deletes across ERP modules.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Activity Stream</CardTitle>
          <CardDescription>Latest 500 actions for this company</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table, record id, or user email..."
            />
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="INSERT">Insert</SelectItem>
                <SelectItem value="UPDATE">Update</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading logs...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No matching audit logs.</TableCell></TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{format(new Date(row.created_at), "dd/MM/yyyy HH:mm:ss")}</TableCell>
                      <TableCell>
                        <Badge variant={row.action === "DELETE" ? "destructive" : row.action === "UPDATE" ? "secondary" : "default"}>
                          {row.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.table_name}</TableCell>
                      <TableCell className="font-mono text-xs">{row.record_id || "-"}</TableCell>
                      <TableCell className="text-xs">{row.profiles?.email || row.actor_user_id || "System"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
