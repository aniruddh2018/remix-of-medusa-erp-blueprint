import type { Tables } from "@/integrations/supabase/types";

type InventoryBatch = Tables<"inventory_batches">;

export interface BatchAllocation {
  batch_id: string;
  batch_number: string;
  quantity: number;
  available_quantity: number;
  expiry_date: string;
  mrp: number;
  purchase_price: number;
}

export interface AllocationResult {
  success: boolean;
  allocations: BatchAllocation[];
  totalAllocated: number;
  shortfall: number;
  message?: string;
}

/**
 * FIFO (First Expiry First Out) batch allocation
 * Allocates requested quantity across batches starting with nearest expiry date
 * 
 * @param batches - Available inventory batches sorted by expiry (ascending)
 * @param requestedQuantity - Total quantity needed
 * @param existingCartQuantities - Map of batch_id to already-allocated quantity in cart
 * @returns AllocationResult with batch allocations or error message
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
      message: "Quantity must be greater than 0"
    };
  }

  // Sort batches by expiry date (nearest first) - FIFO
  const sortedBatches = [...batches].sort((a, b) => 
    new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
  );

  // Filter out expired batches and batches with no stock
  const today = new Date().toISOString().split('T')[0];
  const validBatches = sortedBatches.filter(batch => 
    batch.expiry_date > today && batch.quantity > 0
  );

  // Calculate total available stock (minus what's already in cart)
  const totalAvailable = validBatches.reduce((sum, batch) => {
    const cartQty = existingCartQuantities.get(batch.id) || 0;
    return sum + Math.max(0, batch.quantity - cartQty);
  }, 0);

  if (totalAvailable < requestedQuantity) {
    return {
      success: false,
      allocations: [],
      totalAllocated: 0,
      shortfall: requestedQuantity - totalAvailable,
      message: `Insufficient stock. Only ${totalAvailable} units available.`
    };
  }

  // Allocate quantity across batches (FIFO)
  const allocations: BatchAllocation[] = [];
  let remainingQuantity = requestedQuantity;

  for (const batch of validBatches) {
    if (remainingQuantity <= 0) break;

    const cartQty = existingCartQuantities.get(batch.id) || 0;
    const availableInBatch = batch.quantity - cartQty;
    
    if (availableInBatch <= 0) continue;

    const allocateQty = Math.min(remainingQuantity, availableInBatch);
    
    allocations.push({
      batch_id: batch.id,
      batch_number: batch.batch_number,
      quantity: allocateQty,
      available_quantity: batch.quantity,
      expiry_date: batch.expiry_date,
      mrp: Number(batch.mrp),
      purchase_price: Number(batch.purchase_price)
    });

    remainingQuantity -= allocateQty;
  }

  return {
    success: true,
    allocations,
    totalAllocated: requestedQuantity - remainingQuantity,
    shortfall: 0
  };
}

/**
 * Get total available stock for a product across all valid batches
 */
export function getTotalAvailableStock(
  batches: InventoryBatch[],
  existingCartQuantities: Map<string, number> = new Map()
): number {
  const today = new Date().toISOString().split('T')[0];
  
  return batches
    .filter(batch => batch.expiry_date > today && batch.quantity > 0)
    .reduce((sum, batch) => {
      const cartQty = existingCartQuantities.get(batch.id) || 0;
      return sum + Math.max(0, batch.quantity - cartQty);
    }, 0);
}
