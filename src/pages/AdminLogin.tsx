import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Loader2 } from "lucide-react";

// The platform owner's own login. Unlike the two-step tenant login on
// Auth.tsx, this always activates the CONTROL PLANE project directly (see
// TenantContext.activateControlPlane) — the super admin's account lives
// there, not inside any individual client's dedicated project. After
// signing in, isSuperAdmin is verified before letting them through; anyone
// else who lands here (even a valid control-plane login that isn't a super
// admin) is signed back out with an explanation.
export default function AdminLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const { user, isSuperAdmin, loading: authLoading, signIn, signOut } = useAuth();
  const { activateControlPlane, tenant } = useTenant();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Make sure the control-plane project is the active tenant before any
  // login attempt on this page — regardless of whatever tenant a previous
  // regular-user session on this browser had resolved.
  useEffect(() => {
    if (tenant?.slug !== "__control_plane__") {
      activateControlPlane();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    if (isSuperAdmin) {
      navigate("/super-admin", { replace: true });
    } else {
      toast({
        variant: "destructive",
        title: "Not authorized",
        description: "This login is for the platform owner only.",
      });
      signOut();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSuperAdmin, authLoading]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast({ variant: "destructive", title: "Login failed", description: error.message });
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Platform Owner Login</CardTitle>
            <CardDescription className="mt-2">Manage client backends and platform-wide settings</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
