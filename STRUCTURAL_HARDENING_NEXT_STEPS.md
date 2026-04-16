# Structural Hardening Next Steps

This document captures the next refactor step to move edit-time inventory reconciliation to backend transactional execution.

## Problem

`EditSaleDialog` and `EditPurchaseOrderDialog` currently perform multi-step client-side mutations. Network interruptions can leave partial updates and make error recovery harder.

## Target

Move edit save operations to RPC/edge handlers that execute all steps atomically:

- validate input
- calculate inventory delta
- update line items
- update inventory batches
- update order header
- commit/rollback as one transaction

## Proposed Backend Contracts

### 1) `update_sales_order_with_inventory_delta`

Input:
- `sales_order_id`
- `updated_items[]`
- `deleted_item_ids[]`
- `header_payload`

Behavior:
- locks relevant rows
- applies item changes
- adjusts inventory
- returns summary (`stock_delta`, `line_count`, `total_amount`)

### 2) `update_purchase_order_with_inventory_delta`

Input:
- `purchase_order_id`
- `updated_items[]`
- `deleted_item_ids[]`
- `new_items[]`
- `header_payload`

Behavior:
- applies item upserts/deletes
- adjusts inventory for deleted/changed/new lines
- updates PO header
- returns summary (`stock_delta`, `line_count`, `total_amount`)

## Frontend Migration Plan

1. Replace dialog save loops with one mutation call each.
2. Keep existing impact preview UI.
3. Surface returned summary in success toast.
4. Invalidate related queries exactly once per successful transaction.

## Shared Composer Refactor Direction

Create shared helpers for:
- payment and receive status summaries (`src/utils/transactionUx.ts`)
- reusable history filter state persistence
- common billing toolbar actions (search/filter shortcuts)

This reduces drift between `Sales` and `Purchase Orders` while preserving module-specific behavior.
