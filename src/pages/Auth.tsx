import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Shield, Loader2, ArrowLeft } from "lucide-react";
import { z } from "zod";
import logo from "@/assets/logo.png";

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

// Two-step login: (1) resolve which client's dedicated Supabase project this
// email belongs to (see TenantContext.resolveTenant / the resolve-tenant
// edge function), which dynamically activates that project's client, THEN
// (2) authenticate against that now-active project directly. This is what
// lets a brand-new client be onboarded (via the Super Admin "Client
// Backends" tab) without a rebuild/redeploy — see the plan at
// supabase/migrations/20260826120000_client_backends.sql for the full design.
export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const { user, signIn } = useAuth();
  const { tenant, resolving, resolveTenant, clearTenant } = useTenant();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  useEffect(() => {
    if (user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  // A resolved tenant can be restored from localStorage on page load (see
  // TenantContext), but the controlled `loginEmail` input state can't
  // survive a reload on its own — sync it from the tenant so the password
  // step shows the right email instead of falling back to a blank string.
  useEffect(() => {
    if (tenant?.email) {
      setLoginEmail(tenant.email);
    }
  }, [tenant]);

  const handleResolveTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(loginEmail);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({ variant: "destructive", title: "Validation Error", description: err.errors[0].message });
      }
      return;
    }

    const { error } = await resolveTenant(loginEmail);
    if (error) {
      toast({ variant: "destructive", title: "Couldn't sign in", description: error });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      passwordSchema.parse(loginPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({ variant: "destructive", title: "Validation Error", description: err.errors[0].message });
      }
      return;
    }

    setIsLoading(true);

    const { error } = await signIn(loginEmail, loginPassword);

    if (error) {
      let message = error.message;
      if (message.includes("Invalid login credentials")) {
        message = "Invalid email or password. Please try again.";
      }
      toast({ variant: "destructive", title: "Login Failed", description: message });
    } else {
      toast({ title: "Welcome back!", description: "You have successfully logged in." });
    }

    setIsLoading(false);
  };

  const useDifferentEmail = () => {
    setLoginPassword("");
    clearTenant();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md relative animate-fade-in shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-lg">
            <img src={logo} alt="MedikaRP" className="w-12 h-12 object-contain" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">MedikaRP</CardTitle>
            <CardDescription className="mt-2">
              {tenant ? tenant.name : "Pharmacy Management System"}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {!tenant ? (
            <form onSubmit={handleResolveTenant} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="you@pharmacy.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  disabled={resolving}
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={resolving}>
                {resolving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <button
                type="button"
                onClick={useDifferentEmail}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" />
                {loginEmail || "Use a different email"}
              </button>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  "Login"
                )}
              </Button>
            </form>
          )}

          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Secure & HIPAA Compliant</span>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Contact your administrator for access
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
