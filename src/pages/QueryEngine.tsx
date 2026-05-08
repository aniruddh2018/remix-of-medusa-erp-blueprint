import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Clock, BarChart3, Settings, History } from "lucide-react";
import { executeNLQuery, getQueryHistory } from "@/services/queryEngine";
import type { NLQueryResponse, QueryHistory } from "@/types/queryEngine";

const QueryEngine = () => {
  const { user, loading } = useAuth();
  const { companyId } = useBusiness();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<NLQueryResponse | null>(null);
  const [history, setHistory] = useState<QueryHistory[]>([]);
  const [activeTab, setActiveTab] = useState("natural-language");

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [loading, user, navigate]);

  if (loading) return null;

  const handleExecuteQuery = async () => {
    if (!query.trim() || !companyId) return;

    setIsExecuting(true);
    setResult(null);

    try {
      const response = await executeNLQuery(supabase, {
        query,
        company_id: companyId,
        options: {
          include_analysis: true,
        },
      });

      setResult(response);

      // Refresh history after successful query
      if (response.success) {
        loadHistory();
      }
    } catch (error) {
      console.error("Query execution error:", error);
      setResult({
        success: false,
        execution_time_ms: 0,
        row_count: 0,
        error: {
          type: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to execute query",
        },
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const loadHistory = async () => {
    if (!user || !companyId) return;

    const { data, error } = await getQueryHistory(supabase, {
      user_id: user.id,
      company_id: companyId,
      limit: 10,
    });

    if (!error && data) {
      setHistory(data);
    }
  };

  const handleHistoryClick = (historyItem: QueryHistory) => {
    setQuery(historyItem.query_text);
    setActiveTab("natural-language");
  };

  // Load history on mount
  useEffect(() => {
    if (user && companyId) {
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exampleQueries = [
    "Show me total sales this month",
    "Top 5 customers by revenue",
    "Products with low stock",
    "Sales by category last 30 days",
    "Payments received this week",
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        title="Query Engine"
        description="Ask questions in natural language to query your ERP data"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="natural-language">
            <Sparkles className="h-4 w-4 mr-2" />
            Natural Language
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
          <TabsTrigger value="saved">
            <Settings className="h-4 w-4 mr-2" />
            Saved Queries
          </TabsTrigger>
        </TabsList>

        <TabsContent value="natural-language" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Natural Language Query</CardTitle>
              <CardDescription>
                Ask questions about your data in plain English
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Your Question</label>
                <Textarea
                  placeholder="e.g., Show me total sales this month"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {exampleQueries.map((example) => (
                  <Badge
                    key={example}
                    variant="outline"
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => setQuery(example)}
                  >
                    {example}
                  </Badge>
                ))}
              </div>

              <Button
                onClick={handleExecuteQuery}
                disabled={!query.trim() || isExecuting || !companyId}
                className="w-full"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Execute Query
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Results</span>
                  {result.success && (
                    <Badge variant="default" className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {result.execution_time_ms}ms
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.success ? (
                  <>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{result.row_count} rows returned</span>
                      {result.sql && (
                        <details className="flex-1">
                          <summary className="cursor-pointer hover:text-foreground">View SQL</summary>
                          <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                            {result.sql}
                          </pre>
                        </details>
                      )}
                    </div>

                    {result.analysis && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" />
                            Analysis
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <p className="text-sm text-muted-foreground">Rows</p>
                              <p className="text-2xl font-bold">{result.analysis.row_count}</p>
                            </div>
                            <div className="space-y-2">
                              <p className="text-sm text-muted-foreground">Columns</p>
                              <p className="text-2xl font-bold">{result.analysis.column_count}</p>
                            </div>
                          </div>
                          {result.analysis.summary_stats && Object.keys(result.analysis.summary_stats).length > 0 && (
                            <div className="mt-4 space-y-2">
                              <p className="text-sm font-medium">Statistics</p>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                {Object.entries(result.analysis.summary_stats).map(([col, stats]) => (
                                  <div key={col} className="p-2 bg-muted rounded">
                                    <p className="font-medium">{col}</p>
                                    <p className="text-muted-foreground">
                                      Avg: {stats.avg.toFixed(2)} | Min: {stats.min} | Max: {stats.max}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {result.data && result.data.length > 0 && (
                      <div className="border rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-muted">
                              <tr>
                                {result.columns?.map((col) => (
                                  <th key={col} className="px-4 py-2 text-left text-sm font-medium">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {result.data.slice(0, 100).map((row, idx) => (
                                <tr key={idx} className="border-t">
                                  {result.columns?.map((col) => (
                                    <td key={col} className="px-4 py-2 text-sm">
                                      {row[col] !== null && row[col] !== undefined
                                        ? String(row[col])
                                        : "-"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {result.data.length > 100 && (
                          <p className="text-center text-sm text-muted-foreground p-2">
                            Showing first 100 of {result.data.length} rows
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
                    <p className="font-medium">Error: {result.error?.type}</p>
                    <p className="text-sm mt-1">{result.error?.message}</p>
                    {result.error?.suggestion && (
                      <p className="text-sm mt-2 text-muted-foreground">
                        Suggestion: {result.error.suggestion}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Query History</CardTitle>
              <CardDescription>Your recent queries</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No query history yet. Start by asking a question!
                </p>
              ) : (
                <div className="space-y-2">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 border rounded-lg hover:bg-accent cursor-pointer"
                      onClick={() => handleHistoryClick(item)}
                    >
                      <p className="text-sm font-medium">{item.query_text}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(item.created_at).toLocaleString()}
                        {item.row_count > 0 && (
                          <>
                            <span>•</span>
                            <span>{item.row_count} rows</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="saved" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Saved Queries</CardTitle>
              <CardDescription>Coming soon - Save and reuse your favorite queries</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                Saved queries feature will be available in Phase 2.2
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default QueryEngine;
