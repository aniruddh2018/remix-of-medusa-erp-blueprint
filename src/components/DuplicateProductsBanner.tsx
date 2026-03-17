import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Merge, ChevronDown, ChevronUp, Loader2, X, Eye } from "lucide-react";
import type { DuplicateGroup } from "@/utils/duplicateDetection";
import { suggestPrimary } from "@/utils/duplicateDetection";

interface DuplicateProductsBannerProps {
  groups: DuplicateGroup[];
  onMergeComplete: () => void;
  onOpenMergeDialog: () => void;
}

export function DuplicateProductsBanner({
  groups,
  onMergeComplete,
  onOpenMergeDialog,
}: DuplicateProductsBannerProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [mergingGroup, setMergingGroup] = useState<DuplicateGroup | null>(null);
  const [merging, setMerging] = useState(false);

  if (dismissed || groups.length === 0) return null;

  const totalDuplicates = groups.reduce((sum, g) => sum + g.products.length - 1, 0);

  const handleAutoMerge = async (group: DuplicateGroup) => {
    setMerging(true);
    const primaryId = suggestPrimary(group.products);
    const duplicateIds = group.products.filter((p) => p.id !== primaryId).map((p) => p.id);

    try {
      const { data, error } = await supabase.functions.invoke("merge-products", {
        body: { primary_product_id: primaryId, duplicate_product_ids: duplicateIds },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Duplicates merged",
        description: `${duplicateIds.length} product(s) merged successfully`,
      });
      setMergingGroup(null);
      onMergeComplete();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Merge failed", description: err.message });
    } finally {
      setMerging(false);
    }
  };

  const highCount = groups.filter((g) => g.confidence === "high").length;

  return (
    <>
      <Card className="border-warning/50 bg-warning/5">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {totalDuplicates} suspected duplicate{totalDuplicates > 1 ? "s" : ""} found
                {highCount > 0 && (
                  <Badge variant="destructive" className="ml-2 text-xs">
                    {highCount} exact match{highCount > 1 ? "es" : ""}
                  </Badge>
                )}
              </p>
              {!expanded && (
                <p className="text-xs text-muted-foreground">
                  {groups.length} group{groups.length > 1 ? "s" : ""} of similar products detected
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                {expanded ? "Hide" : "Review"}
              </Button>
              <Button size="sm" onClick={onOpenMergeDialog}>
                <Merge className="h-4 w-4 mr-1" />
                Manual Merge
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDismissed(true)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {expanded && (
            <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto">
              {groups.map((group, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-2 rounded-md bg-background border text-sm"
                >
                  <Badge
                    variant={group.confidence === "high" ? "destructive" : "secondary"}
                    className="text-xs shrink-0"
                  >
                    {group.confidence === "high" ? "Exact" : "Similar"}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1">
                      {group.products.map((p, pi) => (
                        <span key={p.id} className="text-xs">
                          {pi > 0 && <span className="text-muted-foreground mx-1">≈</span>}
                          <span className="font-medium">{p.name}</span>
                          <span className="text-muted-foreground"> ({p.manufacturer})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setMergingGroup(group)}
                  >
                    <Merge className="h-3 w-3 mr-1" />
                    Auto Merge
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!mergingGroup} onOpenChange={(o) => !o && setMergingGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Auto-merge duplicate products?</AlertDialogTitle>
            <AlertDialogDescription>
              {mergingGroup && (
                <>
                  The oldest product{" "}
                  <strong>
                    "{mergingGroup.products.find((p) => p.id === suggestPrimary(mergingGroup.products))?.name}"
                  </strong>{" "}
                  will be kept as primary. All inventory, sales, and purchase records from the other{" "}
                  {mergingGroup.products.length - 1} product(s) will be moved to it. This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => mergingGroup && handleAutoMerge(mergingGroup)}
              disabled={merging}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {merging && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Merge Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
