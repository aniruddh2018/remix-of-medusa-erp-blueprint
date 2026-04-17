

The user is asking how to use the disposal feature I just built. This is a "how-to" question, not an implementation request — so I'll answer directly without a plan.

## How to Dispose Expired Stock

The disposal flow lives on the **Expiry Tracking** page (left sidebar → "Expiry"). Here's the step-by-step:

### 1. Navigate to Expiry page
Open the sidebar and click **Expiry**. You'll land on the **Batches** tab by default.

### 2. Find expired stock
- Use the filter dropdown (top right of the table) and select **"Expired"** to show only expired batches.
- Or leave it on "Within 90 days" and look for rows with the red **"Expired"** badge.
- The "Days" column will show e.g. `45d ago` in red for expired items.

### 3. Click "Dispose"
- Only expired rows show a red **Dispose** button (with trash icon) in the rightmost "Action" column.
- Non-expired rows just show a "—" dash (you cannot dispose stock that hasn't expired).

### 4. Confirm disposal in dialog
A confirmation dialog opens showing:
- Product name + batch number
- Available quantity + expiry date
- A warning that this is irreversible
- A **"Quantity to dispose"** input (defaults to full batch qty — you can reduce it for partial disposal)

Click **Confirm Disposal** (red button).

### 5. What happens behind the scenes
- Stock is reduced from `inventory_batches` (so it disappears from sellable inventory).
- A negative entry is logged in `inventory_transactions` with type `expiry_loss`, valued at the batch's purchase price.
- This is irreversible (regulatory record).

### 6. View loss reports
Switch to the **Loss Summary** tab on the same page to see:
- Each product's total disposed quantity
- Cumulative cost-value loss per product
- Grand total loss (also shown as a red tile at the top: "Expiry Loss (cost)")

### Common confusion
- **"I don't see a Dispose button"** → The batch isn't expired yet. Only items past their expiry date can be disposed.
- **"Can I undo?"** → No. The ledger entry is permanent for compliance.
- **Sales of expired stock** are already blocked separately by the `block_expired_sales` setting + per-product `expiry_required` flag.

