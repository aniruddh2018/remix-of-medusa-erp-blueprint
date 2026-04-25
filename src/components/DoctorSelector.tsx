import { useState, useRef, forwardRef, useImperativeHandle } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, ChevronsUpDown, UserPlus, Stethoscope } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export type Doctor = Tables<"doctors">;

export interface DoctorSelectorHandle {
  focus: () => void;
}

interface Props {
  value: { id: string | null; name: string; registration_number: string };
  onChange: (v: { id: string | null; name: string; registration_number: string }) => void;
  required?: boolean;
  className?: string;
  onSelected?: () => void;
}

export const DoctorSelector = forwardRef<DoctorSelectorHandle, Props>(
  ({ value, onChange, required, className, onSelected }, ref) => {
    const { companyId } = useBusiness();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [showCreate, setShowCreate] = useState(false);

    useImperativeHandle(ref, () => ({ focus: () => triggerRef.current?.focus() }));

    const { data: doctors } = useQuery({
      queryKey: ["doctors", companyId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("doctors")
          .select("*")
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .order("name");
        if (error) throw error;
        return data as Doctor[];
      },
      enabled: !!companyId,
    });

    const filtered = (doctors || []).filter((d) => {
      const q = search.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        (d.registration_number || "").toLowerCase().includes(q) ||
        (d.speciality || "").toLowerCase().includes(q) ||
        (d.phone || "").includes(q)
      );
    });

    return (
      <div className={className} data-field-required={required ? "true" : undefined}>
        <Label className="text-[11px]">
          Doctor {required && <span className="text-destructive">*</span>}
        </Label>
        <div className="flex gap-1">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                ref={triggerRef}
                variant="outline"
                className="flex-1 justify-between h-8 text-sm font-normal"
                data-enter-nav-include="true"
                data-field-value={value.name || ""}
                aria-required={required || undefined}
                onKeyDown={(e) => {
                  if ((e.key === "n" || e.key === "N") && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    setShowCreate(true);
                  } else if ((e.key === "Backspace" || e.key === "Delete") && value.name) {
                    e.preventDefault();
                    onChange({ id: null, name: "", registration_number: "" });
                  }
                }}
              >
                <span className="flex items-center gap-1 truncate">
                  <Stethoscope className="h-3 w-3 opacity-60 shrink-0" />
                  {value.name
                    ? `${value.name}${value.registration_number ? ` (${value.registration_number})` : ""}`
                    : "Select doctor..."}
                </span>
                <ChevronsUpDown className="ml-1 h-3 w-3 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search by name, reg # or speciality..."
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  <CommandEmpty>
                    <div className="py-2 text-center text-sm">
                      No doctor found.
                      <Button
                        size="sm"
                        variant="link"
                        className="h-6 ml-1"
                        onClick={() => {
                          setOpen(false);
                          setShowCreate(true);
                        }}
                      >
                        Add new
                      </Button>
                    </div>
                  </CommandEmpty>
                  {value.id && (
                    <CommandGroup>
                      <CommandItem
                        value="__clear__"
                        onSelect={() => {
                          onChange({ id: null, name: "", registration_number: "" });
                          setOpen(false);
                        }}
                      >
                        <span className="text-muted-foreground text-xs">Clear selection</span>
                      </CommandItem>
                    </CommandGroup>
                  )}
                  <CommandGroup>
                    {filtered.map((d) => (
                      <CommandItem
                        key={d.id}
                        value={d.id}
                        onSelect={() => {
                          onChange({
                            id: d.id,
                            name: d.name,
                            registration_number: d.registration_number || "",
                          });
                          setOpen(false);
                          onSelected?.();
                        }}
                      >
                        <Check
                          className={`mr-2 h-3 w-3 ${value.id === d.id ? "opacity-100" : "opacity-0"}`}
                        />
                        <div className="flex-1">
                          <div className="text-sm">{d.name}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {d.registration_number ? `Reg: ${d.registration_number}` : "No reg #"}
                            {d.speciality ? ` • ${d.speciality}` : ""}
                            {d.phone ? ` • ${d.phone}` : ""}
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowCreate(true)}
            title="Add new doctor (N)"
          >
            <UserPlus className="h-3 w-3" />
          </Button>
        </div>

        <DoctorFormDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          onCreated={(doc) => {
            queryClient.invalidateQueries({ queryKey: ["doctors", companyId] });
            onChange({
              id: doc.id,
              name: doc.name,
              registration_number: doc.registration_number || "",
            });
            setShowCreate(false);
            onSelected?.();
          }}
        />
      </div>
    );
  }
);

DoctorSelector.displayName = "DoctorSelector";

// ───── Inline create dialog ─────
function DoctorFormDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (d: Doctor) => void;
}) {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [reg, setReg] = useState("");
  const [speciality, setSpeciality] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setReg("");
    setSpeciality("");
    setPhone("");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name required" });
      return;
    }
    if (!companyId) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("doctors")
      .insert({
        company_id: companyId,
        name: name.trim(),
        registration_number: reg.trim() || null,
        speciality: speciality.trim() || null,
        phone: phone.trim() || null,
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast({ variant: "destructive", title: "Failed to add doctor", description: error.message });
      return;
    }
    toast({ title: "Doctor added" });
    reset();
    onCreated(data as Doctor);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Doctor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Registration Number</Label>
            <Input
              value={reg}
              onChange={(e) => setReg(e.target.value)}
              placeholder="e.g., MCI-12345"
            />
          </div>
          <div>
            <Label>Speciality</Label>
            <Input
              value={speciality}
              onChange={(e) => setSpeciality(e.target.value)}
              placeholder="e.g., Cardiologist"
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Doctor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
