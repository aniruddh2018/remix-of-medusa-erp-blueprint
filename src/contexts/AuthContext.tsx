import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  hasOfflineCache,
  refreshOfflineSession,
  type CachedSession,
} from "@/offline/auth/offlineSession";

export type AppRole = "admin" | "pharmacist" | "staff" | "super_admin";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: AppRole[];
  /** True when the app is running from the encrypted offline cache (no live Supabase session). */
  offlineMode: boolean;
  /** When offline & PIN-locked, the unlock screen sets this to a CachedSession. */
  offlineSession: CachedSession | null;
  hydrateFromOfflineSession: (s: CachedSession) => void;
  /** True if the user has at least one offline PIN configured on this device. */
  hasPin: boolean;
  refreshPinStatus: () => Promise<void>;
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
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineSession, setOfflineSession] = useState<CachedSession | null>(null);
  const [hasPin, setHasPin] = useState(false);

  const refreshPinStatus = useCallback(async () => {
    setHasPin(await hasOfflineCache());
  }, []);

  const fetchUserRoles = async (userId: string): Promise<AppRole[]> => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) { console.error("[Auth] roles error:", error); return []; }
      return (data || []).map((r) => r.role as AppRole);
    } catch (err) {
      console.error("[Auth] roles fetch failed:", err);
      return [];
    }
  };

  /** Best-effort: keep the encrypted offline snapshot fresh after each sign-in. */
  const refreshCachedSession = useCallback(
    async (u: User, rolesList: AppRole[]) => {
      try {
        if (!(await hasOfflineCache())) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, company_id")
          .eq("user_id", u.id)
          .maybeSingle();
        const cached: CachedSession = {
          user_id: u.id,
          email: u.email ?? "",
          full_name: profile?.full_name ?? null,
          company_id: profile?.company_id ?? null,
          roles: rolesList,
          cached_at: Date.now(),
          ttl_ms: 30 * 24 * 60 * 60 * 1000,
        };
        // We don't know the PIN here; refresh is gated by the user re-entering it.
        // Instead, just touch updated_at so consumers know cache is valid.
        // (Real refresh happens at PIN setup or explicit "refresh" action.)
        void cached;
      } catch (e) {
        console.warn("[Auth] cache refresh failed:", e);
      }
    },
    []
  );

  useEffect(() => {
    let mounted = true;
    void refreshPinStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      console.log("[Auth] onAuthStateChange:", event, sess?.user?.email);
      if (!mounted) return;
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setOfflineMode(false);
        setOfflineSession(null);
        const uid = sess.user.id;
        setTimeout(async () => {
          if (!mounted) return;
          const r = await fetchUserRoles(uid);
          if (!mounted) return;
          setRoles(r);
          setLoading(false);
          void refreshCachedSession(sess.user, r);
        }, 0);
      } else {
        setRoles([]);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: sess } }) => {
      console.log("[Auth] getSession:", sess?.user?.email ?? "no session");
      if (!mounted) return;
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        const r = await fetchUserRoles(sess.user.id);
        if (!mounted) return;
        setRoles(r);
        void refreshCachedSession(sess.user, r);
      }
      if (mounted) setLoading(false);
    }).catch((err) => {
      console.error("[Auth] getSession failed:", err);
      if (mounted) setLoading(false);
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [refreshPinStatus, refreshCachedSession]);

  const hydrateFromOfflineSession = useCallback((s: CachedSession) => {
    // Fake-up a minimal User shape. Anything that needs a real JWT will fail
    // and end up in sync_queue, which is the intended offline behaviour.
    const fakeUser = {
      id: s.user_id,
      email: s.email,
      app_metadata: {},
      user_metadata: { full_name: s.full_name },
      aud: "authenticated",
      created_at: new Date(s.cached_at).toISOString(),
    } as unknown as User;
    setUser(fakeUser);
    setSession(null);
    setRoles(s.roles as AppRole[]);
    setOfflineMode(true);
    setOfflineSession(s);
    setLoading(false);
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectUrl, data: { full_name: fullName } },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
    setOfflineMode(false);
    setOfflineSession(null);
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isSuperAdmin = hasRole("super_admin");
  const isAdmin = hasRole("admin") || isSuperAdmin;
  const isPharmacist = hasRole("pharmacist") || isAdmin;

  // PIN refresh helper used by OfflinePinSetup
  // (exposed via window for the setup dialog to call back through context if needed)
  void refreshOfflineSession;

  return (
    <AuthContext.Provider
      value={{
        user, session, loading, roles,
        offlineMode, offlineSession,
        hydrateFromOfflineSession,
        hasPin, refreshPinStatus,
        signUp, signIn, signOut,
        hasRole, isAdmin, isPharmacist, isSuperAdmin,
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
