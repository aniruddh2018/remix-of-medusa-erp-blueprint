import type { Tables } from "@/integrations/supabase/types";

type InventoryBatch = Tables<"inventory_batches">;

export interface BatchAllocation {
  batch_id: string;
  batch_number: string;
  /** Quantity in BASE units (tablets, ml, etc.) allocated from this batch */
  quantity: number;
  /** Available BASE units in batch = quantity*pack_size + loose_quantity */
  available_quantity: number;
  expiry_date: string;
  mrp: number;
  purchase_price: number;
  /** Pack size for this batch (e.g. 10 tablets/strip), or null if not packed */
  pack_size: number | null;
}

export interface AllocationResult {
  success: boolean;
  allocations: BatchAllocation[];
  totalAllocated: number;
  shortfall: number;
  message?: string;
}

/**
 * Compute available BASE units for a batch:
 *   sealed_packs * pack_size + loose_units
 * If pack_size is null/0, treat sealed quantity as base 1:1.
 */
function batchBaseAvailable(b: InventoryBatch): number {
  const pack = b.pack_size && b.pack_size > 0 ? b.pack_size : 1;
  return (b.quantity || 0) * pack + (b.loose_quantity || 0);
}

/**
 * FIFO (First Expiry First Out) batch allocation — BASE-UNIT aware.
 * `requestedQuantity` is always in base units (e.g. tablets). The caller is
 * responsible for converting "2 strips" → "20 tablets" before invoking.
 *
 * @param batches - Available inventory batches
 * @param requestedQuantity - Total quantity needed in BASE units
 * @param existingCartQuantities - Map of batch_id → already-allocated BASE units in cart
 */
export function allocateBatchesFIFO(
  batches: InventoryBatch[],
  requestedQuantity: number,
  existingCartQuantities: Map<string, number> = new Map()
): AllocationResult {
  if (requestedQuantity <= 0) {
    return {
      success: false,
      allocations: [],
      totalAllocated: 0,
      shortfall: requestedQuantity,
      message: "Quantity must be greater than 0",
    };
  }

  // Sort: nearest expiry first; null expiry last.
  const sortedBatches = [...batches].sort((a, b) => {
    if (!a.expiry_date && !b.expiry_date) return 0;
    if (!a.expiry_date) return 1;
    if (!b.expiry_date) return -1;
    return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
  });

  // Filter expired and zero-stock batches.
  const today = new Date().toISOString().split("T")[0];
  const validBatches = sortedBatches.filter(
    (b) => (b.expiry_date === null || b.expiry_date > today) && batchBaseAvailable(b) > 0
  );

  // Total available in BASE units across all batches.
  const totalAvailable = validBatches.reduce((sum, b) => {
    const cartQty = existingCartQuantities.get(b.id) || 0;
    return sum + Math.max(0, batchBaseAvailable(b) - cartQty);
  }, 0);

  if (totalAvailable < requestedQuantity) {
    return {
      success: false,
      allocations: [],
      totalAllocated: 0,
      shortfall: requestedQuantity - totalAvailable,
      message: `Insufficient stock. Only ${totalAvailable} units available.`,
    };
  }

  const allocations: BatchAllocation[] = [];
  let remaining = requestedQuantity;

  for (const b of validBatches) {
    if (remaining <= 0) break;

    const cartQty = existingCartQuantities.get(b.id) || 0;
    const availableInBatch = batchBaseAvailable(b) - cartQty;
    if (availableInBatch <= 0) continue;

    const allocateQty = Math.min(remaining, availableInBatch);
    allocations.push({
      batch_id: b.id,
      batch_number: b.batch_number,
      quantity: allocateQty,
      available_quantity: batchBaseAvailable(b),
      expiry_date: b.expiry_date,
      mrp: Number(b.mrp),
      purchase_price: Number(b.purchase_price),
      pack_size: b.pack_size,
    });

    remaining -= allocateQty;
  }

  return {
    success: true,
    allocations,
    totalAllocated: requestedQuantity - remaining,
    shortfall: 0,
  };
}

/**
 * Total available BASE-unit stock across non-expired batches, excluding cart reservations.
 */
export function getTotalAvailableStock(
  batches: InventoryBatch[],
  existingCartQuantities: Map<string, number> = new Map()
): number {
  const today = new Date().toISOString().split("T")[0];
  return batches
    .filter((b) => (b.expiry_date === null || b.expiry_date > today) && batchBaseAvailable(b) > 0)
    .reduce((sum, b) => {
      const cartQty = existingCartQuantities.get(b.id) || 0;
      return sum + Math.max(0, batchBaseAvailable(b) - cartQty);
    }, 0);
}
