import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  generateBackupSQL,
  downloadFile,
  getLastBackupDate,
  type BackupProgress,
} from "@/utils/backupGenerator";
import { Database, Download, RefreshCw, Clock, HardDrive, Loader2 } from "lucide-react";
import { format } from "date-fns";

export function BackupSection() {
  const { companyName } = useBusiness();
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [lastResult, setLastResult] = useState<{ rowCount: number; tableStats: Record<string, number> } | null>(null);
  const lastBackup = getLastBackupDate();

  const runBackup = async (incremental: boolean) => {
    setIsRunning(true);
    setProgress(null);
    setLastResult(null);

    try {
      const result = await generateBackupSQL(incremental, setProgress);

      if (result.rowCount === 0) {
        toast({
          title: incremental ? "No new changes" : "No data found",
          description: incremental
            ? "No records have been modified since the last backup."
            : "There is no data to back up.",
        });
        setIsRunning(false);
        return;
      }

      const dateStr = format(new Date(), "yyyy-MM-dd_HH-mm");
      const safeName = (companyName || "company").replace(/[^a-zA-Z0-9]/g, "_");
      const type = incremental ? "incremental" : "full";
      const filename = `${safeName}_${type}_backup_${dateStr}.sql`;

      downloadFile(result.sql, filename);
      setLastResult({ rowCount: result.rowCount, tableStats: result.tableStats });

      toast({
        title: "Backup downloaded",
        description: `${result.rowCount} rows exported to ${filename}`,
      });
    } catch (error: any) {
      toast({
        title: "Backup failed",
        description: error.message || "An error occurred during backup.",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  const progressPercent = progress
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Data Backup
        </CardTitle>
        <CardDescription>
          Export your company data as a SQL file for local backup. The file can be directly restored into the database.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Last backup info */}
        {lastBackup && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Last backup: {format(new Date(lastBackup), "dd MMM yyyy, hh:mm a")}
          </div>
        )}

        {/* Progress */}
        {isRunning && progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Exporting: <span className="font-medium text-foreground">{progress.table}</span>
              </span>
              <span className="text-muted-foreground">
                {progress.current + 1}/{progress.total}
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        )}

        {/* Results */}
        {lastResult && !isRunning && (
          <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
            <p className="text-sm font-medium">
              ✅ Exported {lastResult.rowCount} total rows
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(lastResult.tableStats)
                .filter(([, count]) => count > 0)
                .map(([table, count]) => (
                  <Badge key={table} variant="secondary" className="text-xs">
                    {table}: {count}
                  </Badge>
                ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => runBackup(false)}
            disabled={isRunning}
            className="gap-2"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            Full Backup
          </Button>
          <Button
            onClick={() => runBackup(true)}
            disabled={isRunning || !lastBackup}
            variant="outline"
            className="gap-2"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Incremental Backup
          </Button>
        </div>

        {!lastBackup && (
          <p className="text-xs text-muted-foreground">
            Run a full backup first to enable incremental backups.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
