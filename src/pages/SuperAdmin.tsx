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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Users, Loader2, ShieldCheck, Pencil, Trash2, KeyRound, Copy } from "lucide-react";
import { Navigate } from "react-router-dom";
import type { Tables } from "@/integrations/supabase/types";

type Company = Tables<"companies">;

interface UserProfile {
  user_id: string;
  full_name: string;
  company_id: string | null;
  phone: string | null;
}

interface UserRole {
  user_id: string;
  role: string;
}

const shortId = (id: string) => id.slice(0, 8).toUpperCase();

export default function SuperAdmin() {
  const { isSuperAdmin, user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("companies");

  // Company dialog
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyBusinessType, setCompanyBusinessType] = useState("pharmacy");
  const [companyGst, setCompanyGst] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");

  // Admin creation dialog
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminRole, setAdminRole] = useState("admin");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit user dialog
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editCompanyId, setEditCompanyId] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editPhone, setEditPhone] = useState("");

  // Reset password dialog
  const [resetPwDialogOpen, setResetPwDialogOpen] = useState(false);
  const [resetPwUserId, setResetPwUserId] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Delete user dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState("");
  const [deletingUserName, setDeletingUserName] = useState("");

  // Delete company dialog
  const [deleteCompanyDialogOpen, setDeleteCompanyDialogOpen] = useState(false);
  const [deletingCompanyId, setDeletingCompanyId] = useState("");
  const [deletingCompanyName, setDeletingCompanyName] = useState("");

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  const { data: companies, isLoading } = useQuery({
    queryKey: ["super-admin-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Company[];
    },
    enabled: isSuperAdmin,
  });

  const { data: profiles } = useQuery({
    queryKey: ["super-admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, full_name, company_id, phone");
      if (error) throw error;
      return data as UserProfile[];
    },
    enabled: isSuperAdmin,
  });

  const { data: roles } = useQuery({
    queryKey: ["super-admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data as UserRole[];
    },
    enabled: isSuperAdmin,
  });

  const createCompanyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("companies").insert({
        name: companyName,
        business_type: companyBusinessType,
        gst_number: companyGst || null,
        phone: companyPhone || null,
        email: companyEmail || null,
        address: companyAddress || null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-companies"] });
      toast({ title: "Company created", description: `${data.name} (ID: ${shortId(data.id)}) has been added.` });
      setCompanyDialogOpen(false);
      resetCompanyForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateUser = async () => {
    if (!adminName || !adminEmail || !adminPassword || !selectedCompanyId) {
      toast({ title: "All fields are required", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email: adminEmail, password: adminPassword, fullName: adminName, role: adminRole, companyId: selectedCompanyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "User created", description: `${adminName} assigned as ${adminRole}.` });
      queryClient.invalidateQueries({ queryKey: ["super-admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-roles"] });
      setAdminDialogOpen(false);
      resetAdminForm();
    } catch (err: any) {
      toast({ title: "Error creating user", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: {
          action: "update",
          userId: editingUser.user_id,
          updates: {
            fullName: editFullName,
            companyId: editCompanyId || null,
            role: editRole,
            phone: editPhone,
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "User updated" });
      queryClient.invalidateQueries({ queryKey: ["super-admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-roles"] });
      setEditUserDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPwUserId || !newPassword) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { action: "update", userId: resetPwUserId, updates: { password: newPassword } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Password reset successfully" });
      setResetPwDialogOpen(false);
      setNewPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUserId) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { action: "delete", userId: deletingUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "User deleted", description: `${deletingUserName} has been removed.` });
      queryClient.invalidateQueries({ queryKey: ["super-admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["super-admin-roles"] });
      setDeleteDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!deletingCompanyId) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { action: "delete_company", companyId: deletingCompanyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Company deleted", description: `${deletingCompanyName} has been removed.` });
      queryClient.invalidateQueries({ queryKey: ["super-admin-companies"] });
      setDeleteCompanyDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCompanyForm = () => {
    setCompanyName(""); setCompanyBusinessType("pharmacy"); setCompanyGst(""); setCompanyPhone(""); setCompanyEmail(""); setCompanyAddress("");
  };

  const resetAdminForm = () => {
    setAdminName(""); setAdminEmail(""); setAdminPassword(""); setSelectedCompanyId(""); setAdminRole("admin");
  };

  const openEditUser = (profile: UserProfile) => {
    setEditingUser(profile);
    setEditFullName(profile.full_name);
    setEditCompanyId(profile.company_id || "");
    setEditPhone(profile.phone || "");
    const userRole = roles?.find(r => r.user_id === profile.user_id);
    setEditRole(userRole?.role || "staff");
    setEditUserDialogOpen(true);
  };

  const getCompanyName = (companyId: string | null) => {
    if (!companyId) return "—";
    const c = companies?.find(c => c.id === companyId);
    return c ? `${c.name} (${shortId(c.id)})` : "Unknown";
  };

  const getUserRole = (userId: string) => {
    return roles?.find(r => r.user_id === userId)?.role || "staff";
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "super_admin": return "destructive" as const;
      case "admin": return "default" as const;
      case "pharmacist": return "secondary" as const;
      default: return "outline" as const;
    }
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

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({ title: "Copied", description: `ID ${shortId(id)} copied to clipboard` });
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="text-responsive-xl font-bold">Super Admin</h1>
          <p className="text-muted-foreground text-responsive-sm">Manage companies, users, and administrators</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAdminDialogOpen(true)} className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Create User</span>
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
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Companies</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{companies?.length || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Active Companies</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{companies?.filter(c => c.is_active).length || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{profiles?.length || 0}</div></CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="companies" className="gap-2"><Building2 className="h-4 w-4" />Companies</TabsTrigger>
          <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" />All Users</TabsTrigger>
        </TabsList>

        {/* Companies Tab */}
        <TabsContent value="companies">
          <Card>
            <CardHeader>
              <CardTitle>Companies</CardTitle>
              <CardDescription>All registered companies with unique IDs</CardDescription>
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
                        <TableHead>ID</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Business Type</TableHead>
                        <TableHead>GST</TableHead>
                        <TableHead>Users</TableHead>
                        <TableHead>Admins</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companies?.map((company) => {
                        const admins = getCompanyAdmins(company.id);
                        const userCount = getCompanyUserCount(company.id);
                        return (
                          <TableRow key={company.id}>
                            <TableCell>
                              <button
                                onClick={() => copyId(company.id)}
                                className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded hover:bg-muted/80 flex items-center gap-1"
                                title={`Full ID: ${company.id}`}
                              >
                                {shortId(company.id)}
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              </button>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{company.name}</div>
                                {company.email && <div className="text-xs text-muted-foreground">{company.email}</div>}
                              </div>
                            </TableCell>
                            <TableCell><Badge variant="outline">{company.business_type}</Badge></TableCell>
                            <TableCell>
                              {company.gst_number ? <span className="font-mono text-xs">{company.gst_number}</span> : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1"><Users className="h-3 w-3" />{userCount}</div>
                            </TableCell>
                            <TableCell>
                              {admins.length > 0 ? (
                                <div className="space-y-0.5">
                                  {admins.map(a => <div key={a.user_id} className="text-xs">{a.full_name}</div>)}
                                </div>
                              ) : <span className="text-muted-foreground text-xs">No admin</span>}
                            </TableCell>
                            <TableCell>
                              <Badge variant={company.is_active ? "default" : "secondary"}>
                                {company.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => {
                                    setDeletingCompanyId(company.id);
                                    setDeletingCompanyName(company.name);
                                    setDeleteCompanyDialogOpen(true);
                                  }}
                                  title="Delete company"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
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
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>All Users</CardTitle>
              <CardDescription>Manage all platform users — edit roles, reassign companies, reset passwords, or delete</CardDescription>
            </CardHeader>
            <CardContent>
              {!profiles?.length ? (
                <div className="text-center py-8 text-muted-foreground">No users found.</div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profiles?.map((profile) => {
                        const role = getUserRole(profile.user_id);
                        const isSelf = profile.user_id === currentUser?.id;
                        return (
                          <TableRow key={profile.user_id}>
                            <TableCell>
                              <div className="font-medium">
                                {profile.full_name}
                                {isSelf && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                              </div>
                            </TableCell>
                            <TableCell>{getCompanyName(profile.company_id)}</TableCell>
                            <TableCell>
                              <Badge variant={getRoleBadgeVariant(role)}>{role.replace("_", " ")}</Badge>
                            </TableCell>
                            <TableCell>{profile.phone || "—"}</TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditUser(profile)} title="Edit user">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => { setResetPwUserId(profile.user_id); setResetPwDialogOpen(true); }} title="Reset password">
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  disabled={isSelf}
                                  onClick={() => { setDeletingUserId(profile.user_id); setDeletingUserName(profile.full_name); setDeleteDialogOpen(true); }}
                                  title={isSelf ? "Cannot delete yourself" : "Delete user"}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
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
        </TabsContent>
      </Tabs>

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
                  <SelectItem value="pharmacy_b2b">Pharmacy B2B</SelectItem>
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

      {/* Create User Dialog */}
      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>Create a user and assign them to a company with a role</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assign to Company *</Label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {companies?.filter(c => c.is_active).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({shortId(c.id)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="User's full name" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="user@company.com" />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Minimum 6 characters" />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={adminRole} onValueChange={setAdminRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="pharmacist">Pharmacist</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details, role, and company assignment</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={editFullName} onChange={e => setEditFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Assign to Company</Label>
              <Select value={editCompanyId} onValueChange={setEditCompanyId}>
                <SelectTrigger><SelectValue placeholder="No company" /></SelectTrigger>
                <SelectContent>
                  {companies?.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({shortId(c.id)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="pharmacist">Pharmacist</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateUser} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPwDialogOpen} onOpenChange={setResetPwDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set a new password for this user</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 6 characters" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPwDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={isSubmitting || !newPassword}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{deletingUserName}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Company Confirmation */}
      <AlertDialog open={deleteCompanyDialogOpen} onOpenChange={setDeleteCompanyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Company</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{deletingCompanyName}</strong>? Companies with assigned users cannot be deleted — reassign or delete users first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCompany} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Delete Company
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
