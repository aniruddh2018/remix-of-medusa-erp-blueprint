import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FullInvoiceSettings } from "@/hooks/useInvoiceSettings";

interface BillingTotalsProps {
  grossTotal: number;
  itemDiscount: number;
  subtotal: number;
  gstAmount: number;
  totalCharges: number;
  billDiscountAmount: number;
  grandTotal: number;
  gstInclusive: boolean;
  settings: FullInvoiceSettings;
  maxDiscountAllowed: number;
  billDiscountPercent: number;
  billDiscountFlat: number;
  onBillDiscountPercentChange: (v: number) => void;
  onBillDiscountFlatChange: (v: number) => void;
  gstSlabs?: Array<{ rate: number; taxable: number; gst: number }>;
}

export function BillingTotals({
  grossTotal,
  itemDiscount,
  subtotal,
  gstAmount,
  totalCharges,
  billDiscountAmount,
  grandTotal,
  gstInclusive,
  settings,
  maxDiscountAllowed,
  billDiscountPercent,
  billDiscountFlat,
  onBillDiscountPercentChange,
  onBillDiscountFlatChange,
  gstSlabs,
}: BillingTotalsProps) {
  const totalDiscount = itemDiscount + billDiscountAmount;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-1.5 text-sm">
      {settings.show_discount_row && itemDiscount > 0 && (
        <>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Gross Total</span>
            <span>₹{grossTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-primary">
            <span>Item Discount</span>
            <span>-₹{itemDiscount.toFixed(2)}</span>
          </div>
        </>
      )}
      <div className="flex justify-between">
        <span className="text-muted-foreground">{gstInclusive ? "Net (GST Incl.)" : "Subtotal"}</span>
        <span>₹{subtotal.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-muted-foreground text-xs">
        <span>{gstInclusive ? "Incl. GST" : "GST"}{settings.show_gst_split ? " (CGST + SGST)" : ""}</span>
        <span>₹{gstAmount.toFixed(2)}</span>
      </div>
      {!!gstSlabs?.length && (
        <div className="space-y-1 text-[11px]">
          {gstSlabs.map((slab) => (
            <div key={slab.rate} className="flex justify-between text-muted-foreground">
              <span>{slab.rate}% on ₹{slab.taxable.toFixed(2)}</span>
              <span>₹{slab.gst.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {totalCharges > 0 && (
        <div className="flex justify-between text-muted-foreground">
          <span>Other Charges</span>
          <span>₹{totalCharges.toFixed(2)}</span>
        </div>
      )}
      {billDiscountAmount > 0 && (
        <div className="flex justify-between text-primary font-medium">
          <span>Bill Discount</span>
          <span>-₹{billDiscountAmount.toFixed(2)}</span>
        </div>
      )}
      <Separator className="my-1" />
      <div className="flex justify-between font-bold text-lg">
        <span>Grand Total</span>
        <span className="text-primary">₹{grandTotal.toFixed(2)}</span>
      </div>
      {totalDiscount > 0 && (
        <div className="text-[11px] text-primary text-right">
          Saved ₹{totalDiscount.toFixed(2)}
        </div>
      )}

      {/* Bill-level discount */}
      {settings.enable_bill_discount && (
        <div className="pt-2 border-t border-border mt-2">
          <Label className="text-[11px] text-muted-foreground mb-1 block">Bill Discount</Label>
          <div className="flex gap-2">
            {(settings.bill_discount_mode === "percentage" || settings.bill_discount_mode === "both") && (
              <Input
                type="number" min={0} max={maxDiscountAllowed} step={0.1}
                value={billDiscountPercent || ""}
                onChange={(e) => onBillDiscountPercentChange(Math.min(parseFloat(e.target.value) || 0, maxDiscountAllowed))}
                className="h-7 text-sm"
                placeholder="% disc"
              />
            )}
            {(settings.bill_discount_mode === "flat" || settings.bill_discount_mode === "both") && (
              <Input
                type="number" min={0} step={1}
                value={billDiscountFlat || ""}
                onChange={(e) => onBillDiscountFlatChange(parseFloat(e.target.value) || 0)}
                className="h-7 text-sm"
                placeholder="₹ disc"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
