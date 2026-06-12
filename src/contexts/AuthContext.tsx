import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "pharmacist" | "staff" | "super_admin";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  isPharmacist: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);

  const fetchUserRoles = async (userId: string): Promise<AppRole[]> => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      
      if (error) {
        console.error("[Auth] Error fetching roles:", error);
        return [];
      }
      
      return (data || []).map((r) => r.role as AppRole);
    } catch (err) {
      console.error("[Auth] Failed to fetch roles:", err);
      return [];
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1. Set up auth state listener FIRST (Supabase best practice)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[Auth] onAuthStateChange:", event, session?.user?.email);
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // IMPORTANT: Don't call Supabase inside onAuthStateChange directly
          // to avoid deadlocks. Use setTimeout(0) to defer.
          const userId = session.user.id;
          setTimeout(async () => {
            if (!mounted) return;
            const userRoles = await fetchUserRoles(userId);
            if (mounted) {
              setRoles(userRoles);
              setLoading(false);
            }
          }, 0);
        } else {
          setRoles([]);
          setLoading(false);
        }
      }
    );

    // 2. Get initial session (reads from localStorage, may refresh token)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log("[Auth] getSession:", session?.user?.email ?? "no session");
      if (!mounted) return;

      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const userRoles = await fetchUserRoles(session.user.id);
        if (mounted) {
          setRoles(userRoles);
        }
      }
      
      if (mounted) setLoading(false);
    }).catch((err) => {
      console.error("[Auth] getSession failed:", err);
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isSuperAdmin = hasRole("super_admin");
  const isAdmin = hasRole("admin") || isSuperAdmin;
  const isPharmacist = hasRole("pharmacist") || isAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        roles,
        signUp,
        signIn,
        signOut,
        hasRole,
        isAdmin,
        isPharmacist,
        isSuperAdmin,
        hasPin: false,
        refreshPinStatus: () => {},
        offlineMode: false,
        offlineSession: null,
        hydrateFromOfflineSession: () => {},
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}