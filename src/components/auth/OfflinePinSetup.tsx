import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { setOfflinePin, type CachedSession } from "@/offline/auth/offlineSession";
import { Shield } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  session: CachedSession;
  onConfigured?: () => void;
}

export function OfflinePinSetup({ open, onOpenChange, session, onConfigured }: Props) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (pin.length < 4) { toast({ title: "PIN must be at least 4 digits", variant: "destructive" }); return; }
    if (pin !== confirm) { toast({ title: "PINs do not match", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await setOfflinePin(pin, session);
      toast({ title: "Offline access enabled", description: "You can now unlock the app without internet." });
      onConfigured?.();
      onOpenChange(false);
      setPin(""); setConfirm("");
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Set Offline PIN</DialogTitle>
          <DialogDescription>
            Pick a 4–8 digit PIN to unlock this device when offline. Your session and roles are encrypted locally and kept for up to 30 days.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="pin">PIN</Label>
            <Input id="pin" type="password" inputMode="numeric" maxLength={8} autoComplete="new-password"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm PIN</Label>
            <Input id="confirm" type="password" inputMode="numeric" maxLength={8} autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Enable Offline Access"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
