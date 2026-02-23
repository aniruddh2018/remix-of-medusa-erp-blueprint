import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Users, Loader2, ShieldCheck } from "lucide-react";
import { Navigate } from "react-router-dom";
import type { Tables } from "@/integrations/supabase/types";

type Company = Tables<"companies">;

export default function SuperAdmin() {
  const { isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Company form
  const [companyName, setCompanyName] = useState("");
  const [companyBusinessType, setCompanyBusinessType] = useState("pharmacy");
  const [companyGst, setCompanyGst] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  // Admin form
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  const { data: companies, isLoading } = useQuery({
    queryKey: ["super-admin-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Company[];
    },
    enabled: isSuperAdmin,
  });

  const { data: profiles } = useQuery({
    queryKey: ["super-admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, company_id");
      if (error) throw error;
      return data;
    },
    enabled: isSuperAdmin,
  });

  const { data: roles } = useQuery({
    queryKey: ["super-admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (error) throw error;
      return data;
    },
    enabled: isSuperAdmin,
  });

  const createCompanyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .insert({
          name: companyName,
          business_type: companyBusinessType,
          gst_number: companyGst || null,
          phone: companyPhone || null,
          email: companyEmail || null,
          address: companyAddress || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-companies"] });
      toast({ title: "Company created", description: `${data.name} has been added.` });
      setCompanyDialogOpen(false);
      resetCompanyForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateAdmin = async () => {
    if (!adminName || !adminEmail || !adminPassword || !selectedCompanyId) {
      toast({ title: "All fields are required", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: adminEmail,
          password: adminPassword,
          fullName: adminName,
          role: "admin",
          companyId: selectedCompanyId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Admin created", description: `${adminName} assigned as admin.` });
      queryClient.invalidateQueries({ queryKey: ["super-admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-roles"] });
      setAdminDialogOpen(false);
      resetAdminForm();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCompanyForm = () => {
    setCompanyName("");
    setCompanyBusinessType("pharmacy");
    setCompanyGst("");
    setCompanyPhone("");
    setCompanyEmail("");
    setCompanyAddress("");
  };

  const resetAdminForm = () => {
    setAdminName("");
    setAdminEmail("");
    setAdminPassword("");
    setSelectedCompanyId("");
  };

  const getCompanyAdmins = (companyId: string) => {
    const companyProfiles = profiles?.filter(p => p.company_id === companyId) || [];
    return companyProfiles.filter(p => {
      const role = roles?.find(r => r.user_id === p.user_id);
      return role?.role === "admin";
    });
  };

  const getCompanyUserCount = (companyId: string) => {
    return profiles?.filter(p => p.company_id === companyId).length || 0;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="text-responsive-xl font-bold">Super Admin</h1>
          <p className="text-muted-foreground text-responsive-sm">Manage companies and their administrators</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAdminDialogOpen(true)} className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Create Admin</span>
          </Button>
          <Button onClick={() => setCompanyDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Company</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="card-grid-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Companies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companies?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Companies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companies?.filter(c => c.is_active).length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{profiles?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Companies Table */}
      <Card>
        <CardHeader>
          <CardTitle>Companies</CardTitle>
          <CardDescription>All registered companies and their administrators</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : companies?.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No companies yet. Create your first company.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Business Type</TableHead>
                    <TableHead>GST</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Admins</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies?.map((company) => {
                    const admins = getCompanyAdmins(company.id);
                    const userCount = getCompanyUserCount(company.id);
                    return (
                      <TableRow key={company.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{company.name}</div>
                            {company.email && <div className="text-xs text-muted-foreground">{company.email}</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{company.business_type}</Badge>
                        </TableCell>
                        <TableCell>
                          {company.gst_number ? (
                            <span className="font-mono text-xs">{company.gst_number}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {userCount}
                          </div>
                        </TableCell>
                        <TableCell>
                          {admins.length > 0 ? (
                            <div className="space-y-0.5">
                              {admins.map(a => (
                                <div key={a.user_id} className="text-xs">{a.full_name}</div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">No admin</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={company.is_active ? "default" : "secondary"}>
                            {company.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Company Dialog */}
      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Company</DialogTitle>
            <DialogDescription>Add a new company to the platform</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g., Sharma Medicals" />
            </div>
            <div className="space-y-2">
              <Label>Business Type *</Label>
              <Select value={companyBusinessType} onValueChange={setCompanyBusinessType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pharmacy">Pharmacy</SelectItem>
                  <SelectItem value="b2b_electronics">B2B Electronics</SelectItem>
                  <SelectItem value="general_trading">General Trading</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>GST Number</Label>
                <Input value={companyGst} onChange={e => setCompanyGst(e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={companyEmail} onChange={e => setCompanyEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createCompanyMutation.mutate()} disabled={!companyName || createCompanyMutation.isPending}>
              {createCompanyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Admin Dialog */}
      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Company Admin</DialogTitle>
            <DialogDescription>Create an admin user and assign them to a company</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assign to Company *</Label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {companies?.filter(c => c.is_active).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Admin's full name" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@company.com" />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Minimum 6 characters" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateAdmin} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
