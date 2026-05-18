// ARIMA-driven demand forecasting + reorder suggestion engine.
// Pure functions — works fully offline against locally cached rows.

// @ts-ignore — arima ships without types
import ARIMA from "arima";

export interface DemandInput {
  productId: string;
  productName: string;
  manufacturer?: string | null;
  reorderLevel: number;
  currentStock: number;
  supplierId: string | null;
  supplierName: string | null;
  /** Daily sales totals for last N days, oldest first. */
  history: number[];
  leadTimeDays: number;
}

export type DemandState = "SPIKE" | "NORMAL" | "DROP";
export type ForecastMethod = "ARIMA" | "MovingAvg" | "None";

export interface DemandAnalysis {
  productId: string;
  productName: string;
  manufacturer?: string | null;
  supplierId: string | null;
  supplierName: string | null;
  currentStock: number;
  reorderLevel: number;
  leadTimeDays: number;
  avg7: number;
  avg30: number;
  state: DemandState;
  reason: string;
  method: ForecastMethod;
  forecastTotal: number;
  safetyStock: number;
  suggestedQty: number;
}

function movingAverageForecast(history: number[], horizon: number) {
  const recent = history.slice(-7);
  const avg = recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : 0;
  const forecast = Array(horizon).fill(Math.max(0, avg));
  // crude std-error using sample stddev of recent window
  const variance =
    recent.length > 1
      ? recent.reduce((s, v) => s + (v - avg) ** 2, 0) / (recent.length - 1)
      : 0;
  const sd = Math.sqrt(variance);
  return { forecast, stdErrors: Array(horizon).fill(sd), method: "MovingAvg" as ForecastMethod };
}

function arimaForecast(history: number[], horizon: number) {
  const nonZero = history.filter((v) => v > 0).length;
  if (history.length < 14 || nonZero < 4) return movingAverageForecast(history, horizon);
  try {
    const arima = new ARIMA({ p: 1, d: 1, q: 1, verbose: false }).train(history);
    const [pred, errors] = arima.predict(horizon);
    return {
      forecast: (pred as number[]).map((v) => Math.max(0, v)),
      stdErrors: (errors as number[]).map((e) => Math.sqrt(Math.max(0, e))),
      method: "ARIMA" as ForecastMethod,
    };
  } catch {
    return movingAverageForecast(history, horizon);
  }
}

export function analyseDemand(input: DemandInput): DemandAnalysis {
  const { history, leadTimeDays } = input;
  const last7 = history.slice(-7);
  const last30 = history.slice(-30);
  const avg7 = last7.length ? last7.reduce((s, v) => s + v, 0) / 7 : 0;
  const avg30 = last30.length ? last30.reduce((s, v) => s + v, 0) / 30 : 0;

  let state: DemandState = "NORMAL";
  let reason = "Demand within normal range";
  if (avg30 > 0 && avg7 > 1.3 * avg30) {
    state = "SPIKE";
    reason = "High demand last 7 days";
  } else if (avg30 > 0 && avg7 < 0.7 * avg30) {
    state = "DROP";
    reason = "Demand declining last 7 days";
  } else if (avg30 === 0 && avg7 === 0) {
    reason = "No recent sales";
  }

  const horizon = Math.max(1, leadTimeDays);
  const { forecast, stdErrors, method } =
    history.length === 0
      ? { forecast: [], stdErrors: [], method: "None" as ForecastMethod }
      : arimaForecast(history, horizon);

  const forecastTotal = forecast.reduce((s, v) => s + v, 0);
  // 95% service level safety stock — 1.65σ over the horizon
  const horizonVariance = stdErrors.reduce((s, e) => s + e * e, 0);
  const safetyStock = 1.65 * Math.sqrt(horizonVariance);

  const required = forecastTotal + safetyStock;
  const suggestedQty = Math.max(0, Math.round(required - input.currentStock));

  return {
    productId: input.productId,
    productName: input.productName,
    manufacturer: input.manufacturer ?? null,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    currentStock: input.currentStock,
    reorderLevel: input.reorderLevel,
    leadTimeDays,
    avg7,
    avg30,
    state,
    reason,
    method,
    forecastTotal: Math.round(forecastTotal * 100) / 100,
    safetyStock: Math.round(safetyStock * 100) / 100,
    suggestedQty,
  };
}

/** Build a daily sales-history array for the past `days` days, ending today. */
export function buildHistory(
  saleDates: string[], // ISO yyyy-mm-dd strings (one per quantity unit summed)
  quantities: number[],
  days: number,
): number[] {
  const out = Array(days).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < saleDates.length; i++) {
    const d = new Date(saleDates[i]);
    d.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
    const idx = days - 1 - diff;
    if (idx >= 0 && idx < days) out[idx] += quantities[i] || 0;
  }
  return out;
}
