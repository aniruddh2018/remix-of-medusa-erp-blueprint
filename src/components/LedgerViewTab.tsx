import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, BookOpen, Loader2 } from "lucide-react";
import * as ledgerService from "@/services/ledgerService";
import type { LedgerRoleType, Ledger } from "@/types/ledger";

const ROLE_COLORS: Record<string, string> = {
  customer: 'bg-blue-100 text-blue-800', supplier: 'bg-orange-100 text-orange-800',
  manufacturer: 'bg-purple-100 text-purple-800', distributor: 'bg-teal-100 text-teal-800',
  bank: 'bg-cyan-100 text-cyan-800', tax: 'bg-red-100 text-red-800',
};

interface LedgerViewTabProps {
  role: LedgerRoleType;
}

export function LedgerViewTab({ role }: LedgerViewTabProps) {
  const { companyId } = useBusiness();
  const [search, setSearch] = useState("");

  const { data: ledgerData, isLoading } = useQuery({
    queryKey: ['ledgers-by-role', companyId, role, search],
    queryFn: () => ledgerService.getLedgers({
      companyId: companyId!,
      role,
      search: search || undefined,
      limit: 200,
    }),
    enabled: !!companyId,
  });

  const ledgers = ledgerData?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder={`Search ${role} ledgers...`} value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Badge variant="outline">{ledgerData?.count ?? 0} {role} ledgers</Badge>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : ledgers.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No {role} ledgers found. Ledgers are created when you add {role}s or import from Tally/Marg.</p>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>All Roles</TableHead>
                  <TableHead>GST</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgers.map((l: Ledger) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium text-sm">{l.name}</span>
                        {l.alias && <div className="text-xs text-muted-foreground">{l.alias}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {l.roles?.map(r => (
                          <Badge key={r} className={`text-[10px] px-1.5 py-0 h-4 ${ROLE_COLORS[r] || ''}`}>{r}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{l.gstNumber || '—'}</TableCell>
                    <TableCell className="text-xs">{l.state || '—'}</TableCell>
                    <TableCell className="text-xs">{l.sourceSystem}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      ₹{Math.abs(l.currentBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
