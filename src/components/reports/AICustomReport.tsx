import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Download, FileJson, FileText, Clock } from "lucide-react";
import { executeNLQuery } from "@/services/queryEngine";
import { exportToCSV, exportToJSON, exportToPDF, generateFilename } from "@/lib/query/export";
import { useToast } from "@/hooks/use-toast";
import type { NLQueryResponse } from "@/types/queryEngine";

const EXAMPLES = [
  "Top 10 selling products this month with quantity and revenue",
  "Customers with outstanding payments over 30 days old",
  "Monthly sales totals for the last 6 months",
  "Suppliers ranked by total purchase value this year",
  "Products with stock below reorder level",
  "Doctor-wise prescription count and revenue this quarter",
  "GST collected per month for current financial year",
  "Daily sales for last 14 days with order count",
];

export function AICustomReport() {
  const { user } = useAuth();
  const { companyId } = useBusiness();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<NLQueryResponse | null>(null);

  const run = async () => {
    if (!query.trim() || !companyId) return;
    setIsRunning(true);
    setResult(null);
    try {
      const res = await executeNLQuery(supabase, {
        query,
        company_id: companyId,
        options: { include_analysis: true },
      });
      setResult(res);
      if (!res.success) {
        toast({
          title: "Report failed",
          description: res.error?.message ?? "Unknown error",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Report failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const download = async (fmt: "csv" | "json" | "pdf") => {
    if (!result?.data?.length) return;
    const base = (title.trim() || "ai-report").replace(/\s+/g, "-").toLowerCase();
    const filename = generateFilename(base, fmt);
    try {
      if (fmt === "csv") exportToCSV(result.data, result.columns, filename);
      else if (fmt === "json") exportToJSON(result.data, filename);
      else await exportToPDF(result.data, result.columns ?? [], title.trim() || "AI Report", filename);
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Custom Report
          </CardTitle>
          <CardDescription>
            Describe the report you want in plain English. The AI will query your data and return a downloadable report.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Report title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Top Customers October"
              className="w-full h-9 px-3 rounded-md border bg-background text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">What report do you need?</label>
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={3}
              placeholder="e.g. Show top 10 customers by revenue this month with their phone numbers"
              className="resize-none"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <Badge
                key={ex}
                variant="outline"
                className="cursor-pointer hover:bg-accent"
                onClick={() => setQuery(ex)}
              >
                {ex}
              </Badge>
            ))}
          </div>

          <Button onClick={run} disabled={!query.trim() || isRunning || !companyId || !user} className="w-full">
            {isRunning ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating report…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />Generate Report</>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && result.success && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>{title.trim() || "Report Results"}</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Clock className="h-3 w-3" /> {result.execution_time_ms}ms · {result.row_count} rows
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => download("csv")} disabled={!result.data?.length}>
                  <Download className="h-4 w-4 mr-1" /> CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => download("json")} disabled={!result.data?.length}>
                  <FileJson className="h-4 w-4 mr-1" /> JSON
                </Button>
                <Button size="sm" variant="outline" onClick={() => download("pdf")} disabled={!result.data?.length}>
                  <FileText className="h-4 w-4 mr-1" /> PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.sql && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View generated SQL</summary>
                <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto">{result.sql}</pre>
              </details>
            )}

            {result.data && result.data.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        {result.columns?.map((c) => (
                          <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.slice(0, 200).map((row, i) => (
                        <tr key={i} className="border-t">
                          {result.columns?.map((c) => (
                            <td key={c} className="px-3 py-2">
                              {row[c] !== null && row[c] !== undefined ? String(row[c]) : "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.data.length > 200 && (
                  <p className="text-center text-xs text-muted-foreground p-2">
                    Showing first 200 of {result.data.length} rows · download to see all
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No rows returned.</p>
            )}
          </CardContent>
        </Card>
      )}

      {result && !result.success && (
        <Card>
          <CardContent className="pt-6">
            <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
              <p className="font-medium">Error: {result.error?.type}</p>
              <p className="text-sm mt-1">{result.error?.message}</p>
              {result.error?.suggestion && (
                <p className="text-sm mt-2 opacity-80">Suggestion: {result.error.suggestion}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
