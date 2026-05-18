/**
 * If we have a cached encrypted session and the live Supabase session
 * is unavailable (no network, or simply not signed in on this device yet),
 * present the PIN unlock screen instead of bouncing the user to /auth.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { OfflinePinUnlock } from "./OfflinePinUnlock";
import { hasOfflineCache } from "@/offline/auth/offlineSession";

export function OfflineGate({ children }: { children: React.ReactNode }) {
  const { user, loading, hydrateFromOfflineSession } = useAuth();
  const [eligible, setEligible] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (loading || user) { if (alive) setEligible(false); return; }
      const cached = await hasOfflineCache();
      // If a PIN cache exists, let the app boot from local data even when the
      // browser reports "online" but the live session/network is unavailable.
      if (alive) setEligible(cached);
    })();
    return () => { alive = false; };
  }, [user, loading]);

  if (!loading && !user && eligible === null) {
    return null;
  }

  if (eligible) {
    return <OfflinePinUnlock onUnlocked={hydrateFromOfflineSession} />;
  }
  return <>{children}</>;
}
