/**
 * Concrete repos for PR 2 — local-first reads for Customers / Products / Suppliers.
 * Writes still go through Supabase directly until PR 3 migrates mutations.
 */
import { BaseRepo } from "./baseRepo";
import type { CustomerRow, ProductRow, SupplierRow } from "../db";

export const customerRepo = new BaseRepo<CustomerRow>("customers");
export const productRepo  = new BaseRepo<ProductRow>("products");
export const supplierRepo = new BaseRepo<SupplierRow>("suppliers");
