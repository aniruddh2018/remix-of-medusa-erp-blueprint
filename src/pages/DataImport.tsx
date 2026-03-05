import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader2, Download, Users, Package, Boxes } from "lucide-react";

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

interface ParsedRow {
  [key: string]: string;
}

const SUPPLIER_COLUMNS = ["name", "contact_person", "phone", "email", "gst_number", "drug_license_number", "address"];
const PRODUCT_COLUMNS = ["name", "manufacturer", "category", "unit", "mrp", "purchase_price", "sale_price", "gst_percentage", "hsn_code", "generic_name", "composition", "strength", "drug_schedule", "min_stock_level", "max_stock_level", "reorder_level"];
const INVENTORY_COLUMNS = ["product_name", "batch_number", "quantity", "purchase_price", "mrp", "expiry_date", "manufacturing_date", "supplier_name"];

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""));
    const row: ParsedRow = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });
    return row;
  });

  return { headers, rows };
}

function CSVTemplateButton({ columns, filename }: { columns: string[]; filename: string }) {
  const download = () => {
    const csv = columns.join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={download}>
      <Download className="h-4 w-4 mr-1" /> Download Template
    </Button>
  );
}

function ImportTab({
  title,
  description,
  icon: Icon,
  columns,
  templateFilename,
  importType,
  companyId,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  columns: string[];
  templateFilename: string;
  importType: "suppliers" | "products" | "inventory";
  companyId: string | null;
}) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: ParsedRow[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);

    const text = await f.text();
    const parsed = parseCSV(text);
    setPreview(parsed);
  };

  const handleImport = async () => {
    if (!preview || !companyId) return;
    setImporting(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("csv-import", {
        body: {
          type: importType,
          company_id: companyId,
          rows: preview.rows,
        },
      });

      if (error) throw error;

      const res = data as ImportResult;
      setResult(res);
      toast({
        title: `Import Complete`,
        description: `${res.success} imported, ${res.failed} failed.`,
        variant: res.failed > 0 ? "destructive" : "default",
      });
    } catch (err: any) {
      console.error("Import error:", err);
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <CSVTemplateButton columns={columns} filename={templateFilename} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Select CSV File</Label>
          <Input type="file" accept=".csv" onChange={handleFileChange} className="mt-1" />
        </div>

        {preview && preview.rows.length > 0 && (
          <>
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                Found <strong>{preview.rows.length}</strong> rows with columns:{" "}
                {preview.headers.map((h) => (
                  <Badge key={h} variant={columns.includes(h) ? "default" : "secondary"} className="mr-1 mb-1">
                    {h}
                  </Badge>
                ))}
              </AlertDescription>
            </Alert>

            <div className="border rounded-lg overflow-auto max-h-64">
              <Table>
                <TableHeader>
                  <TableRow>
                    {preview.headers.slice(0, 6).map((h) => (
                      <TableHead key={h} className="text-xs">{h}</TableHead>
                    ))}
                    {preview.headers.length > 6 && <TableHead className="text-xs">...</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.slice(0, 5).map((row, i) => (
                    <TableRow key={i}>
                      {preview.headers.slice(0, 6).map((h) => (
                        <TableCell key={h} className="text-xs">{row[h]}</TableCell>
                      ))}
                      {preview.headers.length > 6 && <TableCell className="text-xs">...</TableCell>}
                    </TableRow>
                  ))}
                  {preview.rows.length > 5 && (
                    <TableRow>
                      <TableCell colSpan={Math.min(preview.headers.length, 7)} className="text-center text-xs text-muted-foreground">
                        ...and {preview.rows.length - 5} more rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <Button onClick={handleImport} disabled={importing} className="w-full">
              {importing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" /> Import {preview.rows.length} rows</>
              )}
            </Button>
          </>
        )}

        {result && (
          <Alert variant={result.failed > 0 ? "destructive" : "default"}>
            {result.failed > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            <AlertDescription>
              <p><strong>{result.success}</strong> imported successfully, <strong>{result.failed}</strong> failed.</p>
              {result.errors.length > 0 && (
                <ul className="mt-2 text-xs space-y-1 max-h-32 overflow-auto">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>• {e}</li>
                  ))}
                  {result.errors.length > 20 && <li>...and {result.errors.length - 20} more errors</li>}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Expected columns:</strong> {columns.join(", ")}</p>
          <p>Download the template for the correct format. Extra columns are ignored.</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DataImport() {
  const { isSuperAdmin, loading } = useAuth();
  const { companyId } = useBusiness();

  if (loading) return null;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <PageHeader title="Data Import" description="Import data from CSV files — Suppliers first, then Products, then Inventory" />

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Import Order:</strong> Import Suppliers first, then Products, then Inventory batches.
          Products reference suppliers, and inventory references both products and suppliers.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="suppliers">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="suppliers" className="flex items-center gap-2">
            <Users className="h-4 w-4" /> 1. Suppliers
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" /> 2. Products
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center gap-2">
            <Boxes className="h-4 w-4" /> 3. Inventory
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers">
          <ImportTab
            title="Import Suppliers"
            description="Import your supplier master data. Do this first."
            icon={Users}
            columns={SUPPLIER_COLUMNS}
            templateFilename="suppliers_template.csv"
            importType="suppliers"
            companyId={companyId}
          />
        </TabsContent>

        <TabsContent value="products">
          <ImportTab
            title="Import Products"
            description="Import product catalog. Ensure suppliers are imported first."
            icon={Package}
            columns={PRODUCT_COLUMNS}
            templateFilename="products_template.csv"
            importType="products"
            companyId={companyId}
          />
        </TabsContent>

        <TabsContent value="inventory">
          <ImportTab
            title="Import Inventory Batches"
            description="Import inventory with batch details. Products and suppliers must exist first."
            icon={Boxes}
            columns={INVENTORY_COLUMNS}
            templateFilename="inventory_template.csv"
            importType="inventory"
            companyId={companyId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
