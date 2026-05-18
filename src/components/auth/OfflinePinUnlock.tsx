import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { unlockOfflineSession, clearOfflineSession, type CachedSession } from "@/offline/auth/offlineSession";
import { Shield, WifiOff } from "lucide-react";

interface Props {
  onUnlocked: (s: CachedSession) => void;
}

export function OfflinePinUnlock({ onUnlocked }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleUnlock = async () => {
    setSubmitting(true); setError(null);
    try {
      const session = await unlockOfflineSession(pin);
      onUnlocked(session);
    } catch (e: any) {
      setError(e.message || "Wrong PIN");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Offline Unlock</CardTitle>
          <CardDescription className="flex items-center justify-center gap-1.5">
            <WifiOff className="h-3.5 w-3.5" /> Enter your PIN to open local data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pin">PIN</Label>
            <Input id="pin" type="password" inputMode="numeric" maxLength={8} autoFocus
              value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void handleUnlock(); }} />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <Button className="w-full" onClick={handleUnlock} disabled={submitting || pin.length < 4}>
            {submitting ? "Unlocking…" : "Unlock"}
          </Button>
          <Button variant="ghost" size="sm" className="w-full"
            onClick={async () => { await clearOfflineSession(); window.location.reload(); }}>
            Clear cache and sign in again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
