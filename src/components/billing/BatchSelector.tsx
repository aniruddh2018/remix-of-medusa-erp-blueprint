import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Layers, Check, AlertTriangle } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

type InventoryBatch = Tables<"inventory_batches">;

interface BatchSelectorProps {
  batches: InventoryBatch[];
  selectedBatchId: string | null;
  existingCartQuantities: Map<string, number>;
  onSelect: (batchId: string | null) => void;
  disabled?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
}

export interface BatchSelectorHandle {
  focus: () => void;
}

/**
 * Optional batch picker. When no batch is chosen, sale uses FEFO (default).
 * Batches sorted by earliest expiry (FEFO), expired ones flagged.
 */
export const BatchSelector = forwardRef<BatchSelectorHandle, BatchSelectorProps>(function BatchSelector({
  batches,
  selectedBatchId,
  existingCartQuantities,
  onSelect,
  disabled,
  onKeyDown,
}, ref) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const sorted = useMemo(() => {
    return [...batches].sort((a, b) => {
      if (!a.expiry_date && !b.expiry_date) return 0;
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
    });
  }, [batches]);

  const selected = sorted.find(b => b.id === selectedBatchId);
  const today = new Date();

  useImperativeHandle(ref, () => ({
    focus: () => triggerRef.current?.focus(),
  }));

  if (batches.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant={selected ? "secondary" : "outline"}
          size="sm"
          className="h-9 gap-1 text-xs"
          disabled={disabled}
          data-field-value={selected ? selected.batch_number : "FEFO"}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === " ") {
              event.preventDefault();
              setOpen(true);
              return;
            }
            onKeyDown?.(event);
          }}
          title="Pick a specific batch (default: FEFO)"
        >
          <Layers className="h-3.5 w-3.5" />
          {selected ? selected.batch_number : "FEFO"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-2 border-b text-xs font-medium text-muted-foreground">
          Choose batch ({sorted.length})
        </div>
        <div className="max-h-72 overflow-y-auto">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted text-left text-sm border-b"
            onClick={() => { onSelect(null); setOpen(false); }}
          >
            <span className="flex items-center gap-2">
              {!selectedBatchId && <Check className="h-3.5 w-3.5" />}
              <span className="font-medium">Auto (FEFO)</span>
            </span>
            <span className="text-xs text-muted-foreground">Default</span>
          </button>
          {sorted.map(b => {
            const cartQty = existingCartQuantities.get(b.id) || 0;
            const available = Math.max(0, b.quantity - cartQty);
            const days = b.expiry_date ? differenceInDays(new Date(b.expiry_date), today) : null;
            const expired = days !== null && days < 0;
            const nearExpiry = days !== null && days <= 30 && days >= 0;
            return (
              <button
                key={b.id}
                type="button"
                disabled={available <= 0}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted text-left text-sm border-b disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => { onSelect(b.id); setOpen(false); }}
              >
                <span className="flex items-center gap-2 min-w-0 flex-1">
                  {selectedBatchId === b.id && <Check className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">
                    <span className="font-medium">{b.batch_number}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ₹{Number(b.mrp).toFixed(2)}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {b.expiry_date && (
                    <Badge
                      variant={expired ? "destructive" : nearExpiry ? "secondary" : "outline"}
                      className="text-[10px] py-0 gap-0.5"
                    >
                      {expired && <AlertTriangle className="h-2.5 w-2.5" />}
                      {format(new Date(b.expiry_date), "MM/yy")}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] py-0">
                    {available}
                  </Badge>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
});

BatchSelector.displayName = "BatchSelector";
