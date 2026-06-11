import type { GSTPeriod } from "./types";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function monthlyPeriod(year: number, month: number): GSTPeriod {
  const m = String(month).padStart(2, "0");
  const from = `${year}-${m}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${m}-${String(lastDay).padStart(2, "0")}`;
  return {
    from, to,
    label: `${MONTHS[month - 1]} ${year}`,
    fpLabel: `${m}${year}`,
    year, month, type: "monthly",
  };
}

export function quarterlyPeriod(fyStartYear: number, quarter: number): GSTPeriod {
  // Indian FY: Apr fyStartYear → Mar fyStartYear+1
  // Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar(next year)
  const startMonth = (quarter - 1) * 3 + 4; // 4,7,10,13
  const isQ4 = quarter === 4;
  const startYear = isQ4 ? fyStartYear + 1 : fyStartYear;
  const realStartMonth = isQ4 ? 1 : startMonth;
  const endMonth = realStartMonth + 2;
  const sm = String(realStartMonth).padStart(2, "0");
  const em = String(endMonth).padStart(2, "0");
  const lastDay = new Date(startYear, endMonth, 0).getDate();
  return {
    from: `${startYear}-${sm}-01`,
    to: `${startYear}-${em}-${String(lastDay).padStart(2, "0")}`,
    label: `Q${quarter} FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`,
    fpLabel: `${em}${startYear}`,
    year: fyStartYear, quarter, type: "quarterly",
  };
}

export function currentFinancialYearStart(d = new Date()): number {
  return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
}
