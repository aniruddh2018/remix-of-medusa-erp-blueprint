import { importMargPurchases, type PurchaseImportOptions, type PurchaseImportResult } from "./margPurchaseImport";
import { splitPurchaseBills, type ParsedPurchaseBill } from "./margPurchaseParse";

export type RunnerPhase = "idle" | "importing" | "done" | "error";

export interface RunnerState {
  phase: RunnerPhase;
  done: number;
  total: number;
  label: string;
  result: PurchaseImportResult | null;
  error: string | null;
}

let state: RunnerState = {
  phase: "idle",
  done: 0,
  total: 0,
  label: "",
  result: null,
  error: null,
};

const listeners = new Set<(s: RunnerState) => void>();

function emit() {
  const snapshot = { ...state };
  listeners.forEach((l) => l(snapshot));
}

export function getMargImportState(): RunnerState {
  return { ...state };
}

export function subscribeMargImport(callback: (s: RunnerState) => void): () => void {
  listeners.add(callback);
  callback({ ...state });
  return () => listeners.delete(callback);
}

export function isMargImportRunning(): boolean {
  return state.phase === "importing";
}

export function resetMargImport(): void {
  state = {
    phase: "idle",
    done: 0,
    total: 0,
    label: "",
    result: null,
    error: null,
  };
  emit();
}

export async function runMargImport(
  originalBills: ParsedPurchaseBill[],
  invoicesBills: ParsedPurchaseBill[],
  options: PurchaseImportOptions,
): Promise<void> {
  if (state.phase === "importing") {
    throw new Error("Import already running");
  }

  state = {
    phase: "importing",
    done: 0,
    total: 0,
    label: "",
    result: null,
    error: null,
  };
  emit();

  try {
    const split = splitPurchaseBills(originalBills, invoicesBills);
    const total = split.invoices.length + split.challans.length;
    state.total = total;
    emit();

    const merged: PurchaseImportResult = {
      totalBills: 0,
      billsInserted: 0,
      billsSkippedDuplicate: 0,
      billsFailed: 0,
      itemsInserted: 0,
      itemsSkippedNoProduct: 0,
      suppliersCreated: 0,
      batchesCreated: 0,
      batchesUpdated: 0,
      conversionsInserted: 0,
      unmatchedProducts: [],
      errors: [],
    };

    const importSet = async (
      bills: ParsedPurchaseBill[],
      isChallan: boolean,
      baseDone: number,
    ): Promise<number> => {
      if (bills.length === 0) return baseDone;
      const label = isChallan ? "Challans" : "Invoices";
      state.label = label;
      state.done = baseDone;
      emit();

      const r = await importMargPurchases(
        bills,
        { ...options, isChallan },
        (done, _total) => {
          state.done = baseDone + done;
          emit();
        },
      );

      merged.totalBills += r.totalBills;
      merged.billsInserted += r.billsInserted;
      merged.billsSkippedDuplicate += r.billsSkippedDuplicate;
      merged.billsFailed += r.billsFailed;
      merged.itemsInserted += r.itemsInserted;
      merged.itemsSkippedNoProduct += r.itemsSkippedNoProduct;
      merged.suppliersCreated += r.suppliersCreated;
      merged.batchesCreated += r.batchesCreated;
      merged.batchesUpdated += r.batchesUpdated;
      merged.conversionsInserted += r.conversionsInserted;
      merged.unmatchedProducts.push(...r.unmatchedProducts);
      merged.errors.push(...r.errors);

      return baseDone + bills.length;
    };

    let baseDone = 0;
    baseDone = await importSet(split.invoices, false, baseDone);
    baseDone = await importSet(split.challans, true, baseDone);

    state = {
      ...state,
      phase: "done",
      result: merged,
      error: null,
      label: "",
      done: baseDone,
    };
    emit();
  } catch (e) {
    state = {
      ...state,
      phase: "error",
      error: e instanceof Error ? e.message : String(e),
      label: "",
    };
    emit();
  }
}
