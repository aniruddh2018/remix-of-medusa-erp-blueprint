import type { ParsedData, ImportFileType } from '@/types/dataImport';

function parseCSVText(text: string): { headers: string[]; rows: Record<string, unknown>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() ?? '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export async function parseCSV(file: File): Promise<ParsedData> {
  const text = await file.text();
  const { headers, rows } = parseCSVText(text);
  return { headers, rows, totalRows: rows.length, fileType: 'csv', delimiter: ',' };
}

export async function parseExcel(file: File): Promise<ParsedData> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
  return { headers, rows: jsonData, totalRows: jsonData.length, fileType: 'xlsx' };
}

export async function parseJSON(file: File): Promise<ParsedData> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows, totalRows: rows.length, fileType: 'json' };
}

export async function parseXML(file: File): Promise<ParsedData> {
  const { XMLParser } = await import('fast-xml-parser');

  const text = await file.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (_name, jpath) => {
      // Tally repeats these elements as arrays
      return jpath.includes('LEDGER') ||
        jpath.includes('STOCKITEM') ||
        jpath.includes('BATCH') ||
        jpath.includes('INVOICE') ||
        jpath.includes('LINEITEM') ||
        jpath.includes('item') ||
        jpath.includes('row') ||
        jpath.includes('record');
    },
  });

  const parsed = parser.parse(text);

  // Try to find a repeating data node (Tally wraps in ENVELOPE > BODY > DATA)
  let rows: Record<string, unknown>[] = [];
  let dataNode: any = null;

  // Walk the parsed tree looking for the first array of objects
  function findArrays(obj: any): any[] | null {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) return obj;

    // Check for Tally-style: ENVELOPE > BODY > DATA > COLLECTION > record[]
    if (obj.ENVELOPE?.BODY?.DATA?.COLLECTION) {
      const coll = obj.ENVELOPE.BODY.DATA.COLLECTION;
      // Look for LEDGER, STOCKITEM, etc. arrays
      for (const key of Object.keys(coll)) {
        if (Array.isArray(coll[key])) return coll[key];
      }
    }
    // Check for simpler XML: <root><item>...</item><item>...</item></root>
    for (const key of Object.keys(obj)) {
      const arr = findArrays(obj[key]);
      if (arr) return arr;
    }
    return null;
  }

  const found = findArrays(parsed);
  if (found && found.length > 0 && typeof found[0] === 'object') {
    dataNode = found;
  } else {
    // Fallback: wrap single root
    dataNode = [parsed];
  }

  // Flatten Tally XML records into simple key-value rows
  rows = dataNode.map((record: any) => flattenRecord(record));

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows, totalRows: rows.length, fileType: 'xml' };
}

function flattenRecord(obj: any, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      result[flatKey] = '';
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      // Check if it's a Tally tag-value pair like { NAME: '...', GUID: '...' }
      if (Object.keys(value).length <= 3 && Object.keys(value).every(k => k === k.toUpperCase())) {
        // It's probably a nested record — flatten it in place
        Object.assign(result, flattenRecord(value, flatKey));
      } else if (Object.keys(value).length <= 3 && Object.values(value).every(v => typeof v === 'string' || typeof v === 'number' || v === null || v === undefined)) {
        // Small nested object with simple values — use first string/number value
        const vals = Object.values(value).filter(v => typeof v === 'string' || typeof v === 'number');
        result[key] = vals.length > 0 ? vals[0] : JSON.stringify(value);
      } else {
        Object.assign(result, flattenRecord(value, flatKey));
      }
    } else if (typeof value === 'string' || typeof value === 'number') {
      result[key] = value;
    } else {
      result[key] = JSON.stringify(value);
    }
  }

  return result;
}

export async function parseFile(file: File): Promise<ParsedData> {
  const ext = file.name.split('.').pop()?.toLowerCase() as ImportFileType;
  switch (ext) {
    case 'csv':
      return parseCSV(file);
    case 'xlsx':
    case 'xls':
      return parseExcel(file);
    case 'json':
      return parseJSON(file);
    case 'xml':
      return parseXML(file);
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}

export function detectFileType(fileName: string): ImportFileType | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls' || ext === 'json' || ext === 'xml') return ext;
  return null;
}

export function isTallyAllMasters(text: string): boolean {
  return text.includes('<TALLYREQUEST>Import Data</TALLYREQUEST>') &&
    text.includes('<REPORTNAME>All Masters</REPORTNAME>');
}
