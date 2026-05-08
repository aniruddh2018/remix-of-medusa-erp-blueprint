import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface UserCompany {
  company_id: string;
  role: string;
  company: { id: string; name: string } | null;
}

export function CompanySwitcher() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [companies, setCompanies] = useState<UserCompany[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const [{ data: ucs }, { data: profile }] = await Promise.all([
        supabase
          .from("user_companies")
          .select("company_id, role, company:companies(id, name)")
          .eq("user_id", user.id),
        supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (!mounted) return;
      setCompanies((ucs as unknown as UserCompany[]) || []);
      setActiveCompanyId(profile?.company_id ?? null);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  const switchTo = async (companyId: string, role: string) => {
    if (!user || companyId === activeCompanyId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ company_id: companyId })
        .eq("user_id", user.id);
      if (pErr) throw pErr;

      // Check if user is super_admin — if so, NEVER touch user_roles
      const { data: existingRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isSuperAdmin = (existingRoles || []).some((r) => r.role === "super_admin");

      if (!isSuperAdmin) {
        // Replace only non-super_admin roles with the role for the new company
        await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", user.id)
          .neq("role", "super_admin");
        await supabase.from("user_roles").insert({
          user_id: user.id,
          role: role as "admin" | "pharmacist" | "staff" | "super_admin",
        });
      }

      toast({ title: "Company switched", description: "Reloading..." });
      window.location.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Switch failed";
      toast({ title: "Failed to switch company", description: msg, variant: "destructive" });
      setSwitching(false);
    }
  };

  if (loading || companies.length <= 1) return null;

  const active = companies.find((c) => c.company_id === activeCompanyId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          disabled={switching}
          className="h-9 gap-2 max-w-[220px]"
        >
          {switching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Building2 className="h-4 w-4 shrink-0" />
          )}
          <span className="truncate text-xs">
            {active?.company?.name || "Select company"}
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search company..." />
          <CommandList>
            <CommandEmpty>No companies found.</CommandEmpty>
            <CommandGroup heading="Your companies">
              {companies.map((c) => (
                <CommandItem
                  key={c.company_id}
                  value={c.company?.name || c.company_id}
                  onSelect={() => switchTo(c.company_id, c.role)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      activeCompanyId === c.company_id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm">{c.company?.name || "Unnamed"}</span>
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {c.role}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
