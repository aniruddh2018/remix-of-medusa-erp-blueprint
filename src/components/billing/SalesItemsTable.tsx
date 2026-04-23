import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Clock, AlertTriangle, Undo2 } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import type { FullInvoiceSettings } from "@/hooks/useInvoiceSettings";

interface CartItem {
  product_id: string;
  batch_id: string;
  product_name: string;
  batch_number: string;
  hsn_code: string;
  quantity: number;
  free_quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  discount_flat: number;
  total_price: number;
  max_quantity: number;
  expiry_date: string;
  /** When true, this line is a customer return (refund) — restores inventory and subtracts from total */
  is_return?: boolean;
  /** Unit the line was billed in (e.g. "strip"). If absent, falls back to base unit. */
  sold_unit?: string;
  /** Base-unit equivalent of `quantity + free_quantity` (e.g. 2 strips × 10 = 20 tablets) */
  base_quantity?: number;
  /** Product's base unit, for the "(20 tab)" hint */
  base_unit?: string;
}

interface SalesItemsTableProps {
  cart: CartItem[];
  settings: FullInvoiceSettings;
  maxDiscountAllowed: number;
  gstInclusive: boolean;
  onUpdateItem: (index: number, field: keyof CartItem, value: string | number) => void;
  onRemoveItem: (index: number) => void;
}

export function SalesItemsTable({
  cart,
  settings,
  maxDiscountAllowed,
  gstInclusive,
  onUpdateItem,
  onRemoveItem,
}: SalesItemsTableProps) {
  if (cart.length === 0) return null;

  const showDisc = settings.discount_mode === "percentage" || settings.discount_mode === "both";
  const showFlatDisc = settings.discount_mode === "flat" || settings.discount_mode === "both";

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="w-[200px]">Product</TableHead>
            {settings.show_batch_column && <TableHead className="w-[100px]">Batch</TableHead>}
            {settings.show_expiry_column && <TableHead className="w-[90px]">Expiry</TableHead>}
            <TableHead className="w-[90px]">Rate ₹</TableHead>
            <TableHead className="w-[70px]">Qty</TableHead>
            {settings.show_free_qty_column && <TableHead className="w-[60px]">Free</TableHead>}
            {showDisc && <TableHead className="w-[65px]">Disc%</TableHead>}
            {showFlatDisc && <TableHead className="w-[75px]">Disc₹</TableHead>}
            <TableHead className="w-[60px]">GST%</TableHead>
            <TableHead className="w-[90px] text-right">Total</TableHead>
            <TableHead className="w-[40px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cart.map((item, index) => {
            const totalNeeded = item.quantity + (item.free_quantity || 0);
            const isInsufficient = item.max_quantity > 0 && totalNeeded > item.max_quantity;
            const isNoStock = !item.batch_id;
            const daysUntilExpiry = differenceInDays(new Date(item.expiry_date), new Date());
            const isNearExpiry = daysUntilExpiry <= 60;
            const isVeryNearExpiry = daysUntilExpiry <= 30;

            return (
              <TableRow
                key={`${item.batch_id}-${index}`}
                className={`${isInsufficient || isNoStock ? "bg-destructive/10" : ""} ${item.is_return ? "bg-secondary/60 border-l-2 border-l-destructive" : ""} group`}
                data-billing-row
              >
                <TableCell className="font-medium py-1">
                  {item.is_return && (
                    <Badge variant="destructive" className="mr-1 text-[10px] py-0 gap-0.5">
                      <Undo2 className="h-2.5 w-2.5" /> RETURN
                    </Badge>
                  )}
                  <span className="text-sm">{item.product_name}</span>
                  {item.sold_unit && item.base_unit && item.sold_unit.toLowerCase() !== item.base_unit.toLowerCase() && (
                    <Badge variant="outline" className="ml-1 text-[10px] py-0 capitalize">
                      {item.sold_unit}
                      {item.base_quantity ? ` · ${item.base_quantity} ${item.base_unit}` : ""}
                    </Badge>
                  )}
                  {!item.is_return && isNoStock && <Badge variant="destructive" className="ml-1 text-[10px] py-0">No Stock</Badge>}
                  {!item.is_return && isInsufficient && !isNoStock && <Badge variant="destructive" className="ml-1 text-[10px] py-0">{totalNeeded}/{item.max_quantity}</Badge>}
                </TableCell>
                {settings.show_batch_column && (
                  <TableCell className="py-1 text-xs text-muted-foreground">{item.batch_number}</TableCell>
                )}
                {settings.show_expiry_column && (
                  <TableCell className="py-1">
                    <Badge
                      variant={isVeryNearExpiry ? "destructive" : isNearExpiry ? "secondary" : "outline"}
                      className={`text-[10px] py-0 gap-0.5 ${isNearExpiry ? "animate-pulse" : ""}`}
                    >
                      {isNearExpiry && <Clock className="h-2.5 w-2.5" />}
                      {format(new Date(item.expiry_date), "MM/yy")}
                    </Badge>
                  </TableCell>
                )}
                <TableCell className="py-1">
                  <Input
                    type="number" min={0} step={0.01}
                    value={item.unit_price}
                    onChange={(e) => onUpdateItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                    className="w-20 h-7 text-right text-sm"
                  />
                </TableCell>
                <TableCell className="py-1">
                  <Input
                    type="number" min={1} max={item.max_quantity}
                    value={item.quantity}
                    onChange={(e) => onUpdateItem(index, "quantity", e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                    className="w-14 h-7 text-center text-sm"
                  />
                </TableCell>
                {settings.show_free_qty_column && (
                  <TableCell className="py-1">
                    <Input
                      type="number" min={0}
                      value={item.free_quantity || 0}
                      onChange={(e) => onUpdateItem(index, "free_quantity", e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                      className="w-12 h-7 text-center text-sm"
                    />
                  </TableCell>
                )}
                {showDisc && (
                  <TableCell className="py-1">
                    <Input
                      type="number" min={0} max={maxDiscountAllowed} step={0.1}
                      value={item.discount_percentage}
                      onChange={(e) => onUpdateItem(index, "discount_percentage", Math.min(parseFloat(e.target.value) || 0, maxDiscountAllowed))}
                      className="w-14 h-7 text-center text-sm"
                    />
                  </TableCell>
                )}
                {showFlatDisc && (
                  <TableCell className="py-1">
                    <Input
                      type="number" min={0} step={0.5}
                      value={item.discount_flat || ""}
                      onChange={(e) => onUpdateItem(index, "discount_flat", parseFloat(e.target.value) || 0)}
                      className="w-16 h-7 text-center text-sm"
                    />
                  </TableCell>
                )}
                <TableCell className="py-1 text-xs text-muted-foreground text-center">
                  {item.gst_percentage}%
                </TableCell>
                <TableCell className={`py-1 text-right font-mono text-sm font-medium ${item.is_return ? "text-destructive" : ""}`}>
                  {item.is_return ? "−" : ""}₹{Math.abs(item.total_price).toFixed(2)}
                </TableCell>
                <TableCell className="py-1">
                  <Button
                    variant="ghost" size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                    onClick={() => onRemoveItem(index)}
                    data-enter-nav-skip="true"
                    tabIndex={-1}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export type { CartItem };
