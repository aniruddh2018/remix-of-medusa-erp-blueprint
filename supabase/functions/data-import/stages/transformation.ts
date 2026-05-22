// Transformation Engine
// Applied server-side after mapping to transform values before DB insert.
// Called during the 'execute' stage after field mapping is applied.

const DATE_RES = [
  /^\d{2}\/\d{2}\/\d{4}$/,
  /^\d{2}-\d{2}-\d{4}$/,
  /^\d{2}\.\d{2}\.\d{4}$/,
  /^\d{1,2}\/\d{1,2}\/\d{4}$/,
];

function parseDateToISO(value: string): string | null {
  const trimmed = value.trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  for (const re of DATE_RES) {
    if (re.test(trimmed)) {
      const parts = trimmed.split(/[/\-.]/);
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }
  // Try Date parsing as fallback
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return null;
}

function normalizePhone(value: string): string {
  return value.replace(/[\s\-\(\)]/g, "");
}

function normalizeGST(value: string): string {
  return value.replace(/[\s\-]/g, "").toUpperCase();
}

export function applyTransformation(value: unknown, transformation: string | undefined): unknown {
  if (value === null || value === undefined || transformation === undefined || transformation === "") {
    return value;
  }

  const strVal = String(value);

  switch (transformation) {
    case "cast:number": {
      const num = parseFloat(strVal);
      return isNaN(num) ? value : num;
    }

    case "cast:date": {
      const iso = parseDateToISO(strVal);
      return iso ?? value;
    }

    case "cast:boolean":
      return strVal.toLowerCase() === "true" || strVal === "1" || strVal.toLowerCase() === "yes";

    case "trim":
      return strVal.trim();

    case "uppercase":
      return strVal.toUpperCase();

    case "lowercase":
      return strVal.toLowerCase();

    case "phone":
      return normalizePhone(strVal);

    case "gst":
      return normalizeGST(strVal);

    default:
      return value;
  }
}

export function transformRow(
  row: Record<string, unknown>,
  mappings: { sourceField: string; targetField: string; transformation?: string }[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const mapping of mappings) {
    if (!mapping.targetField) continue;
    const rawValue = row[mapping.sourceField];
    const transformed = applyTransformation(rawValue, mapping.transformation);
    result[mapping.targetField] = transformed;
  }

  return result;
}
