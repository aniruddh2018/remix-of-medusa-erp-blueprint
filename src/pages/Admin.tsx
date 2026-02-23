import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, Shield, ShieldCheck, User, UserPlus, Loader2 } from "lucide-react";
import { BackupSection } from "@/components/BackupSection";
import { InvoiceSettingsSection } from "@/components/InvoiceSettingsSection";
import { Navigate } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

type AppRole = Database["public"]["Enums"]["app_role"];

interface UserWithRole {
  user_id: string;
  full_name: string;
  email: string;
  role: AppRole;
  role_id: string;
}

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");
const nameSchema = z.string().min(2, "Name must be at least 2 characters");

export default function Admin() {
  const { isAdmin } = useAuth();
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // New user form state
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<AppRole>("staff");

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      // First get all profiles (admins can see all)
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name");

      if (profilesError) throw profilesError;

      // Get user roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("id, user_id, role");

      if (rolesError) throw rolesError;

      // Get auth users info via profiles (we store user_id which maps to auth.users.id)
      const usersWithRoles: UserWithRole[] = profiles.map((profile) => {
        const userRole = roles.find((r) => r.user_id === profile.user_id);
        return {
          user_id: profile.user_id,
          full_name: profile.full_name,
          email: profile.full_name, // Using full_name as display since we don't have direct auth access
          role: userRole?.role || "staff",
          role_id: userRole?.id || "",
        };
      });

      return usersWithRoles;
    },
    enabled: isAdmin,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ roleId, userId, newRole }: { roleId: string; userId: string; newRole: AppRole }) => {
      if (roleId) {
        const { error } = await supabase
          .from("user_roles")
          .update({ role: newRole })
          .eq("id", roleId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: newRole });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({
        title: "Role updated",
        description: "User role has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update role: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateUser = async () => {
    // Validate inputs
    try {
      nameSchema.parse(newUserName);
      emailSchema.parse(newUserEmail);
      passwordSchema.parse(newUserPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: err.errors[0].message,
        });
        return;
      }
    }

    setIsCreating(true);

    try {
      // Create user via Supabase Auth Admin API (using edge function)
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: newUserEmail,
          password: newUserPassword,
          fullName: newUserName,
          role: newUserRole,
          companyId: companyId,
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: "User created",
        description: `${newUserName} has been added as ${newUserRole}.`,
      });

      // Reset form
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("staff");
      setIsCreateDialogOpen(false);

      // Refresh users list
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to create user",
        description: error.message || "An error occurred while creating the user.",
      });
    } finally {
      setIsCreating(false);
    }
  };

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const filteredUsers = users?.filter(
    (user) =>
      user.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleIcon = (role: AppRole) => {
    switch (role) {
      case "admin":
        return <ShieldCheck className="h-4 w-4" />;
      case "pharmacist":
        return <Shield className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleBadgeVariant = (role: AppRole) => {
    switch (role) {
      case "admin":
        return "destructive";
      case "pharmacist":
        return "default";
      default:
        return "secondary";
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="text-responsive-xl font-bold">User Management</h1>
          <p className="text-muted-foreground text-responsive-sm">Manage user roles and permissions</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 mobile-full">
              <UserPlus className="h-4 w-4" />
              <span className="mobile-hide">Add New User</span>
              <span className="mobile-show">Add User</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="dialog-responsive">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new user to the system. They will receive login credentials.
              </DialogDescription>
            </DialogHeader>
            <div className="form-grid py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="Enter full name"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  disabled={isCreating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@pharmacy.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  disabled={isCreating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimum 6 characters"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  disabled={isCreating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={newUserRole} onValueChange={(v: AppRole) => setNewUserRole(v)} disabled={isCreating}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="pharmacist">Pharmacist</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isCreating} className="mobile-full">
                Cancel
              </Button>
              <Button onClick={handleCreateUser} disabled={isCreating} className="mobile-full">
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create User"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards - Mobile optimized */}
      <div className="card-grid-3">
        <Card className="stat-card">
          <CardHeader className="pb-2 p-3 sm:p-6">
            <CardTitle className="text-responsive-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold">{users?.length || 0}</div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2 p-3 sm:p-6">
            <CardTitle className="text-responsive-sm font-medium text-muted-foreground">
              Pharmacists
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold">
              {users?.filter((u) => u.role === "pharmacist").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2 p-3 sm:p-6">
            <CardTitle className="text-responsive-sm font-medium text-muted-foreground">
              Admins
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold">
              {users?.filter((u) => u.role === "admin").length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-responsive-base">All Users</CardTitle>
          <CardDescription className="text-responsive-sm">
            Promote staff to pharmacist or admin roles
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          <div className="flex flex-col sm:flex-row gap-3 mb-4 sm:mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading users...
            </div>
          ) : filteredUsers?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No users found
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="mobile-card-table">
                {filteredUsers?.map((user) => (
                  <div key={user.user_id} className="mobile-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{user.full_name}</span>
                      <Badge variant={getRoleBadgeVariant(user.role)} className="gap-1 badge-responsive">
                        {getRoleIcon(user.role)}
                        {user.role}
                      </Badge>
                    </div>
                    <Select
                      value={user.role}
                      onValueChange={(value: AppRole) =>
                        updateRoleMutation.mutate({
                          roleId: user.role_id,
                          userId: user.user_id,
                          newRole: value,
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="pharmacist">Pharmacist</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="desktop-table rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Current Role</TableHead>
                      <TableHead>Change Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers?.map((user) => (
                      <TableRow key={user.user_id}>
                        <TableCell>
                          <div className="font-medium">{user.full_name}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getRoleBadgeVariant(user.role)} className="gap-1">
                            {getRoleIcon(user.role)}
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={user.role}
                            onValueChange={(value: AppRole) =>
                              updateRoleMutation.mutate({
                                roleId: user.role_id,
                                userId: user.user_id,
                                newRole: value,
                              })
                            }
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="staff">Staff</SelectItem>
                              <SelectItem value="pharmacist">Pharmacist</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {/* Invoice Format */}
      <InvoiceSettingsSection />
      {/* Data Backup */}
      <BackupSection />
    </div>
  );
}
