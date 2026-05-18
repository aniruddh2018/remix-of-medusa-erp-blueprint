import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Search, Plus, Pencil, Trash2, Stethoscope } from "lucide-react";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import type { Tables } from "@/integrations/supabase/types";
import { useDoctors } from "@/offline/hooks";

type Doctor = Tables<"doctors">;

export default function Doctors() {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [open, setOpen] = useState(false);

  useKeyboardShortcut({ key: "/", callback: () => searchRef.current?.focus() });

  const doctors = (useDoctors<Doctor>(companyId) ?? []) as Doctor[];

  const filtered = doctors.filter((d) => {
    const q = search.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.registration_number || "").toLowerCase().includes(q) ||
      (d.speciality || "").toLowerCase().includes(q) ||
      (d.phone || "").includes(q)
    );
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("doctors").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Doctor removed" });
      queryClient.invalidateQueries({ queryKey: ["doctors-page", companyId] });
      queryClient.invalidateQueries({ queryKey: ["doctors", companyId] });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <div className="page-container">
      <PageHeader
        title="Doctors"
        description="Manage prescribing doctors"
        breadcrumbs={[{ label: "Doctors" }]}
        actions={
          <Button onClick={() => { setEditing(null); setOpen(true); }} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Doctor
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search name, reg number, speciality..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Stethoscope className="h-10 w-10 mx-auto mb-2 opacity-30" />
              No doctors yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Reg. Number</TableHead>
                  <TableHead>Speciality</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {d.registration_number || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {d.speciality ? <Badge variant="secondary">{d.speciality}</Badge> : "—"}
                    </TableCell>
                    <TableCell>{d.phone || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(d); setOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remove ${d.name}?`)) deleteMutation.mutate(d.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DoctorEditDialog
        open={open}
        onOpenChange={setOpen}
        doctor={editing}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["doctors-page", companyId] });
          queryClient.invalidateQueries({ queryKey: ["doctors", companyId] });
          setOpen(false);
        }}
      />
    </div>
  );
}

function DoctorEditDialog({
  open, onOpenChange, doctor, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  doctor: Doctor | null; onSaved: () => void;
}) {
  const { companyId } = useBusiness();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "", registration_number: "", speciality: "", phone: "", email: "", address: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  // Sync form when dialog opens
  useState(() => {});
  // biome-ignore: simple effect
  if (open && doctor && form.name !== doctor.name) {
    setForm({
      name: doctor.name,
      registration_number: doctor.registration_number || "",
      speciality: doctor.speciality || "",
      phone: doctor.phone || "",
      email: doctor.email || "",
      address: doctor.address || "",
      notes: doctor.notes || "",
    });
  } else if (open && !doctor && form.name !== "") {
    setForm({ name: "", registration_number: "", speciality: "", phone: "", email: "", address: "", notes: "" });
  }

  const save = async () => {
    if (!form.name.trim() || !companyId) return;
    setSaving(true);
    const payload = {
      company_id: companyId,
      name: form.name.trim(),
      registration_number: form.registration_number.trim() || null,
      speciality: form.speciality.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };
    const { error } = doctor
      ? await supabase.from("doctors").update(payload).eq("id", doctor.id)
      : await supabase.from("doctors").insert(payload);
    setSaving(false);
    if (error) {
      toast({ variant: "destructive", title: "Save failed", description: error.message });
      return;
    }
    toast({ title: doctor ? "Doctor updated" : "Doctor added" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{doctor ? "Edit Doctor" : "Add Doctor"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div>
            <Label>Registration Number</Label>
            <Input value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} />
          </div>
          <div>
            <Label>Speciality</Label>
            <Input value={form.speciality} onChange={(e) => setForm({ ...form, speciality: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Address</Label>
            <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
