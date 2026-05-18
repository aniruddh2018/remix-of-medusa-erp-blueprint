/**
 * SyncContext — exposes sync state to the UI and starts/stops the engine
 * in lockstep with the user's authenticated session.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { SyncManager, type SyncState } from "@/offline/sync/SyncManager";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/offline/device";

interface SyncContextValue extends SyncState {
  forceSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user, offlineMode, offlineSession } = useAuth();
  const [state, setState] = useState<SyncState>(SyncManager.getState());

  useEffect(() => {
    const unsub = SyncManager.subscribe(setState);
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) {
      SyncManager.stop();
      return;
    }

    if (offlineMode) {
      SyncManager.start(offlineSession?.company_id ?? null);
      return () => SyncManager.stop();
    }

    // Resolve company_id then start the engine.
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      SyncManager.start(data?.company_id ?? null);

      // Register/refresh this device row (best effort).
      await supabase.from("devices").upsert({
        id: getDeviceId(),
        user_id: user.id,
        company_id: data?.company_id ?? null,
        device_name: navigator.userAgent.slice(0, 120),
        last_seen_at: new Date().toISOString(),
      } as never);
    })().catch((e) => console.warn("[Sync] start failed:", e));

    return () => {
      cancelled = true;
      SyncManager.stop();
    };
  }, [user, offlineMode, offlineSession?.company_id]);

  const forceSync = useCallback(() => SyncManager.forceSync(), []);

  return (
    <SyncContext.Provider value={{ ...state, forceSync }}>{children}</SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}

export function useSyncSafe() {
  return useContext(SyncContext);
}
