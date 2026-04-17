import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Stethoscope, Pill, Search } from "lucide-react";
import { format } from "date-fns";

export function DoctorReports() {
  const { companyId } = useBusiness();
  const [search, setSearch] = useState("");

  const { data: salesByDoctor = [] } = useQuery({
    queryKey: ["doctor-sales-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("id, invoice_number, sale_date, customer_name, doctor_name, doctor_registration_number, total_amount")
        .eq("company_id", companyId!)
        .not("doctor_name", "is", null)
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const { data: scheduledByDoctor = [] } = useQuery({
    queryKey: ["doctor-scheduled-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_drug_register")
        .select(`
          id, transaction_date, transaction_type, quantity, doctor_name,
          doctor_registration_number, patient_name, prescription_number,
          product:products(name, drug_schedule)
        `)
        .eq("company_id", companyId!)
        .not("doctor_name", "is", null)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const aggregated = useMemo(() => {
    const map = new Map<string, { name: string; reg: string; bills: number; total: number }>();
    salesByDoctor.forEach((s: any) => {
      const key = `${s.doctor_name}|${s.doctor_registration_number || ""}`;
      const existing = map.get(key) || { name: s.doctor_name, reg: s.doctor_registration_number || "", bills: 0, total: 0 };
      existing.bills += 1;
      existing.total += Number(s.total_amount || 0);
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [salesByDoctor]);

  const filteredAgg = aggregated.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.reg.toLowerCase().includes(search.toLowerCase())
  );

  const filteredScheduled = scheduledByDoctor.filter((s: any) =>
    !search ||
    (s.doctor_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.product?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container">
      <PageHeader
        title="Doctor Reports"
        description="Sales by doctor and scheduled drug dispensing for compliance"
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "Doctor Reports" }]}
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search doctor or product..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales"><Stethoscope className="h-4 w-4 mr-1" /> Sales by Doctor</TabsTrigger>
          <TabsTrigger value="scheduled"><Pill className="h-4 w-4 mr-1" /> Scheduled Drug Dispensing</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Doctor totals</CardTitle>
              <CardDescription>Aggregated revenue per prescribing doctor</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Reg. Number</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgg.map((d) => (
                    <TableRow key={d.name + d.reg}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="font-mono text-xs">{d.reg || "—"}</TableCell>
                      <TableCell className="text-right">{d.bills}</TableCell>
                      <TableCell className="text-right font-mono">₹{d.total.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {filteredAgg.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No doctor sales yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent invoices</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesByDoctor
                    .filter((s: any) => !search || (s.doctor_name || "").toLowerCase().includes(search.toLowerCase()))
                    .slice(0, 50)
                    .map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs">{format(new Date(s.sale_date), "dd/MM/yy")}</TableCell>
                        <TableCell className="font-mono text-xs">{s.invoice_number}</TableCell>
                        <TableCell>{s.customer_name}</TableCell>
                        <TableCell>{s.doctor_name}{s.doctor_registration_number ? ` (${s.doctor_registration_number})` : ""}</TableCell>
                        <TableCell className="text-right font-mono">₹{Number(s.total_amount).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scheduled" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Scheduled Drug Dispensing</CardTitle>
              <CardDescription>Compliance log of Schedule H/H1/X/Narcotic dispensing per doctor</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Rx #</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredScheduled.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">{format(new Date(s.transaction_date), "dd/MM/yy")}</TableCell>
                      <TableCell>{s.product?.name || "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{s.product?.drug_schedule || "—"}</Badge></TableCell>
                      <TableCell>{s.doctor_name}{s.doctor_registration_number ? ` (${s.doctor_registration_number})` : ""}</TableCell>
                      <TableCell>{s.patient_name || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{s.prescription_number || "—"}</TableCell>
                      <TableCell className="text-right">{s.quantity}</TableCell>
                    </TableRow>
                  ))}
                  {filteredScheduled.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No dispensing records</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default DoctorReports;
