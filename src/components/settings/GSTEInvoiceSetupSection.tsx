import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Save, ShieldCheck, AlertTriangle, ChevronDown, FileSignature } from "lucide-react";
import { getEInvoiceStatus, saveEInvoiceCredentials } from "@/services/gst/einvoice";

export function GSTEInvoiceSetupSection() {
  const { companyId } = useBusiness();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["gst-einvoice-status", companyId],
    queryFn: () => getEInvoiceStatus(companyId!),
    enabled: !!companyId,
  });

  const [env, setEnv] = useState<"sandbox" | "production">("sandbox");
  const [gstin, setGstin] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [publicKeyPem, setPublicKeyPem] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [authPath, setAuthPath] = useState("");
  const [generateIrnPath, setGenerateIrnPath] = useState("");
  const [cancelIrnPath, setCancelIrnPath] = useState("");
  const [generateEwbPath, setGenerateEwbPath] = useState("");
  const [cancelEwbPath, setCancelEwbPath] = useState("");

  useEffect(() => {
    if (!status) return;
    setEnv(status.env);
    setGstin(status.gstin || "");
    setApiBaseUrl(status.api_base_url || "");
  }, [status]);

  const saveMutation = useMutation({
    mutationFn: () => saveEInvoiceCredentials({
      companyId: companyId!, env, gstin, username, client_id: clientId,
      ...(password ? { password } : {}),
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      ...(publicKeyPem ? { public_key_pem: publicKeyPem } : {}),
      ...(apiBaseUrl ? { api_base_url: apiBaseUrl } : {}),
      ...(authPath ? { auth_path: authPath } : {}),
      ...(generateIrnPath ? { generate_irn_path: generateIrnPath } : {}),
      ...(cancelIrnPath ? { cancel_irn_path: cancelIrnPath } : {}),
      ...(generateEwbPath ? { generate_ewb_path: generateEwbPath } : {}),
      ...(cancelEwbPath ? { cancel_ewb_path: cancelEwbPath } : {}),
    }),
    onSuccess: () => {
      toast({ title: "e-Invoice credentials saved" });
      setPassword(""); setClientSecret(""); setPublicKeyPem("");
      qc.invalidateQueries({ queryKey: ["gst-einvoice-status"] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5" />GST e-Invoicing (IRN via NIC API)</CardTitle>
        <CardDescription>
          Connect your NIC e-Invoice sandbox/production account to generate real IRNs, signed QR codes, and e-Way Bills
          from sales invoices. Until configured, "Generate e-Invoice" runs in <strong>test mode</strong> with a clearly
          labelled mock IRN so the rest of the flow can be tried without live credentials.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading status…</div>
        ) : status?.configured ? (
          <Alert className="border-green-600/30 bg-green-600/5">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            <AlertTitle>Live credentials configured</AlertTitle>
            <AlertDescription>
              Environment: <Badge variant="secondary">{status.env}</Badge> · GSTIN: <span className="font-mono">{status.gstin}</span>
              {!status.is_active && <span className="text-destructive ml-2">(disabled)</span>}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Test mode (mock IRNs)</AlertTitle>
            <AlertDescription>No NIC credentials configured yet — e-Invoice generation will produce mock/test IRNs only.</AlertDescription>
          </Alert>
        )}

        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <Label>Environment</Label>
            <Select value={env} onValueChange={(v: "sandbox" | "production") => setEnv(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (testing)</SelectItem>
                <SelectItem value="production">Production (live)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="einv-gstin">GSTIN registered for e-Invoice</Label>
            <Input id="einv-gstin" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} className="font-mono" />
          </div>
          <div>
            <Label htmlFor="einv-username">NIC portal username</Label>
            <Input id="einv-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
          </div>
          <div>
            <Label htmlFor="einv-password">NIC portal password</Label>
            <Input id="einv-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={status?.configured ? "•••••••• (unchanged)" : "password"} />
          </div>
          <div>
            <Label htmlFor="einv-client-id">GSP client-id</Label>
            <Input id="einv-client-id" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="client-id" />
          </div>
          <div>
            <Label htmlFor="einv-client-secret">GSP client-secret</Label>
            <Input id="einv-client-secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={status?.configured ? "•••••••• (unchanged)" : "client-secret"} />
          </div>
        </div>

        <div>
          <Label htmlFor="einv-public-key">NIC public key (PEM)</Label>
          <Textarea
            id="einv-public-key" rows={4} value={publicKeyPem} onChange={(e) => setPublicKeyPem(e.target.value)}
            placeholder={status?.configured ? "•••••••• (unchanged) — paste a new key only to rotate it" : "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Downloaded from your NIC e-Invoice sandbox/production portal (Settings → Bulk Encryption / API Public Key). Used to encrypt your password and session key locally — never sent anywhere.
          </p>
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 -ml-2">
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              Advanced: API endpoints
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Defaults match NIC's publicly documented sandbox layout. Only change these if your GSP/NIC onboarding
              docs specify different paths for your account/API version.
            </p>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="einv-base">API base URL</Label>
                <Input id="einv-base" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="https://einv-apisandbox.nic.in" className="font-mono text-xs" />
              </div>
              <div>
                <Label htmlFor="einv-auth-path">Auth path</Label>
                <Input id="einv-auth-path" value={authPath} onChange={(e) => setAuthPath(e.target.value)} placeholder="/eivital/v1.04/auth" className="font-mono text-xs" />
              </div>
              <div>
                <Label htmlFor="einv-gen-irn-path">Generate IRN path</Label>
                <Input id="einv-gen-irn-path" value={generateIrnPath} onChange={(e) => setGenerateIrnPath(e.target.value)} placeholder="/eicore/v1.03/Invoice" className="font-mono text-xs" />
              </div>
              <div>
                <Label htmlFor="einv-cancel-irn-path">Cancel IRN path</Label>
                <Input id="einv-cancel-irn-path" value={cancelIrnPath} onChange={(e) => setCancelIrnPath(e.target.value)} placeholder="/eicore/v1.03/Invoice/Cancel" className="font-mono text-xs" />
              </div>
              <div>
                <Label htmlFor="einv-gen-ewb-path">Generate e-Way Bill path</Label>
                <Input id="einv-gen-ewb-path" value={generateEwbPath} onChange={(e) => setGenerateEwbPath(e.target.value)} placeholder="/eiewb/v1.03/ewaybill" className="font-mono text-xs" />
              </div>
              <div>
                <Label htmlFor="einv-cancel-ewb-path">Cancel e-Way Bill path</Label>
                <Input id="einv-cancel-ewb-path" value={cancelEwbPath} onChange={(e) => setCancelEwbPath(e.target.value)} placeholder="/eiewb/v1.03/ewaybill/cancel" className="font-mono text-xs" />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !gstin}>
          {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save e-Invoice Credentials
        </Button>
      </CardContent>
    </Card>
  );
}
