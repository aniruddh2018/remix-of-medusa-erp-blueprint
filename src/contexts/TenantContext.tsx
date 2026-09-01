import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { controlPlaneClient, CONTROL_PLANE_URL, CONTROL_PLANE_ANON_KEY } from "@/integrations/supabase/controlPlaneClient";
import { setActiveTenantClient, clearActiveTenantClient } from "@/integrations/supabase/client";

export interface ResolvedTenant {
  projectUrl: string;
  anonKey: string;
  name: string;
  slug: string;
  /** The email that was resolved to this tenant, kept alongside it so a page
   *  refresh can restore the password step without losing what was typed —
   *  `tenant` alone survives a reload via localStorage, but component state
   *  (the controlled email input) does not. */
  email: string;
}

interface TenantContextType {
  tenant: ResolvedTenant | null;
  /** Bumps every time the active tenant client changes, so AuthContext knows
   *  to (re)subscribe to the correct client's auth events. */
  tenantVersion: number;
  resolving: boolean;
  /** Step 1 of login: look up which client project this email belongs to,
   *  and activate that project's client (see resolve-tenant edge function). */
  resolveTenant: (email: string) => Promise<{ error: string | null }>;
  /** The Super Admin's own login path — activates the control plane project
   *  itself as the "tenant", so the rest of the app (which only knows how
   *  to talk to `supabase`, the active-tenant proxy) works unmodified for
   *  super-admin screens like SuperAdmin.tsx. */
  activateControlPlane: () => void;
  clearTenant: () => void;
}

const STORAGE_KEY = "erp_resolved_tenant";
const CONTROL_PLANE_SLUG = "__control_plane__";

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<ResolvedTenant | null>(null);
  const [tenantVersion, setTenantVersion] = useState(0);
  const [resolving, setResolving] = useState(false);

  const activate = useCallback((t: ResolvedTenant, persist: boolean) => {
    setActiveTenantClient(t.projectUrl, t.anonKey, t.slug);
    setTenant(t);
    setTenantVersion((v) => v + 1);
    if (persist) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    }
  }, []);

  // On first mount, reactivate a previously resolved tenant (if any) BEFORE
  // anything downstream (AuthContext included) needs a working `supabase`
  // client — this is what lets a page refresh skip straight back to the
  // password step instead of asking for the email again every time.
  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        activate(JSON.parse(cached) as ResolvedTenant, false);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    // Intentionally run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveTenant = useCallback(
    async (email: string) => {
      setResolving(true);
      try {
        const { data, error } = await controlPlaneClient.functions.invoke("resolve-tenant", {
          body: { email },
        });
        if (error || !data?.success) {
          return {
            error:
              data?.error ||
              error?.message ||
              "We couldn't find your organization. Please check your email or contact your administrator.",
          };
        }
        activate(
          {
            projectUrl: data.project_url,
            anonKey: data.anon_key,
            name: data.tenant_name,
            slug: data.tenant_slug,
            email: email.trim(),
          },
          true
        );
        return { error: null };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Something went wrong. Please try again." };
      } finally {
        setResolving(false);
      }
    },
    [activate]
  );

  const activateControlPlane = useCallback(() => {
    activate(
      { projectUrl: CONTROL_PLANE_URL, anonKey: CONTROL_PLANE_ANON_KEY, name: "Control Plane", slug: CONTROL_PLANE_SLUG, email: "" },
      true
    );
  }, [activate]);

  const clearTenant = useCallback(() => {
    clearActiveTenantClient();
    localStorage.removeItem(STORAGE_KEY);
    setTenant(null);
    setTenantVersion((v) => v + 1);
  }, []);

  return (
    <TenantContext.Provider
      value={{ tenant, tenantVersion, resolving, resolveTenant, activateControlPlane, clearTenant }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (ctx === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return ctx;
}
