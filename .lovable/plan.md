
# Billing Facility for Sales & Purchase Orders

## What Will Be Added

Both the Sales Orders list and Purchase Orders list currently show order rows but have no way to print or download the bill/invoice for a saved order. This plan adds a full billing dropdown to every row in both tables.

---

## Current State

- `src/utils/billGenerator.ts` already has `printBill`, `downloadBillPDF`, `downloadBillHTML`, `downloadBillCSV` functions supporting both `"sale"` and `"purchase"` types.
- **Sales Orders table**: Each row only has an Edit (admin-only) button. No bill generation.
- **Purchase Orders table**: Each row has Receive, Status, Convert, and Linked Challans buttons. No bill generation.

---

## Changes Required

### 1. `src/pages/Sales.tsx`

**Add a "Bill" dropdown button to every row** in the sales orders table.

When clicked, it will:
1. Fetch the order's items from `sales_order_items` joined with `products` and `inventory_batches` (for batch number and HSN code).
2. Build a `BillData` object.
3. Call the selected action: Print, PDF, HTML download, or CSV download.

Implementation details:
- Add state `billLoadingId: string | null` to show a loading spinner on the row being processed.
- Add a helper async function `handleBillAction(orderId, action)` that fetches items and triggers the bill utility.
- Add a `DropdownMenu` button (already imported) with 4 options: Print, Download PDF, Download HTML, Download CSV — to each row in the table.
- The bill will use the order's `customer_name`, `customer_phone`, `customer_address`, `payment_method`, `sale_date`, `invoice_number`, and all financial totals.

### 2. `src/pages/PurchaseOrders.tsx`

**Add a "Bill" dropdown button to every row** in the purchase orders table.

When clicked, it will:
1. Fetch the order's items from `purchase_order_items` joined with `products` (for HSN code and name).
2. Build a `BillData` object with supplier name and order details.
3. Call the selected action.

Implementation details:
- Add state `billLoadingId: string | null`.
- Add a helper async function `handleBillAction(order, action)` — takes the full order object so it has supplier name, order number, challan/invoice number, etc.
- Add missing imports: `printBill`, `downloadBillHTML`, `downloadBillCSV`, `downloadBillPDF`, `BillData` from `billGenerator`, plus `DropdownMenu` components and `Printer`, `FileText`, `FileSpreadsheet`, `Download` icons from `lucide-react`.
- Add a `DropdownMenu` bill button to each row in the table.

---

## Data Fetching Strategy

For both pages, bill generation is triggered **on-demand** (when user clicks the bill action), not pre-loaded. This avoids fetching items for all orders upfront, keeping the page fast even with 300+ orders.

The fetch for purchase order items will join with products:
```sql
purchase_order_items joined with products (name, hsn_code, gst_percentage)
```

The fetch for sales order items will join with:
```sql
sales_order_items joined with products (name, hsn_code), inventory_batches (batch_number)
```

---

## Technical Details

### Sales Bill Data Structure
```text
BillData {
  type: "sale",
  invoice_number: order.invoice_number,
  date: order.sale_date,
  customer_name: order.customer_name,
  customer_phone: order.customer_phone,
  customer_address: order.customer_address,
  payment_method: order.payment_method,
  items: [{ product_name, batch_number, hsn_code, quantity, unit_price, gst_percentage, discount_percentage, total_price }],
  subtotal: calculated,
  gst_amount: order.gst_amount,
  discount_amount: order.discount_amount,
  freight_charges: order.freight_charges,
  handling_charges: order.handling_charges,
  delivery_charges: order.delivery_charges,
  other_charges: order.other_charges,
  total_amount: order.total_amount
}
```

### Purchase Bill Data Structure
```text
BillData {
  type: "purchase",
  invoice_number: order.invoice_number || order.challan_number || order.order_number,
  date: order.order_date,
  supplier_name: order.suppliers.name,
  items: [{ product_name, batch_number: "-", hsn_code, quantity, unit_price, gst_percentage, discount_percentage, total_price }],
  subtotal: calculated,
  gst_amount: order.gst_amount,
  discount_amount: order.discount_amount,
  freight_charges: order.freight_charges,
  handling_charges: order.handling_charges,
  other_charges: order.other_charges,
  total_amount: order.total_amount
}
```

---

## Files to Edit

| File | Change |
|---|---|
| `src/pages/Sales.tsx` | Add bill dropdown with 4 actions to each row |
| `src/pages/PurchaseOrders.tsx` | Add bill dropdown with 4 actions to each row + missing imports |

No database changes, no new files needed — the existing bill generator utility handles everything.
