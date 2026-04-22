import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Lock } from "lucide-react";
import { ExpiryMMYYInput } from "@/components/ui/expiry-mmyy-input";

interface PurchaseItem {
  product_id: string;
  product_name: string;
  hsn_code: string;
  batch_number: string;
  quantity: number;
  free_quantity: number;
  unit_price: number;
  gst_percentage: number;
  discount_percentage: number;
  discount_flat: number;
  total_price: number;
  expiry_date: string;
  mrp: number;
  fromChallan?: boolean;
}

interface PurchaseItemsTableProps {
  items: PurchaseItem[];
  discountMode: string;
  maxDiscountAllowed: number;
  hasBatchTracking: boolean;
  onUpdateItem: (index: number, field: keyof PurchaseItem, value: string | number) => void;
  onRemoveItem: (index: number) => void;
  onDiscountExceeded?: (max: number) => void;
}

export function PurchaseItemsTable({
  items,
  discountMode,
  maxDiscountAllowed,
  hasBatchTracking,
  onUpdateItem,
  onRemoveItem,
  onDiscountExceeded,
}: PurchaseItemsTableProps) {
  if (items.length === 0) return null;

  const showDisc = discountMode === "percentage" || discountMode === "both";
  const showFlatDisc = discountMode === "flat" || discountMode === "both";

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="w-[200px]">Product</TableHead>
            {hasBatchTracking && <TableHead className="w-[110px]">Batch</TableHead>}
            <TableHead className="w-[110px]">Expiry (MM/YY)</TableHead>
            <TableHead className="w-[90px]">MRP ₹</TableHead>
            <TableHead className="w-[90px]">Rate ₹</TableHead>
            <TableHead className="w-[70px]">Qty</TableHead>
            <TableHead className="w-[60px]">Free</TableHead>
            {showDisc && <TableHead className="w-[65px]">Disc%</TableHead>}
            {showFlatDisc && <TableHead className="w-[75px]">Disc₹</TableHead>}
            <TableHead className="w-[60px]">GST%</TableHead>
            <TableHead className="w-[90px] text-right">Total</TableHead>
            <TableHead className="w-[40px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow
              key={`${item.product_id}-${index}`}
              className={`${item.fromChallan ? "bg-muted/30" : ""} group`}
              data-billing-row
            >
              <TableCell className="font-medium py-1">
                <div className="flex items-center gap-1">
                  {item.fromChallan && <Lock className="h-3 w-3 text-muted-foreground" />}
                  <span className="text-sm">{item.product_name}</span>
                  {item.fromChallan && <Badge variant="outline" className="text-[10px] py-0">Challan</Badge>}
                </div>
              </TableCell>
              {hasBatchTracking && (
                <TableCell className="py-1">
                  {item.fromChallan ? (
                    <span className="text-xs text-muted-foreground">{item.batch_number || "-"}</span>
                  ) : (
                    <Input
                      value={item.batch_number}
                      onChange={(e) => onUpdateItem(index, "batch_number", e.target.value)}
                      className="w-24 h-7 text-sm"
                      placeholder="Optional"
                    />
                  )}
                </TableCell>
              )}
              <TableCell className="py-1">
                {item.fromChallan ? (
                  <span className="text-xs text-muted-foreground">{item.expiry_date ? item.expiry_date.slice(0, 7) : "-"}</span>
                ) : (
                  <ExpiryMMYYInput
                    value={item.expiry_date}
                    onChange={(iso) => onUpdateItem(index, "expiry_date", iso)}
                  />
                )}
              </TableCell>
              <TableCell className="py-1">
                {item.fromChallan ? (
                  <span className="text-xs">₹{Number(item.mrp).toFixed(2)}</span>
                ) : (
                  <Input
                    type="number" min={0} step={0.01}
                    value={item.mrp || ""}
                    onChange={(e) => onUpdateItem(index, "mrp", parseFloat(e.target.value) || 0)}
                    className="w-20 h-7 text-right text-sm"
                  />
                )}
              </TableCell>
              <TableCell className="py-1">
                {item.fromChallan ? (
                  <span className="text-xs">₹{item.unit_price.toFixed(2)}</span>
                ) : (
                  <Input
                    type="number" min={0} step={0.01}
                    value={item.unit_price}
                    onChange={(e) => onUpdateItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                    className="w-20 h-7 text-right text-sm"
                  />
                )}
              </TableCell>
              <TableCell className="py-1">
                {item.fromChallan ? (
                  <span className="text-xs">{item.quantity}</span>
                ) : (
                  <Input
                    type="number" min={1}
                    value={item.quantity}
                    onChange={(e) => onUpdateItem(index, "quantity", e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                    className="w-14 h-7 text-center text-sm"
                  />
                )}
              </TableCell>
              <TableCell className="py-1">
                {item.fromChallan ? (
                  <span className="text-xs">{item.free_quantity || 0}</span>
                ) : (
                  <Input
                    type="number" min={0}
                    value={item.free_quantity || ""}
                    onChange={(e) => onUpdateItem(index, "free_quantity", e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                    className="w-12 h-7 text-center text-sm"
                  />
                )}
              </TableCell>
              {showDisc && (
                <TableCell className="py-1">
                  {item.fromChallan ? (
                    <span className="text-xs">{item.discount_percentage}%</span>
                  ) : (
                    <Input
                      type="number" min={0} max={maxDiscountAllowed} step={0.1}
                      value={item.discount_percentage}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        if (val > maxDiscountAllowed) { onDiscountExceeded?.(maxDiscountAllowed); return; }
                        onUpdateItem(index, "discount_percentage", val);
                      }}
                      className="w-14 h-7 text-center text-sm"
                    />
                  )}
                </TableCell>
              )}
              {showFlatDisc && (
                <TableCell className="py-1">
                  {item.fromChallan ? (
                    <span className="text-xs">₹{item.discount_flat}</span>
                  ) : (
                    <Input
                      type="number" min={0} step={0.5}
                      value={item.discount_flat || ""}
                      onChange={(e) => onUpdateItem(index, "discount_flat", parseFloat(e.target.value) || 0)}
                      className="w-16 h-7 text-center text-sm"
                    />
                  )}
                </TableCell>
              )}
              <TableCell className="py-1 text-xs text-muted-foreground text-center">
                {item.gst_percentage}%
              </TableCell>
              <TableCell className="py-1 text-right font-mono text-sm font-medium">
                ₹{item.total_price.toFixed(2)}
              </TableCell>
              <TableCell className="py-1">
                {!item.fromChallan && (
                  <Button
                    variant="ghost" size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                    onClick={() => onRemoveItem(index)}
                    data-enter-nav-skip="true"
                    tabIndex={-1}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export type { PurchaseItem };
