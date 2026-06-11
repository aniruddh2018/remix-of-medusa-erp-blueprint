import { extractItem, parseSaltHeader, type ParsedItem } from './descriptionExtractor';

export interface MargRow extends ParsedItem {
  rowIndex: number;
  raw: { item: string; description: string; rate: number; mrp: number; tax: number };
  purchase_price: number;
  mrp: number;
  gst_percentage: number;
  selected: boolean;
}

const SKIP_FIRST_COL = /^(LIST OF ITEMS|Phone\s*:|E-?Mail|TIN NO|Page\b|Date\b|SNo\.?$)/i;

export async function parseMargWorkbook(file: File): Promise<MargRow[]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  let currentSalt = '';
  let currentSchedule: ParsedItem['schedule'] = 'none';
  let headerSeen = false;
  const out: MargRow[] = [];

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i];
    if (!row || row.every((c) => c == null || c === '')) continue;
    const [c0, c1, c2, c3, c4, c5] = row;

    // Detect column-header row (SNo. | ITEM | DESCRIPTION | RATE | M.R.P. | TAX %)
    if (typeof c0 === 'string' && /^SNo\.?$/i.test(c0.trim())) {
      headerSeen = true;
      continue;
    }
    if (typeof c1 === 'string' && /^I\s*T\s*E\s*M$/i.test(c1.trim())) {
      headerSeen = true;
      continue;
    }
    if (typeof c0 === 'string' && SKIP_FIRST_COL.test(c0.trim())) continue;

    const isNumeric =
      typeof c0 === 'number' ||
      (typeof c0 === 'string' && /^\d+$/.test(c0.trim()));

    // Salt-group header (text in col 0, rest empty) — only valid after column header row
    if (!isNumeric && typeof c0 === 'string' && c1 == null && c2 == null) {
      if (!headerSeen) continue;
      const text = c0.trim();
      if (text.length < 3) continue;
      const { salt, schedule } = parseSaltHeader(text);
      if (salt && salt.length >= 2 && /^[A-Z0-9 ()\-./+&]+$/i.test(salt)) {
        currentSalt = salt;
        currentSchedule = schedule;
      }
      continue;
    }


    if (!isNumeric) continue;

    const item = String(c1 ?? '').trim();
    const desc = String(c2 ?? '').trim();
    if (!item && !desc) continue;

    const parsed = extractItem(item, desc, currentSalt, currentSchedule);
    const mrp = Number(c4) || 0;
    out.push({
      ...parsed,
      rowIndex: i,
      raw: { item, description: desc, rate: Number(c3) || 0, mrp, tax: Number(c5) || 0 },
      purchase_price: Number(c3) || 0,
      mrp,
      gst_percentage: Number(c5) || 0,
      selected: true,
    });
  }

  return out;
}
